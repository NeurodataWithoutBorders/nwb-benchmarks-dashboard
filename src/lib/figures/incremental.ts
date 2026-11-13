// The incremental slicing figure (`plot_incremental_slicing_benchmarks`): the measured cumulative
// time to open a file and read it slice by slice along its whole time axis, streaming against
// downloading it first.

import { MODALITY_ORDER, type Modality } from "../benchmarkNames";
import type { Dataset } from "../filters";
import {
  FORMAT_FAMILY_LABELS,
  downloadColor,
  methodColor,
  methodLabel,
  methodLineStyle,
  orderMethods,
  type LineStyle,
} from "../methods";
import { groupBy, mean, median, std } from "../stats";

export interface IncrementalPoint {
  sliceIndex: number;
  n: number;
  median: number;
  /** The median of the measured time alone, without any download time added. */
  medianValue: number;
  min: number;
  max: number;
  std: number;
}

export interface IncrementalCurve {
  label: string;
  method: string;
  accessMode: "local" | "remote";
  formatFamily: string;
  color: string;
  lineStyle: LineStyle;
  /** The mean download time added to every point (0 for streaming without one). */
  downloadTime: number;
  points: IncrementalPoint[];
  /** The first slice index at which streaming is slower than downloading first, if any. */
  crossover: number | null;
}

export interface IncrementalPanel {
  modality: Modality;
  /** Download + local curves first, then streaming methods in the figures' order. */
  curves: IncrementalCurve[];
}

/** `download_match_name`: download benchmarks are named "<format> dandi api". */
function downloadMatch(method: string): string {
  return method.replace("dandi api", "pynwb");
}

/** Mean full-file download time by modality and the method it downloads for. */
export function downloadTimes(dataset: Dataset): Map<string, number> {
  const times = new Map<string, number>();
  for (const group of groupBy(
    dataset.rows("time_download"),
    (row) => [row.modality, downloadMatch(row.clean)] as const,
  ).values()) {
    times.set(JSON.stringify(group.key), mean(group.items.map((row) => row.value)));
  }
  return times;
}

/** `_first_crossover_index`. */
export function firstCrossover(streamTimes: readonly number[], downloadTimes: readonly number[]): number | null {
  const shared = Math.min(streamTimes.length, downloadTimes.length);
  for (let index = 0; index < shared; index++) if (streamTimes[index] > downloadTimes[index]) return index;
  return null;
}

export function incrementalSlicing(dataset: Dataset): IncrementalPanel[] {
  const downloads = downloadTimes(dataset);
  const rows = dataset
    .rows("track_incremental_slicing")
    .filter((row) => row.variable === "cumulative_time_in_seconds" && row.modality !== null)
    .flatMap((row) => {
      const accessMode: "local" | "remote" = row.sample.benchmarkName.includes("LocalIncrementalSliceBenchmark")
        ? "local"
        : "remote";
      const method = row.clean.replace("hdf5 pynwb lindi", "lindi pynwb");
      // Local reads need the whole file downloaded first; LINDI downloads its JSON reference file
      // outside the timed region. Other streaming methods need no download.
      const match = accessMode === "local" ? method : method === "lindi pynwb" ? method : null;
      const download = match === null ? undefined : downloads.get(JSON.stringify([row.modality, match]));
      if (match !== null && (download === undefined || Number.isNaN(download))) return [];
      const downloadTime = download ?? 0;
      return [
        {
          modality: row.modality as Modality,
          accessMode,
          formatFamily: method.startsWith("zarr") ? "zarr" : "hdf5",
          method,
          sliceIndex: row.valueIndex,
          value: row.value,
          total: row.value + downloadTime,
          downloadTime,
        },
      ];
    });

  const summaries = groupBy(rows, (row) => [row.modality, row.accessMode, row.formatFamily, row.method] as const);
  const curveOf = (items: typeof rows): { points: IncrementalPoint[]; downloadTime: number } => {
    const points = [...groupBy(items, (row) => [row.sliceIndex] as const).values()]
      .map(({ key, items: slice }) => {
        const totals = slice.map((row) => row.total);
        return {
          sliceIndex: key[0],
          n: totals.length,
          median: median(totals),
          medianValue: median(slice.map((row) => row.value)),
          min: Math.min(...totals),
          max: Math.max(...totals),
          std: std(totals),
        };
      })
      .sort((a, b) => a.sliceIndex - b.sliceIndex);
    return { points, downloadTime: items.reduce((total, row) => total + row.downloadTime, 0) / items.length };
  };

  const streamOrder = orderMethods(rows.filter((row) => row.accessMode === "remote").map((row) => row.method));
  const panels: IncrementalPanel[] = [];
  for (const modality of MODALITY_ORDER) {
    const groups = [...summaries.values()].filter(({ key }) => key[0] === modality);
    if (groups.length === 0) continue;
    const local = groups
      .filter(({ key }) => key[1] === "local")
      .sort((a, b) => a.key[2].localeCompare(b.key[2]))
      // One download curve per format, as the Python code groups local rows by format alone.
      .filter((group, index, all) => all.findIndex((other) => other.key[2] === group.key[2]) === index)
      .map(({ key }): IncrementalCurve => {
        const { points, downloadTime } = curveOf(
          rows.filter((row) => row.modality === modality && row.accessMode === "local" && row.formatFamily === key[2]),
        );
        return {
          label: `${FORMAT_FAMILY_LABELS[key[2]] ?? key[2]} download + local`,
          method: key[3],
          accessMode: "local",
          formatFamily: key[2],
          color: downloadColor(key[2]),
          lineStyle: "dashed",
          downloadTime,
          points,
          crossover: null,
        };
      });
    const remote = streamOrder.flatMap((method): IncrementalCurve[] => {
      const group = groups.find(({ key }) => key[1] === "remote" && key[3] === method);
      if (!group) return [];
      const { points, downloadTime } = curveOf(group.items);
      const formatFamily = group.key[2];
      const download = local.find((curve) => curve.formatFamily === formatFamily);
      return [
        {
          label: methodLabel(method),
          method,
          accessMode: "remote",
          formatFamily,
          color: methodColor(method),
          lineStyle: methodLineStyle(method),
          downloadTime,
          points,
          crossover: download
            ? firstCrossover(
                points.map((point) => point.median),
                download.points.map((point) => point.median),
              )
            : null,
        },
      ];
    });
    panels.push({ modality, curves: [...local, ...remote] });
  }
  return panels;
}

export interface IncrementalOverview {
  modality: Modality;
  label: string;
  method: string;
  accessMode: "local" | "remote";
  formatFamily: string;
  runs: number;
  slices: number;
  downloadTime: number;
  openTime: number;
  /** From the second slice on, since the first also carries one-time dataset access costs. */
  meanTimePerSlice: number;
  totalTime: number;
  crossover: number | null;
}

/** One row per curve, as `_write_incremental_overview_table` writes them. */
export function incrementalOverview(panels: readonly IncrementalPanel[]): IncrementalOverview[] {
  return panels.flatMap((panel) =>
    panel.curves.map((curve) => {
      const slices = Math.max(...curve.points.map((point) => point.sliceIndex));
      const totals = curve.points.map((point) => point.median);
      return {
        modality: panel.modality,
        label: curve.label,
        method: curve.method,
        accessMode: curve.accessMode,
        formatFamily: curve.formatFamily,
        runs: Math.min(...curve.points.map((point) => point.n)),
        slices,
        downloadTime: curve.downloadTime,
        openTime: curve.points[0].medianValue,
        meanTimePerSlice: slices > 1 ? (totals[totals.length - 1] - totals[1]) / (slices - 1) : Number.NaN,
        totalTime: totals[totals.length - 1],
        crossover: curve.crossover,
      };
    }),
  );
}
