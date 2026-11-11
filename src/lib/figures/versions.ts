// The paper's Figure 4b (`BenchmarkVisualizer.plot_performance_across_versions`): the mean runtime
// of each PyNWB method across software environments, one panel per modality (and, for slicing, per
// preload state), with a 95 % bootstrap interval. The Python code fixes the x axis to the paper's
// dated environments; here it is whichever environments the filters select, or the version of any
// tracked package or of Python, so the same figure can ask "what changed with h5py 3.16?".

import { MODALITY_ORDER, type Modality } from "../benchmarkNames";
import { PACKAGES_OF_INTEREST } from "../curation";
import { environmentLabel, type Database } from "../database";
import type { Dataset, Row } from "../filters";
import { PYNWB_READ_ORDER, orderMethods } from "../methods";
import { bootstrapMeanInterval, groupBy, summarize, type Summary } from "../stats";
import { compareVersions } from "../versions";

export type VersionsBenchmark = "time_remote_file_reading" | "time_remote_slicing";

export interface VersionAxis {
  id: string;
  label: string;
}

export const VERSION_AXES: VersionAxis[] = [
  { id: "environment", label: "Software environment" },
  { id: "python", label: "Python version" },
  ...PACKAGES_OF_INTEREST.map((name) => ({ id: `pkg-${name}`, label: `${name} version` })),
];

export interface VersionGroup {
  key: string;
  label: string;
}

export interface VersionPoint {
  group: string;
  summary: Summary;
  interval: [number, number] | null;
}

export interface VersionSeries {
  method: string;
  points: VersionPoint[];
}

export interface VersionPanel {
  modality: Modality;
  /** Null for file reading, which has no preload variants. */
  preloaded: boolean | null;
  series: VersionSeries[];
}

export interface PerformanceAcrossVersions {
  benchmark: VersionsBenchmark;
  axis: string;
  groups: VersionGroup[];
  methods: string[];
  panels: VersionPanel[];
}

function groupOf(row: Row, axis: string, db: Database): VersionGroup {
  const environmentId = row.sample.run.environmentId;
  const environment = db.environments.get(environmentId);
  if (axis === "environment") {
    return { key: environmentId, label: environment?.timepoint ?? environmentLabel(environment, environmentId) };
  }
  const version = axis === "python" ? environment?.pythonVersion : environment?.packagesOfInterest[axis.slice(4)];
  const label = version ?? (environment ? "not installed" : "unknown");
  return { key: label, label };
}

export function performanceAcrossVersions(
  dataset: Dataset,
  benchmark: VersionsBenchmark,
  axis = "environment",
): PerformanceAcrossVersions {
  const rows = dataset.rows(benchmark).filter((row) => PYNWB_READ_ORDER.includes(row.clean) && row.modality !== null);
  const groupLabels = new Map<string, string>();
  const keyed = rows.map((row) => {
    const group = groupOf(row, axis, dataset.db);
    groupLabels.set(group.key, group.label);
    return { row, group: group.key };
  });
  const groups = [...groupLabels.entries()]
    .map(([key, label]) => ({ key, label }))
    .sort((a, b) => (axis === "environment" ? a.label.localeCompare(b.label) : compareVersions(a.label, b.label)));
  const methods = orderMethods(rows.map((row) => row.clean));
  const preloadStates: (boolean | null)[] = benchmark === "time_remote_slicing" ? [false, true] : [null];
  const cells = groupBy(keyed, ({ row, group }) => [row.modality, row.isPreloaded, row.clean, group] as const);

  const panels: VersionPanel[] = [];
  for (const preloaded of preloadStates) {
    for (const modality of MODALITY_ORDER) {
      const series = methods
        .map((method) => ({
          method,
          points: groups.flatMap((group): VersionPoint[] => {
            const cell = cells.get(JSON.stringify([modality, preloaded ?? false, method, group.key]));
            if (!cell) return [];
            const values = cell.items.map(({ row }) => row.value);
            return [{ group: group.key, summary: summarize(values), interval: bootstrapMeanInterval(values) }];
          }),
        }))
        .filter((line) => line.points.length > 0);
      if (series.length) panels.push({ modality, preloaded, series });
    }
  }
  return { benchmark, axis, groups, methods, panels };
}
