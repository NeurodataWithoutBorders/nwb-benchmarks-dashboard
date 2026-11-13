// Reads a results bundle (every JSON file of nwb-benchmarks-results, keyed by its path in that
// repository) into machines, environments, runs and samples: what nwb-benchmarks' `Machine`,
// `Environment` and `Results` models and `_preprocess_results` produce, minus the filtering, which
// lives in filters.ts so that it can change without reading the bundle again.

import { benchmarkNameParts, modalityOf, scalingValueOf, type Modality } from "./benchmarkNames";
import { PACKAGES_OF_INTEREST, TIMEPOINT_BY_ENVIRONMENT, canonicalEnvironmentId } from "./curation";
import { parseParameterCase, type PyDict } from "./pyLiteral";
import { numericVersion } from "./versions";

/** One JSON file per key, as nwb-benchmarks-results' `dist` branch publishes them. */
export type Bundle = Record<string, unknown>;

export interface Machine {
  id: string;
  name: string;
  version: string | null;
  /** `platform.system`, such as Darwin, Linux or Windows. */
  system: string | null;
  platform: string | null;
  cpu: string | null;
  architecture: string | null;
  cpuCount: number | null;
  memoryBytes: number | null;
}

export interface Environment {
  id: string;
  /** The interpreter banner the environment file is keyed by. */
  preamble: string;
  pythonVersion: string | null;
  /** Every package with its version (and conda build, where conda listed it). */
  packages: Record<string, string>;
  /** The packages the figures track, reduced to their numeric version. */
  packagesOfInterest: Record<string, string>;
  /** The paper's date for this environment, or null for one it does not name. */
  timepoint: string | null;
}

export interface Run {
  /** The results file's path in the repository. */
  key: string;
  /** `YYYY-MM-DD-HH-MM-SS`, as in the results file. */
  timestamp: string;
  commitHash: string;
  environmentId: string;
  machineId: string;
  databaseVersion: string;
}

export interface Sample {
  run: Run;
  benchmarkName: string;
  parameterCase: PyDict;
  parameterCaseName: string | null;
  modality: Modality | null;
  type: string;
  test: string;
  operation: string;
  label: string | null;
  clean: string;
  isPreloaded: boolean;
  isLocal: boolean;
  scalingValue: number | null;
  /** Each recorded variable (`time` for a timing benchmark) and its values in order. */
  variables: [string, number[]][];
}

export interface Database {
  machines: Map<string, Machine>;
  environments: Map<string, Environment>;
  runs: Run[];
  samples: Sample[];
  /** Results files that could not be read at all. */
  skipped: { unreadable: number };
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function asString(value: unknown): string | null {
  if (typeof value === "string") return value;
  if (typeof value === "number") return String(value);
  return null;
}

function asNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "" && Number.isFinite(Number(value))) return Number(value);
  return null;
}

function idFromKey(key: string, prefix: string): string {
  const filename = key.slice(key.lastIndexOf("/") + 1);
  return filename.replace(/\.json$/, "").replace(prefix, "");
}

export function readMachine(key: string, data: unknown): Machine {
  const record = asRecord(data);
  const platform = asRecord(record.platform);
  const asv = asRecord(record.asv);
  const os = asRecord(record.os);
  const psutil = asRecord(record.psutil);
  const architecture = platform.architecture;
  return {
    id: idFromKey(key, "machine-"),
    name: asString(record.name) ?? "",
    version: asString(record.version),
    system: asString(platform.system),
    platform: asString(platform.platform),
    cpu: asString(asv.cpu),
    architecture: asString(platform.machine) ?? (Array.isArray(architecture) ? asString(architecture[0]) : null),
    cpuCount: asNumber(os.cpu_count) ?? asNumber(asv.num_cpu),
    memoryBytes: asNumber(psutil.total_virtual_memory) ?? asNumber(asv.ram),
  };
}

/** The conda list entries, as `version (build)`; pip-installed ones carry a build too. */
function listedPackages(listed: unknown): Record<string, string> {
  const packages: Record<string, string> = {};
  if (!Array.isArray(listed)) return packages;
  for (const entry of listed) {
    const item = asRecord(entry);
    const name = asString(item.name);
    if (Object.keys(item).length >= 3 && name !== null) {
      packages[name] = `${asString(item.version)} (${asString(item.build)})`;
    }
  }
  return packages;
}

/** Adds what the `runtime` section (database version 5) records: the interpreter's own packages
 * where conda did not list them, and the runtime versions under a `runtime_` prefix. */
function addRuntimePackages(packages: Record<string, string>, runtime: Record<string, unknown>): void {
  const distributions: unknown[] = Array.isArray(runtime.python_distributions) ? runtime.python_distributions : [];
  for (const entry of distributions) {
    const item = asRecord(entry);
    const name = asString(item.name);
    const version = asString(item.version);
    if (name !== null && version !== null && !(name in packages)) packages[name] = version;
  }
  for (const [name, version] of Object.entries(asRecord(runtime.runtime_versions))) {
    const text = asString(version);
    if (text !== null) packages[`runtime_${name}`] = text;
  }
}

/** `Environment.safe_load_from_json`, or null where it would skip the file. */
export function readEnvironment(key: string, data: unknown): Environment | null {
  const record = asRecord(data);
  const legacyKeys = Object.keys(record).filter((name) => name !== "runtime");
  if (legacyKeys.length !== 1) return null;
  const preamble = legacyKeys[0];
  const packages = listedPackages(record[preamble]);
  addRuntimePackages(packages, asRecord(record.runtime));
  if (Object.keys(packages).length === 0) return null;
  const id = idFromKey(key, "environment-");
  const packagesOfInterest: Record<string, string> = {};
  for (const name of PACKAGES_OF_INTEREST) {
    const version = numericVersion(packages[name]);
    if (version !== null) packagesOfInterest[name] = version;
  }
  return {
    id,
    preamble,
    pythonVersion: numericVersion("python" in packages ? packages.python : preamble),
    packages,
    packagesOfInterest,
    timepoint: TIMEPOINT_BY_ENVIRONMENT[id] ?? null,
  };
}

/** `Results.normalize_time_and_network_results`: every value list-valued, plus the per-packet time. */
export function normalizeResults(results: unknown): [string, number[]][] {
  const toValues = (value: unknown): number[] =>
    (Array.isArray(value) ? value : [value]).map((item) => (typeof item === "number" ? item : Number.NaN));
  if (typeof results !== "object" || results === null || Array.isArray(results)) {
    return [["time", toValues(results)]];
  }
  const record = results as Record<string, unknown>;
  const variables: [string, number[]][] = Object.entries(record).map(([name, value]) => [name, toValues(value)]);
  if ("total_traffic_in_number_of_web_packets" in record) {
    const packets = Number(record.total_traffic_in_number_of_web_packets);
    const transferTime = Number(record.total_transfer_time_in_seconds);
    variables.push(["mean_time_per_web_packet", [packets !== 0 ? transferTime / packets : Number.NaN]]);
  }
  return variables;
}

/** What a results file's name says of it: `timestamp-<t>_machine-<id>_environment-<id>_results.json`. */
function fromKey(key: string, field: "timestamp" | "machine" | "environment"): string | null {
  return new RegExp(`${field}-([^_/]+)`).exec(key)?.[1] ?? null;
}

const UNKNOWN_ID = "unknown";

/** A results file of any format: the current one, or the older ones (before 3.0.0) that name the machine
 * and environment by hash, and leave out the format version or the IDs altogether. */
function readRun(key: string, data: unknown): { run: Run; results: Record<string, unknown> } | null {
  const record = asRecord(data);
  const timestamp = asString(record.timestamp) ?? fromKey(key, "timestamp");
  if (timestamp === null) return null;
  const machineId = asString(record.machine_id) ?? asString(record.machine_hash) ?? fromKey(key, "machine");
  const environmentId =
    asString(record.environment_id) ?? asString(record.environment_hash) ?? fromKey(key, "environment");
  return {
    run: {
      key,
      timestamp,
      commitHash: asString(record.commit_hash) ?? "",
      environmentId: canonicalEnvironmentId(environmentId ?? UNKNOWN_ID),
      machineId: machineId ?? UNKNOWN_ID,
      databaseVersion: asString(record.database_version) ?? UNKNOWN_ID,
    },
    results: asRecord(record.results),
  };
}

/** One sample per benchmark and parameter case of a results file. */
function readSamples(run: Run, results: Record<string, unknown>, caseCache: Map<string, PyDict>): Sample[] {
  const samples: Sample[] = [];
  for (const [benchmarkName, cases] of Object.entries(results)) {
    const parts = benchmarkNameParts(benchmarkName);
    for (const [caseKey, caseResults] of Object.entries(asRecord(cases))) {
      let parameterCase = caseCache.get(caseKey);
      if (!parameterCase) {
        parameterCase = parseParameterCase(caseKey);
        caseCache.set(caseKey, parameterCase);
      }
      const parameterCaseName = asString(parameterCase.name);
      samples.push({
        run,
        benchmarkName,
        parameterCase,
        parameterCaseName,
        modality: modalityOf(parameterCaseName),
        ...parts,
        scalingValue: scalingValueOf(parameterCase),
        variables: normalizeResults(caseResults),
      });
    }
  }
  return samples;
}

/** The modality an NWB object's type belongs to, for cases recorded without a case name. */
export function modalityOfObject(objectName: string): Modality | null {
  if (/ElectricalSeries|LFP|Units|Spike/i.test(objectName)) return "Ecephys";
  if (/Photon|Imaging|Plane|Roi|Fluorescence|Segmentation/i.test(objectName)) return "Ophys";
  if (/Clamp|Icephys|Intracellular|CurrentClamp|VoltageClamp/i.test(objectName)) return "Icephys";
  return null;
}

/** Cases written before format 3.0.0 have no name to read a modality from: they take the modality of a
 * named case on the same file, or failing that the one their NWB object's type suggests. */
function inferModalities(samples: Sample[]): void {
  const byUrl = new Map<string, Modality>();
  for (const sample of samples) {
    const url = asString(sample.parameterCase.https_url);
    if (sample.modality !== null && url !== null) byUrl.set(url, sample.modality);
  }
  for (const sample of samples) {
    if (sample.modality !== null || "name" in sample.parameterCase) continue;
    const url = asString(sample.parameterCase.https_url);
    const objectName = asString(sample.parameterCase.object_name);
    sample.modality = (url !== null ? byUrl.get(url) : undefined) ?? (objectName ? modalityOfObject(objectName) : null);
  }
}

/** Reads every machine, environment and results file of a bundle, whatever format it was written in. */
export function readDatabase(bundle: Bundle): Database {
  const machines = new Map<string, Machine>();
  const environments = new Map<string, Environment>();
  const runs: Run[] = [];
  const samples: Sample[] = [];
  const skipped = { unreadable: 0 };
  const caseCache = new Map<string, PyDict>();

  for (const [key, data] of Object.entries(bundle)) {
    if (key.startsWith("machines/")) {
      const machine = readMachine(key, data);
      machines.set(machine.id, machine);
    } else if (key.startsWith("environments/")) {
      const environment = readEnvironment(key, data);
      if (environment) environments.set(environment.id, environment);
    } else if (key.startsWith("results/")) {
      const read = readRun(key, data);
      if (read === null) {
        skipped.unreadable++;
        continue;
      }
      runs.push(read.run);
      samples.push(...readSamples(read.run, read.results, caseCache));
    }
  }
  inferModalities(samples);
  runs.sort((a, b) => a.timestamp.localeCompare(b.timestamp) || a.key.localeCompare(b.key));
  return { machines, environments, runs, samples, skipped };
}

/** A short, readable name for an environment: its paper date, or its Python and PyNWB versions. */
export function environmentLabel(environment: Environment | undefined, id: string): string {
  const short = id.slice(0, 7);
  if (!environment) return `unknown environment (${short})`;
  if (environment.timepoint) return `${environment.timepoint} (${short})`;
  const pynwb = environment.packagesOfInterest.pynwb;
  const python = environment.pythonVersion ? `Python ${environment.pythonVersion}` : "Python ?";
  return `${python}${pynwb ? `, PyNWB ${pynwb}` : ""} (${short})`;
}

/** A short, readable name for a machine: its friendly name and the start of its ID. */
export function machineLabel(machine: Machine | undefined, id: string): string {
  const short = id.slice(0, 7);
  return machine?.name ? `${machine.name} (${short})` : `unknown machine (${short})`;
}

/** The latest timestamp among the runs, as `YYYY-MM-DD`, or null for none. */
export function latestRunDate(runs: readonly Run[]): string | null {
  const latest = runs.reduce<string | null>(
    (max, run) => (max === null || run.timestamp > max ? run.timestamp : max),
    null,
  );
  return latest === null ? null : latest.slice(0, 10);
}
