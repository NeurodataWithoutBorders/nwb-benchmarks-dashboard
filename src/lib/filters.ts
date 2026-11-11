// Which runs the figures draw from. nwb-benchmarks' `generate_figures` fixes one selection (the
// LBNL Mac, results since 2025-11-01, one or all of the paper's environments); here every piece of
// run metadata is a facet the reader can narrow, and the paper's selections are presets.

import type { Modality } from "./benchmarkNames";
import {
  ENVIRONMENT_TIMEPOINTS,
  LBL_MAC_MACHINE_IDS,
  PACKAGES_OF_INTEREST,
  PAPER_EXCLUDE_OLDER,
  PAPER_REFERENCE_TIMEPOINT,
  isExcludedSample,
} from "./curation";
import { environmentLabel, machineLabel, type Database, type Run, type Sample } from "./database";
import { compareVersions } from "./versions";

export interface FacetDefinition {
  key: string;
  label: string;
  valueOf: (run: Run, db: Database) => string;
  labelOf: (value: string, db: Database) => string;
  compare: (a: string, b: string, db: Database) => number;
}

const UNKNOWN = "unknown";
const byText = (a: string, b: string): number => a.localeCompare(b);
const byVersion = (a: string, b: string): number => {
  if (a === UNKNOWN || b === UNKNOWN) return a === b ? 0 : a === UNKNOWN ? 1 : -1;
  return compareVersions(a, b);
};
const asIs = (value: string): string => value;

function environmentSortKey(id: string, db: Database): string {
  const environment = db.environments.get(id);
  // Paper environments first, by date; then the rest by their label.
  return environment?.timepoint ? `0 ${environment.timepoint}` : `1 ${environmentLabel(environment, id)}`;
}

export const FACETS: FacetDefinition[] = [
  {
    key: "machine",
    label: "Machine",
    valueOf: (run) => run.machineId,
    labelOf: (value, db) => machineLabel(db.machines.get(value), value),
    compare: (a, b, db) => machineLabel(db.machines.get(a), a).localeCompare(machineLabel(db.machines.get(b), b)),
  },
  {
    key: "system",
    label: "Operating system",
    valueOf: (run, db) => db.machines.get(run.machineId)?.system ?? UNKNOWN,
    labelOf: asIs,
    compare: byText,
  },
  {
    key: "cpu",
    label: "CPU",
    valueOf: (run, db) => db.machines.get(run.machineId)?.cpu ?? UNKNOWN,
    labelOf: asIs,
    compare: byText,
  },
  {
    key: "environment",
    label: "Software environment",
    valueOf: (run) => run.environmentId,
    labelOf: (value, db) => environmentLabel(db.environments.get(value), value),
    compare: (a, b, db) => environmentSortKey(a, db).localeCompare(environmentSortKey(b, db)),
  },
  {
    key: "python",
    label: "Python",
    valueOf: (run, db) => db.environments.get(run.environmentId)?.pythonVersion ?? UNKNOWN,
    labelOf: asIs,
    compare: byVersion,
  },
  ...PACKAGES_OF_INTEREST.map((name): FacetDefinition => ({
    key: `pkg-${name}`,
    label: name,
    valueOf: (run, db) => {
      const environment = db.environments.get(run.environmentId);
      if (!environment) return UNKNOWN;
      return environment.packagesOfInterest[name] ?? "not installed";
    },
    labelOf: asIs,
    compare: byVersion,
  })),
  {
    key: "commit",
    label: "Benchmark suite commit",
    valueOf: (run) => run.commitHash,
    labelOf: (value) => value.slice(0, 7) || UNKNOWN,
    compare: byText,
  },
  {
    key: "results-version",
    label: "Results format",
    valueOf: (run) => run.databaseVersion,
    labelOf: asIs,
    compare: byVersion,
  },
];

const FACET_BY_KEY = new Map(FACETS.map((facet) => [facet.key, facet]));

/** The facets every run is described by, in the order the filters list them. */
export const PACKAGE_FACET_KEYS = PACKAGES_OF_INTEREST.map((name) => `pkg-${name}`);

export interface FilterState {
  /** Inclusive, `YYYY-MM-DD`, or null for no bound. */
  from: string | null;
  to: string | null;
  /** Drops the samples on the curated exclusion list (curation.ts). */
  applyExclusions: boolean;
  /** The values each facet is narrowed to; a facet that is absent allows every value. */
  selected: Record<string, string[]>;
}

export const ALL_DATA: FilterState = { from: null, to: null, applyExclusions: true, selected: {} };

/** The two selections `nwb_benchmarks generate_figures` draws the manuscript's figures from. */
export type ManuscriptSelection = "reference" | "timepoints";

function paperSelection(environmentIds: string[]): FilterState {
  return {
    from: PAPER_EXCLUDE_OLDER,
    to: null,
    applyExclusions: true,
    selected: { machine: [...LBL_MAC_MACHINE_IDS], environment: environmentIds },
  };
}

export const MANUSCRIPT_SELECTIONS: Record<ManuscriptSelection, FilterState> = {
  reference: paperSelection([ENVIRONMENT_TIMEPOINTS[PAPER_REFERENCE_TIMEPOINT]]),
  timepoints: paperSelection(Object.values(ENVIRONMENT_TIMEPOINTS)),
};

export type FigureId = "rankings" | "traffic" | "versions" | "incremental";

/** Which selection each figure takes in the manuscript view, as the Python pipeline draws them: the
 * single-environment figures for the reference environment, the comparison across environments (and the
 * incremental slicing figure, which only the later environments ran) for all the dated ones. */
export const MANUSCRIPT_FIGURE_SELECTIONS: Record<FigureId, ManuscriptSelection> = {
  rankings: "reference",
  traffic: "reference",
  versions: "timepoints",
  incremental: "timepoints",
};

export const MANUSCRIPT_DESCRIPTION =
  `The manuscript's selections: the LBNL Mac, results since ${PAPER_EXCLUDE_OLDER}, ` +
  `the ${PAPER_REFERENCE_TIMEPOINT} environment for Figures 3 and 5, ` +
  `and the ${Object.keys(ENVIRONMENT_TIMEPOINTS).length} dated environments for Figure 4b and incremental slicing.`;

export function cloneState(state: FilterState): FilterState {
  return {
    ...state,
    selected: Object.fromEntries(Object.entries(state.selected).map(([key, values]) => [key, [...values]])),
  };
}

/** Every result: the dashboard's starting point. */
export function defaultState(): FilterState {
  return cloneState(ALL_DATA);
}

/** Whether two states select the same runs. */
export function sameState(a: FilterState, b: FilterState): boolean {
  const normalize = (state: FilterState): string =>
    JSON.stringify([
      state.from,
      state.to,
      state.applyExclusions,
      Object.entries(state.selected)
        .map(([key, values]) => [key, [...values].sort()])
        .sort(([x], [y]) => String(x).localeCompare(String(y))),
    ]);
  return normalize(a) === normalize(b);
}

function runPasses(run: Run, db: Database, state: FilterState, skipFacet: string | null): boolean {
  if (state.from !== null && run.timestamp < `${state.from}-00-00-00`) return false;
  if (state.to !== null && run.timestamp > `${state.to}-23-59-59`) return false;
  for (const [key, values] of Object.entries(state.selected)) {
    if (key === skipFacet) continue;
    const facet = FACET_BY_KEY.get(key);
    if (facet && !values.includes(facet.valueOf(run, db))) return false;
  }
  return true;
}

export interface FacetOption {
  value: string;
  label: string;
  /** Runs with this value that every other filter lets through. */
  count: number;
  selected: boolean;
}

/** Every facet's values, counted against the other filters (so a count is what picking it adds). */
export function facetOptions(db: Database, state: FilterState): Map<string, FacetOption[]> {
  const options = new Map<string, FacetOption[]>();
  for (const facet of FACETS) {
    const counts = new Map<string, number>();
    for (const run of db.runs) {
      const value = facet.valueOf(run, db);
      if (!counts.has(value)) counts.set(value, 0);
      if (runPasses(run, db, state, facet.key)) counts.set(value, (counts.get(value) ?? 0) + 1);
    }
    const selected = facet.key in state.selected ? state.selected[facet.key] : null;
    // A value the state names but the data lacks still shows, so it can be unticked.
    for (const value of selected ?? []) if (!counts.has(value)) counts.set(value, 0);
    options.set(
      facet.key,
      [...counts.entries()]
        .sort(([a], [b]) => facet.compare(a, b, db))
        .map(([value, count]) => ({
          value,
          label: facet.labelOf(value, db),
          count,
          selected: selected ? selected.includes(value) : true,
        })),
    );
  }
  return options;
}

export interface Row {
  sample: Sample;
  type: string;
  clean: string;
  modality: Modality | null;
  isPreloaded: boolean;
  /** The dense rank of the case's slice size within its modality, over the filtered data. */
  sliceNumber: number | null;
  variable: string;
  value: number;
  valueIndex: number;
}

/** The samples a filter state lets through, with the per-selection fields the figures need. */
export class Dataset {
  readonly runs: Run[];
  readonly samples: Sample[];
  readonly excluded: number;
  private readonly sliceNumbers = new Map<Sample, number | null>();
  private readonly rowsByType = new Map<string, Row[]>();

  constructor(
    readonly db: Database,
    readonly state: FilterState,
  ) {
    this.runs = db.runs.filter((run) => runPasses(run, db, state, null));
    const kept = new Set(this.runs);
    let excluded = 0;
    this.samples = db.samples.filter((sample) => {
      if (!kept.has(sample.run)) return false;
      if (
        state.applyExclusions &&
        isExcludedSample(sample.run.machineId, sample.run.timestamp, sample.benchmarkName, sample.parameterCaseName)
      ) {
        excluded++;
        return false;
      }
      return true;
    });
    this.excluded = excluded;
    this.rankSliceSizes();
  }

  /** `scaling_value.rank("dense").over("modality")`, as `_preprocess_results` computes it. */
  private rankSliceSizes(): void {
    const sizesByModality = new Map<string | null, Set<number>>();
    for (const sample of this.samples) {
      if (sample.scalingValue === null) continue;
      let sizes = sizesByModality.get(sample.modality);
      if (!sizes) sizesByModality.set(sample.modality, (sizes = new Set()));
      sizes.add(sample.scalingValue);
    }
    const ranks = new Map<string | null, Map<number, number>>();
    for (const [modality, sizes] of sizesByModality) {
      ranks.set(modality, new Map([...sizes].sort((a, b) => a - b).map((size, index) => [size, index + 1])));
    }
    for (const sample of this.samples) {
      const rank = sample.scalingValue === null ? null : (ranks.get(sample.modality)?.get(sample.scalingValue) ?? null);
      this.sliceNumbers.set(sample, rank);
    }
  }

  sliceNumber(sample: Sample): number | null {
    return this.sliceNumbers.get(sample) ?? null;
  }

  /** Every value of every sample of one benchmark type (`BenchmarkDatabase.filter_tests`). */
  rows(type: string): Row[] {
    const cached = this.rowsByType.get(type);
    if (cached) return cached;
    const rows: Row[] = [];
    for (const sample of this.samples) {
      if (sample.type !== type) continue;
      const sliceNumber = this.sliceNumber(sample);
      for (const [variable, values] of sample.variables) {
        values.forEach((value, valueIndex) => {
          rows.push({
            sample,
            type,
            clean: sample.clean,
            modality: sample.modality,
            isPreloaded: sample.isPreloaded,
            sliceNumber,
            variable,
            value,
            valueIndex,
          });
        });
      }
    }
    this.rowsByType.set(type, rows);
    return rows;
  }

  /** The distinct environments among the selected runs. */
  environmentIds(): string[] {
    return [...new Set(this.runs.map((run) => run.environmentId))];
  }
}

export function applyFilters(db: Database, state: FilterState): Dataset {
  return new Dataset(db, state);
}

// ----------------------------------------------------------------------------------------------
// The URL form of a filter state, so a view can be linked to: `?from=2025-11-01&machine=<id>&...`.
// ----------------------------------------------------------------------------------------------

const RESERVED_PARAMS = new Set(["from", "to", "exclusions"]);

/** `?manuscript`: the view that reproduces the manuscript's figures, each from its own selection. */
export const MANUSCRIPT_PARAM = "manuscript";

export function isManuscriptSearch(search: string): boolean {
  return new URLSearchParams(search).has(MANUSCRIPT_PARAM);
}

/** The URL of the manuscript view: `?manuscript`, in place of any filters. */
export function manuscriptSearch(search: string): string {
  const params = new URLSearchParams(search);
  for (const key of [...RESERVED_PARAMS, ...FACETS.map((facet) => facet.key)]) params.delete(key);
  params.set(MANUSCRIPT_PARAM, "");
  return `?${params.toString().replace(/=(?=&|$)/g, "")}`;
}

/** Writes the state into a copy of `search`, leaving params it does not own (such as `test`) alone. */
export function stateToSearch(state: FilterState, search: string): string {
  const params = new URLSearchParams(search);
  for (const key of [MANUSCRIPT_PARAM, ...RESERVED_PARAMS, ...FACETS.map((facet) => facet.key)]) params.delete(key);
  if (state.from) params.set("from", state.from);
  if (state.to) params.set("to", state.to);
  if (!state.applyExclusions) params.set("exclusions", "off");
  for (const facet of FACETS) {
    for (const value of state.selected[facet.key] ?? []) params.append(facet.key, value);
  }
  const text = params.toString().replace(/=(?=&|$)/g, "");
  return text ? `?${text}` : "";
}

/** Reads a state out of the URL, or null when the URL names no filter at all. */
export function stateFromSearch(search: string): FilterState | null {
  const params = new URLSearchParams(search);
  const owned = [...RESERVED_PARAMS, ...FACETS.map((facet) => facet.key)];
  if (!owned.some((key) => params.has(key))) return null;
  const date = (value: string | null): string | null => (value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null);
  const selected: Record<string, string[]> = {};
  for (const facet of FACETS) {
    const values = params.getAll(facet.key).filter((value) => value !== "");
    if (values.length) selected[facet.key] = values;
  }
  return {
    from: date(params.get("from")),
    to: date(params.get("to")),
    applyExclusions: params.get("exclusions") !== "off",
    selected,
  };
}

/** The one-line description of a dataset the filters card shows. */
export function describeDataset(dataset: Dataset): string {
  const machines = new Set(dataset.runs.map((run) => run.machineId)).size;
  const environments = dataset.environmentIds().length;
  const plural = (count: number, word: string): string =>
    `${count.toLocaleString("en-US")} ${word}${count === 1 ? "" : "s"}`;
  const parts = [
    plural(dataset.runs.length, "results file"),
    plural(machines, "machine"),
    plural(environments, "environment"),
  ];
  const excluded = dataset.excluded ? `, ${plural(dataset.excluded, "curated exclusion")} applied` : "";
  return `${parts.join(" · ")}${excluded}`;
}
