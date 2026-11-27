// The paper's Figure 4b (`BenchmarkVisualizer.plot_performance_across_versions`): the mean runtime
// of each PyNWB method across software environments, one panel per modality (and, for slicing, per
// preload state, at the largest slice only), with a 95 % bootstrap interval, and the change from
// each environment to the next (`_write_performance_change_table`). The Python code fixes the x axis
// to the paper's dated environments; here it is whichever environments the filters select, or the
// version of any tracked package or of Python, so the same figure can ask "what changed with h5py 3.16?".

import { MODALITY_ORDER, type Modality } from "../benchmarkNames";
import { PACKAGES_OF_INTEREST } from "../curation";
import type { Database } from "../database";
import type { Dataset, Row } from "../filters";
import { PYNWB_READ_ORDER, orderMethods } from "../methods";
import { bootstrapMeanInterval, groupBy, mean, summarize, type Summary } from "../stats";
import { compareVersions } from "../versions";
import { LARGEST_SLICE_NUMBER } from "./rankings";

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

/** The network metrics the change table carries, from the network-tracking runs. */
export const CHANGE_NETWORK_METRICS = ["amount_downloaded_in_bytes", "total_traffic_in_number_of_web_packets"] as const;

export type ChangeNetworkMetric = (typeof CHANGE_NETWORK_METRICS)[number];

/** Runtimes both under this are reads served from cache, where a large relative change is negligible. */
export const CACHED_READ_SECONDS = 0.01;

/** One side of a change: the runtime's count and mean, and each network metric's mean (null with no
 * network-tracking results). */
export interface ChangeSide {
  n: number;
  mean: number;
  network: Record<ChangeNetworkMetric, number | null>;
}

/** How one method's runtime and network traffic changed from one group to the next. */
export interface VersionChange {
  from: string;
  to: string;
  method: string;
  modality: Modality;
  preloaded: boolean | null;
  before: ChangeSide;
  after: ChangeSide;
  absoluteChange: number;
  percentChange: number;
  foldChange: number;
  /** Null where either side has no network results, or the earlier one measured none. */
  networkPercentChange: Record<ChangeNetworkMetric, number | null>;
  /** Both runtimes under CACHED_READ_SECONDS. */
  cached: boolean;
}

export interface PerformanceAcrossVersions {
  benchmark: VersionsBenchmark;
  axis: string;
  groups: VersionGroup[];
  methods: string[];
  panels: VersionPanel[];
  /** Every consecutive pair of groups, the largest changes first and cached reads last. */
  changes: VersionChange[];
}

/** The date of each environment's first run in the selection. */
function firstRunDates(dataset: Dataset): Map<string, string> {
  const dates = new Map<string, string>();
  for (const run of dataset.runs) {
    const date = run.timestamp.slice(0, 10);
    const known = dates.get(run.environmentId);
    if (known === undefined || date < known) dates.set(run.environmentId, date);
  }
  return dates;
}

function groupOf(row: Row, axis: string, db: Database, firstRuns: Map<string, string>): VersionGroup {
  const environmentId = row.sample.run.environmentId;
  const environment = db.environments.get(environmentId);
  if (axis === "environment") {
    // An environment the paper does not date is dated, as the paper dated its latest, by its first run.
    const label = environment?.timepoint ?? `${firstRuns.get(environmentId)} (${environmentId.slice(0, 7)})`;
    return { key: environmentId, label };
  }
  const version = axis === "python" ? environment?.pythonVersion : environment?.packagesOfInterest[axis.slice(4)];
  const label = version ?? (environment ? "not installed" : "unknown");
  return { key: label, label };
}

/** The PyNWB rows of one benchmark type, at the largest slice only for slicing: pooling slice sizes
 * would mix runtimes that differ several-fold. */
function pynwbRows(dataset: Dataset, type: string, slicing: boolean): Row[] {
  return dataset
    .rows(type)
    .filter(
      (row) =>
        PYNWB_READ_ORDER.includes(row.clean) &&
        row.modality !== null &&
        (!slicing || row.sliceNumber === LARGEST_SLICE_NUMBER),
    );
}

function percentChange(before: number | null, after: number | null): number | null {
  if (before === null || after === null) return null;
  const change = 100 * (after / before - 1);
  return Number.isFinite(change) ? change : null;
}

/** `_write_performance_change_table`'s rows: each method in each panel, from every group to the next
 * where it ran in both, sorted by the size of the change (|log2 fold change|) with cached reads last. */
function versionChanges(panels: VersionPanel[], groups: VersionGroup[], network: Map<string, number>): VersionChange[] {
  const changes: VersionChange[] = [];
  for (const panel of panels) {
    for (const series of panel.series) {
      const points = new Map(series.points.map((point) => [point.group, point]));
      const side = (group: string): ChangeSide | null => {
        const point = points.get(group);
        if (!point) return null;
        const metric = (name: ChangeNetworkMetric): number | null =>
          network.get(JSON.stringify([panel.modality, panel.preloaded ?? false, series.method, group, name])) ?? null;
        return {
          n: point.summary.n,
          mean: point.summary.mean,
          network: {
            amount_downloaded_in_bytes: metric("amount_downloaded_in_bytes"),
            total_traffic_in_number_of_web_packets: metric("total_traffic_in_number_of_web_packets"),
          },
        };
      };
      for (let index = 1; index < groups.length; index++) {
        const before = side(groups[index - 1].key);
        const after = side(groups[index].key);
        if (!before || !after) continue;
        changes.push({
          from: groups[index - 1].key,
          to: groups[index].key,
          method: series.method,
          modality: panel.modality,
          preloaded: panel.preloaded,
          before,
          after,
          absoluteChange: after.mean - before.mean,
          percentChange: (100 * (after.mean - before.mean)) / before.mean,
          foldChange: after.mean / before.mean,
          networkPercentChange: {
            amount_downloaded_in_bytes: percentChange(
              before.network.amount_downloaded_in_bytes,
              after.network.amount_downloaded_in_bytes,
            ),
            total_traffic_in_number_of_web_packets: percentChange(
              before.network.total_traffic_in_number_of_web_packets,
              after.network.total_traffic_in_number_of_web_packets,
            ),
          },
          cached: Math.max(before.mean, after.mean) < CACHED_READ_SECONDS,
        });
      }
    }
  }
  const size = (change: VersionChange): number => {
    const value = Math.abs(Math.log2(change.foldChange));
    return Number.isNaN(value) ? -1 : value;
  };
  return changes.sort((a, b) => Number(a.cached) - Number(b.cached) || size(b) - size(a));
}

export function performanceAcrossVersions(
  dataset: Dataset,
  benchmark: VersionsBenchmark,
  axis = "environment",
): PerformanceAcrossVersions {
  const slicing = benchmark === "time_remote_slicing";
  const rows = pynwbRows(dataset, benchmark, slicing);
  const groupLabels = new Map<string, string>();
  const firstRuns = firstRunDates(dataset);
  const keyed = rows.map((row) => {
    const group = groupOf(row, axis, dataset.db, firstRuns);
    groupLabels.set(group.key, group.label);
    return { row, group: group.key };
  });
  const groups = [...groupLabels.entries()]
    .map(([key, label]) => ({ key, label }))
    .sort((a, b) => (axis === "environment" ? a.label.localeCompare(b.label) : compareVersions(a.label, b.label)));
  const methods = orderMethods(rows.map((row) => row.clean));
  const preloadStates: (boolean | null)[] = slicing ? [false, true] : [null];
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

  const networkType = benchmark.replace("time_", "network_tracking_");
  const networkRows = pynwbRows(dataset, networkType, slicing).filter((row) =>
    (CHANGE_NETWORK_METRICS as readonly string[]).includes(row.variable),
  );
  const network = new Map<string, number>();
  for (const [id, cell] of groupBy(networkRows, (row) => [
    row.modality,
    row.isPreloaded,
    row.clean,
    groupOf(row, axis, dataset.db, firstRuns).key,
    row.variable,
  ])) {
    network.set(id, mean(cell.items.map((row) => row.value)));
  }

  return { benchmark, axis, groups, methods, panels, changes: versionChanges(panels, groups, network) };
}
