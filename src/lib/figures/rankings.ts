// The paper's Figure 3 (`BenchmarkVisualizer.plot_method_rankings`): the mean runtime of each
// method in each modality, for four remote-access tasks, with the fastest method of each modality
// starred.

import { MODALITY_ORDER, type Modality } from "../benchmarkNames";
import type { Dataset, Row } from "../filters";
import { FILE_OPEN_ORDER, PYNWB_READ_ORDER } from "../methods";
import { groupBy, summarize, type Summary } from "../stats";

export interface HeatmapPanel {
  id: string;
  title: string;
  /** The rows, in the figures' fixed order, whether or not they have data. */
  methods: string[];
  modalities: Modality[];
  /** `cells[method][modality]`, null where there is no measurement. */
  cells: (Summary | null)[][];
  /** The row index of the fastest method of each modality, or null. */
  fastest: (number | null)[];
  /** The upper end of the paper's color scale for this panel. */
  paperMax: number;
}

/** The largest slice range: the paper's slicing panels use slice number 5 only. */
export const LARGEST_SLICE_NUMBER = 5;

function panel(id: string, title: string, rows: Row[], methods: string[], paperMax: number): HeatmapPanel {
  const groups = groupBy(rows, (row) => [row.clean, row.modality] as const);
  const cells = methods.map((method) =>
    MODALITY_ORDER.map((modality) => {
      const group = groups.get(JSON.stringify([method, modality]));
      if (!group) return null;
      const summary = summarize(group.items.map((row) => row.value));
      return summary.n > 0 ? summary : null;
    }),
  );
  const fastest = MODALITY_ORDER.map((_, column) => {
    let best: number | null = null;
    cells.forEach((row, index) => {
      const cell = row[column];
      if (cell && (best === null || cell.mean < (cells[best][column] as Summary).mean)) best = index;
    });
    return best;
  });
  return { id, title, methods, modalities: MODALITY_ORDER, cells, fastest, paperMax };
}

export function methodRankings(dataset: Dataset): HeatmapPanel[] {
  const read = dataset.rows("time_remote_file_reading");
  const slicing = dataset.rows("time_remote_slicing");
  const largest = slicing.filter(
    (row) => PYNWB_READ_ORDER.includes(row.clean) && row.sliceNumber === LARGEST_SLICE_NUMBER,
  );
  return [
    panel(
      "remote_file_open",
      "Remote File Opening",
      read.filter((row) => FILE_OPEN_ORDER.includes(row.clean)),
      FILE_OPEN_ORDER,
      4,
    ),
    panel(
      "remote_file_open_pynwb",
      "Remote File Opening - PyNWB",
      read.filter((row) => PYNWB_READ_ORDER.includes(row.clean)),
      PYNWB_READ_ORDER,
      200,
    ),
    panel(
      "remote_slicing_not_preloaded",
      "Remote Slicing - Not Preloaded",
      largest.filter((row) => !row.isPreloaded),
      PYNWB_READ_ORDER,
      10,
    ),
    panel(
      "remote_slicing_preloaded",
      "Remote Slicing - Preloaded",
      largest.filter((row) => row.isPreloaded),
      PYNWB_READ_ORDER,
      10,
    ),
  ];
}
