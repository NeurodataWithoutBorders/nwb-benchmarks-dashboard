// How nwb-benchmarks turns a benchmark's dotted name and parameter case into the fields its figures
// group by (`BenchmarkDatabase._preprocess_results`). Each step mirrors one polars expression there,
// including which of them replace only the first match (polars' `str.replace`) and which replace
// every match (Python's `str.replace` and polars' `str.replace_all`).

import type { PyDict } from "./pyLiteral";

export type Modality = "Ecephys" | "Ophys" | "Icephys";
export const MODALITY_ORDER: Modality[] = ["Ecephys", "Ophys", "Icephys"];

/** The name-derived fields of one benchmark, independent of its parameter case. */
export interface BenchmarkNameParts {
  /** The benchmark module, such as `time_remote_file_reading`. */
  type: string;
  test: string;
  operation: string;
  label: string | null;
  /** The method name the figures group by, such as `hdf5 pynwb fsspec https no cache`. */
  clean: string;
  isPreloaded: boolean;
  isLocal: boolean;
}

const LABEL_PATTERN = /(IncrementalSliceBenchmark|ContinuousSliceBenchmark|FileReadBenchmark|DownloadBenchmark)/;

/** `BenchmarkDatabase.split_camel_case`. */
export function splitCamelCase(text: string): string {
  let result = text.replace(/PyNWBS3/g, "PyNWB S3").replace(/NWBROS3/g, "NWB ROS3");
  result = result.replace(/([a-z0-9])([A-Z])/g, "$1 $2");
  result = result.replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2");
  return result.replace(/Py NWB/g, "PyNWB");
}

/** `BenchmarkDatabase.clean_benchmark_name_test`. */
export function cleanBenchmarkNameTest(name: string): string {
  const short = name
    .replaceAll("ContinuousSliceBenchmark", "")
    .replaceAll("FileReadBenchmark", "")
    .replaceAll("DownloadBenchmark", "")
    .replaceAll("IncrementalSliceBenchmark", "");
  return splitCamelCase(short).toLowerCase();
}

const partsCache = new Map<string, BenchmarkNameParts>();

/** The fields `_preprocess_results` derives from a benchmark's dotted name. */
export function benchmarkNameParts(benchmarkName: string): BenchmarkNameParts {
  const cached = partsCache.get(benchmarkName);
  if (cached) return cached;
  const [type = "", rawTest = "", rawOperation = ""] = benchmarkName.split(".");
  let operation = rawOperation
    .replace("time_read_", "")
    .replace("track_network_read_", "")
    .replace("time_download_", "")
    .replace("zarrpython", "zarr")
    .replaceAll("_", " ");
  const label = LABEL_PATTERN.exec(rawTest)?.[1] ?? null;
  let test = cleanBenchmarkNameTest(rawTest);
  const isPreloaded = test.includes("preloaded");
  test = test.replace(" preloaded", "");
  const isLocal = benchmarkName.includes("local");
  // The operation rewrite reads the test name as it was before this step drops " local".
  const testBeforeLocal = test;
  test = test.replace(" local", "").replace("json", "pynwb");
  if (operation.includes("local")) {
    operation = operation.replace(/local (.*)/, (_match, rest: string) => `${testBeforeLocal} ${rest}`);
  }
  let clean = test;
  if (label === "FileReadBenchmark" || label === "DownloadBenchmark") clean = operation;
  const parts = { type, test, operation, label, clean, isPreloaded, isLocal };
  partsCache.set(benchmarkName, parts);
  return parts;
}

/** The modality a parameter case name starts with, or null. */
export function modalityOf(parameterCaseName: string | null): Modality | null {
  if (parameterCaseName === null) return null;
  const match = /^(Ophys|Ecephys|Icephys)/.exec(parameterCaseName);
  return match ? (match[1] as Modality) : null;
}

/** The stop of the first slice of a case's `slice_range`, which ranks its slice size. */
export function scalingValueOf(parameterCase: PyDict): number | null {
  const range = parameterCase.slice_range;
  const first = Array.isArray(range) ? range[0] : null;
  if (typeof first !== "string") return null;
  const match = /slice\(0, (\d+),/.exec(first);
  return match ? Number(match[1]) : null;
}
