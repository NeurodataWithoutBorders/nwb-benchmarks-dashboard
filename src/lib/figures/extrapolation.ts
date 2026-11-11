// The paper's Figure 4a (`plot_download_vs_stream_benchmarks` and
// `plot_benchmark_slice_extrapolations`): straight lines fitted to the time to stream increasing
// slice sizes (remote open + slice) and to download first (download + local open + slice), and
// where they cross.

import { MODALITY_ORDER, type Modality } from "../benchmarkNames";
import type { Dataset, Row } from "../filters";
import { groupBy, linearFit, mean } from "../stats";

export interface TimedRow {
  modality: Modality | null;
  method: string;
  isPreloaded: boolean;
  sliceNumber: number;
  /** The open (and download) time plus the slice time. */
  totalTime: number;
}

/**
 * `combine_read_and_slice_times(..., with_baseline=True)`: every slice time plus the mean open
 * time of its method, and each open measurement again as slice 0 with no slice time.
 */
export function readAndSliceTimes(
  dataset: Dataset,
  readType: string,
  sliceType: string,
): (TimedRow & { formatFamily: string })[] {
  const reads = dataset.rows(readType);
  const openTimes = new Map<string, number>();
  for (const [id, group] of groupBy(reads, (row) => [row.modality, row.clean] as const)) {
    openTimes.set(id, mean(group.items.map((row) => row.value)));
  }
  const timed = (row: Row, sliceNumber: number | null, value: number): TimedRow & { formatFamily: string } => ({
    modality: row.modality,
    method: row.clean,
    isPreloaded: row.isPreloaded,
    sliceNumber: sliceNumber ?? Number.NaN,
    totalTime: value + (openTimes.get(JSON.stringify([row.modality, row.clean])) ?? Number.NaN),
    formatFamily: row.clean.split(" ")[0],
  });
  return [
    ...reads.map((row) => timed(row, 0, 0)),
    ...dataset.rows(sliceType).map((row) => timed(row, row.sliceNumber, row.value)),
  ];
}

/** The remote rows: streaming means opening the remote file and slicing it. */
export function streamTimes(dataset: Dataset): TimedRow[] {
  return readAndSliceTimes(dataset, "time_remote_file_reading", "time_remote_slicing");
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

/**
 * `combine_download_read_and_slice_times`: the local rows of methods that have a download benchmark,
 * each plus the mean download time, and named by their file format.
 */
export function downloadThenReadTimes(dataset: Dataset): (TimedRow & { formatFamily: string })[] {
  const downloads = downloadTimes(dataset);
  return readAndSliceTimes(dataset, "time_local_file_reading", "time_local_slicing").flatMap((row) => {
    const download = downloads.get(JSON.stringify([row.modality, row.method]));
    if (download === undefined || Number.isNaN(download)) return [];
    return [{ ...row, method: row.formatFamily, totalTime: row.totalTime + download }];
  });
}

export interface Extrapolation {
  modality: Modality;
  method: string;
  isPreloaded: boolean;
  formatFamily: string;
  stream: { slope: number; intercept: number };
  download: { slope: number; intercept: number };
  /** Where streaming becomes slower than downloading, or null where the lines do not cross in the
   * positive quadrant (the Python code draws nothing for those). */
  crossover: { x: number; y: number } | null;
}

function distinctSliceNumbers(rows: TimedRow[]): number {
  return new Set(rows.map((row) => row.sliceNumber)).size;
}

export function extrapolations(dataset: Dataset): Extrapolation[] {
  const stream = streamTimes(dataset);
  const download = downloadThenReadTimes(dataset);
  const fits: Extrapolation[] = [];
  for (const group of groupBy(stream, (row) => [row.modality, row.method, row.isPreloaded] as const).values()) {
    const [modality, method, isPreloaded] = group.key;
    if (modality === null) continue;
    const formatFamily = method.split(" ")[0];
    const local = download.filter(
      (row) => row.modality === modality && row.method === formatFamily && row.isPreloaded === isPreloaded,
    );
    if (local.length === 0) continue;
    if (distinctSliceNumbers(group.items) <= 1 || distinctSliceNumbers(local) <= 1) continue;
    const streamFit = linearFit(
      group.items.map((row) => row.sliceNumber),
      group.items.map((row) => row.totalTime),
    );
    const downloadFit = linearFit(
      local.map((row) => row.sliceNumber),
      local.map((row) => row.totalTime),
    );
    if (!streamFit || !downloadFit) continue;
    let crossover: { x: number; y: number } | null = null;
    if (Math.abs(streamFit.slope - downloadFit.slope) >= 1e-10) {
      const x = (downloadFit.intercept - streamFit.intercept) / (streamFit.slope - downloadFit.slope);
      const y = streamFit.slope * x + streamFit.intercept;
      if (x >= 0 && y >= 0) crossover = { x, y };
    }
    fits.push({ modality, method, isPreloaded, formatFamily, stream: streamFit, download: downloadFit, crossover });
  }
  const modalityIndex = (modality: Modality): number => MODALITY_ORDER.indexOf(modality);
  return fits.sort(
    (a, b) =>
      modalityIndex(a.modality) - modalityIndex(b.modality) ||
      Number(a.isPreloaded) - Number(b.isPreloaded) ||
      a.method.localeCompare(b.method),
  );
}
