// Which runs the figures draw from. nwb-benchmarks' `generate_figures` fixes one selection (the
// LBNL Mac, results since 2025-11-01, one or all of the paper's environments); here every piece of
// run metadata is a facet the search (search.ts) can narrow, and the paper's selections are the
// manuscript view.

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
  /** The facet's search key, as in `machine:` or `pynwb:`. */
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
    key: "os",
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
    key: name,
    label: `${name} version`,
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
    key: "format",
    label: "Results format version",
    valueOf: (run) => run.databaseVersion,
    labelOf: asIs,
    compare: byVersion,
  },
];

export const FACET_BY_KEY = new Map(FACETS.map((facet) => [facet.key, facet]));

export interface FilterState {
  /** Inclusive, `YYYY-MM-DD`, or null for no bound. */
  from: string | null;
  to: string | null;
  /** Drops the samples on the curated exclusion list (curation.ts). */
  applyExclusions: boolean;
  /** The values each facet is narrowed to; a facet that is absent allows every value. */
  selected: Record<string, string[]>;
  /** Free text, every piece of which has to appear in one of a run's facet values. */
  text: string[];
}

export const ALL_DATA: FilterState = { from: null, to: null, applyExclusions: true, selected: {}, text: [] };

/** The two selections `nwb_benchmarks generate_figures` draws the manuscript's figures from. */
export type ManuscriptSelection = "reference" | "timepoints";

function paperSelection(environmentIds: string[]): FilterState {
  return {
    from: PAPER_EXCLUDE_OLDER,
    to: null,
    applyExclusions: true,
    selected: { machine: [...LBL_MAC_MACHINE_IDS], environment: environmentIds },
    text: [],
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
  `the ${PAPER_REFERENCE_TIMEPOINT} environment for the method rankings and network traffic, ` +
  `and the ${Object.keys(ENVIRONMENT_TIMEPOINTS).length} dated environments for the comparison across versions ` +
  `and incremental slicing.`;

/** Lowercases, strips accents and collapses whitespace, so text compares as a reader would. */
export function normalize(text: string): string {
  return text.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replace(/\s+/g, " ").trim();
}

const runTexts = new WeakMap<Run, string>();

/** Every facet value of a run, labels and raw values both, for free-text search. */
function runText(run: Run, db: Database): string {
  let text = runTexts.get(run);
  if (text === undefined) {
    text = normalize(
      FACETS.map((facet) => {
        const value = facet.valueOf(run, db);
        return `${facet.labelOf(value, db)} ${value}`;
      }).join(" "),
    );
    runTexts.set(run, text);
  }
  return text;
}

function runPasses(run: Run, db: Database, state: FilterState): boolean {
  if (state.from !== null && run.timestamp < `${state.from}-00-00-00`) return false;
  if (state.to !== null && run.timestamp > `${state.to}-23-59-59`) return false;
  for (const [key, values] of Object.entries(state.selected)) {
    const facet = FACET_BY_KEY.get(key);
    if (facet && !values.includes(facet.valueOf(run, db))) return false;
  }
  return state.text.every((text) => runText(run, db).includes(text));
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
    this.runs = db.runs.filter((run) => runPasses(run, db, state));
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
// The URL: `?q=<search>` for the search (search.ts), or `?manuscript` for the manuscript view.
// ----------------------------------------------------------------------------------------------

export const QUERY_PARAM = "q";

/** `?manuscript`: the view that reproduces the manuscript's figures, each from its own selection. */
export const MANUSCRIPT_PARAM = "manuscript";

export function isManuscriptSearch(search: string): boolean {
  return new URLSearchParams(search).has(MANUSCRIPT_PARAM);
}

function writeParams(params: URLSearchParams): string {
  const text = params.toString().replace(/=(?=&|$)/g, "");
  return text ? `?${text}` : "";
}

/** The URL of the manuscript view: `?manuscript`, in place of any search. */
export function manuscriptSearch(search: string): string {
  const params = new URLSearchParams(search);
  params.delete(QUERY_PARAM);
  params.set(MANUSCRIPT_PARAM, "");
  return writeParams(params);
}

/** Writes the search into a copy of `search`, leaving the manuscript view and keeping params it does
 * not own (such as `test`). */
export function querySearch(query: string, search: string): string {
  const params = new URLSearchParams(search);
  params.delete(MANUSCRIPT_PARAM);
  if (query.trim()) params.set(QUERY_PARAM, query.trim());
  else params.delete(QUERY_PARAM);
  return writeParams(params);
}

/** The search the URL holds, or an empty one. */
export function queryFromSearch(search: string): string {
  return new URLSearchParams(search).get(QUERY_PARAM) ?? "";
}

export interface Totals {
  runs: number;
  machines: number;
  environments: number;
  benchmarks: number;
  cases: number;
  excluded: number;
}

/** What a selection holds, for the summary's totals. */
export function datasetTotals(dataset: Dataset): Totals {
  return {
    runs: dataset.runs.length,
    machines: new Set(dataset.runs.map((run) => run.machineId)).size,
    environments: dataset.environmentIds().length,
    benchmarks: new Set(dataset.samples.map((sample) => sample.benchmarkName)).size,
    cases: dataset.samples.length,
    excluded: dataset.excluded,
  };
}
