// The paper's Figure 5: the average network traffic of an operation (from the network-tracking
// runs) against its average runtime (from the timing runs), on log-log axes with lines of constant
// throughput. `_plot_file_open_network_runtime_scatter` draws panels a and b, and
// `_plot_slicing_network_runtime_trajectories` panels c to e.

import { MODALITY_ORDER, type Modality } from "../benchmarkNames";
import type { Dataset, Row } from "../filters";
import { FILE_OPEN_ORDER, PYNWB_READ_ORDER, isByteMetric, orderMethods } from "../methods";
import { groupBy, summarize, type Summary } from "../stats";

export const DEFAULT_NETWORK_METRIC = "total_transfer_in_bytes";

export interface TrafficPoint {
  method: string;
  modality: Modality;
  /** Slice size rank, for the slicing trajectories. */
  sliceNumber: number | null;
  runtime: Summary;
  network: Summary;
}

export type FileOpenFamily = "backend" | "pynwb";

export interface FileOpenTraffic {
  family: FileOpenFamily;
  title: string;
  metric: string;
  methods: string[];
  points: TrafficPoint[];
  /** Effective throughputs (MB/s) to draw guide lines for; empty for a metric that is not bytes. */
  throughputRates: number[];
}

function pair(
  runtimeRows: Row[],
  networkRows: Row[],
  key: (row: Row) => readonly unknown[],
): { key: readonly unknown[]; runtime: Summary; network: Summary }[] {
  const runtimeGroups = groupBy(runtimeRows, key);
  const networkGroups = groupBy(networkRows, key);
  const pairs = [];
  for (const [id, group] of runtimeGroups) {
    const network = networkGroups.get(id);
    if (!network) continue;
    pairs.push({
      key: group.key,
      runtime: summarize(group.items.map((row) => row.value)),
      network: summarize(network.items.map((row) => row.value)),
    });
  }
  return pairs;
}

export function fileOpenTraffic(
  dataset: Dataset,
  family: FileOpenFamily,
  metric = DEFAULT_NETWORK_METRIC,
): FileOpenTraffic {
  const order = family === "pynwb" ? PYNWB_READ_ORDER : FILE_OPEN_ORDER;
  const runtimeRows = dataset
    .rows("time_remote_file_reading")
    .filter((row) => order.includes(row.clean) && row.modality !== null);
  const networkRows = dataset
    .rows("network_tracking_remote_file_reading")
    .filter((row) => order.includes(row.clean) && row.variable === metric);
  const points = pair(runtimeRows, networkRows, (row) => [row.clean, row.modality])
    .filter(({ runtime, network }) => runtime.mean > 0 && network.mean > 0)
    .map(({ key, runtime, network }) => ({
      method: key[0] as string,
      modality: key[1] as Modality,
      sliceNumber: null,
      runtime,
      network,
    }));
  return {
    family,
    title: family === "pynwb" ? "Remote File Opening - PyNWB" : "Remote File Opening",
    metric,
    methods: order.filter((method) => points.some((point) => point.method === method)),
    points,
    throughputRates: isByteMetric(metric) ? (family === "pynwb" ? [0.01, 0.1, 1, 10] : [0.1, 1, 10]) : [],
  };
}

export interface SlicingTrafficPanel {
  modality: Modality;
  /** Points with traffic, joined into one trajectory per method in slice order. */
  points: TrafficPoint[];
  /** Points whose network runs measured no traffic at all: drawn by slice size instead. */
  zeroTraffic: TrafficPoint[];
}

export interface SlicingTraffic {
  preloaded: boolean;
  metric: string;
  methods: string[];
  panels: SlicingTrafficPanel[];
  throughputRates: number[];
}

export function slicingTraffic(dataset: Dataset, preloaded: boolean, metric = DEFAULT_NETWORK_METRIC): SlicingTraffic {
  const runtimeRows = dataset.rows("time_remote_slicing").filter((row) => row.isPreloaded === preloaded);
  const networkRows = dataset
    .rows("network_tracking_remote_slicing")
    .filter((row) => row.isPreloaded === preloaded && row.variable === metric);
  const points: TrafficPoint[] = pair(runtimeRows, networkRows, (row) => [row.sliceNumber, row.clean, row.modality])
    .filter(({ runtime }) => runtime.mean > 0)
    .map(({ key, runtime, network }) => ({
      method: key[1] as string,
      modality: key[2] as Modality,
      sliceNumber: key[0] as number | null,
      runtime,
      network,
    }));
  const bySlice = (a: TrafficPoint, b: TrafficPoint): number => (a.sliceNumber ?? 0) - (b.sliceNumber ?? 0);
  const panels = MODALITY_ORDER.map((modality) => {
    const inModality = points.filter((point) => point.modality === modality).sort(bySlice);
    return {
      modality,
      points: inModality.filter((point) => point.network.mean > 0),
      zeroTraffic: inModality.filter((point) => point.network.mean === 0),
    };
  });
  return {
    preloaded,
    metric,
    methods: orderMethods(points.map((point) => point.method)),
    panels,
    throughputRates: isByteMetric(metric) ? [1, 10, 100] : [],
  };
}
