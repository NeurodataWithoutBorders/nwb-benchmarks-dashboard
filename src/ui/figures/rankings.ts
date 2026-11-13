// The method rankings: one heatmap per task, cells annotated with the mean, the fastest method of
// each modality starred, as nwb-benchmarks' `plot_method_rankings` draws them.

import type { Column } from "../../lib/csv";
import { formatG, formatSeconds } from "../../lib/format";
import type { HeatmapPanel } from "../../lib/figures/rankings";
import { methodLabel } from "../../lib/methods";
import { niceTicks } from "../../lib/scale";
import type { Summary } from "../../lib/stats";
import { axisNames, gridLayout } from "../charts/grid";
import {
  axis,
  baseLayout,
  hoverText,
  panelLabels,
  panelLetter,
  type FigureOptions,
  type FigureSpec,
  type Trace,
} from "../charts/plot";

export type HeatmapScale = "paper" | "data";

/** The upper end of a panel's color scale. */
export function heatMax(panel: HeatmapPanel, scale: HeatmapScale): number {
  if (scale === "paper") return panel.paperMax;
  const means = panel.cells.flat().flatMap((cell) => (cell ? [cell.mean] : []));
  const max = means.length ? Math.max(...means) : 1;
  const ticks = niceTicks(0, max, 4);
  return Math.max(max, ticks[ticks.length - 1] ?? max) || 1;
}

const CELL_HEIGHT = 30;
const MIN_PANEL_WIDTH = 420;

function cellHover(label: string, modality: string, cell: Summary, fastest: boolean): string {
  const lines = [
    { label: "mean", value: formatSeconds(cell.mean) },
    { label: "standard deviation", value: formatSeconds(cell.std) },
    { label: "median", value: formatSeconds(cell.median) },
    { label: "range", value: `${formatG(cell.min, 3)}–${formatG(cell.max, 3)} s` },
    { label: "runs", value: String(cell.n) },
  ];
  return hoverText(
    `${label} · ${modality}`,
    fastest ? [...lines, { label: "in this modality", value: "fastest" }] : lines,
  );
}

export function rankingsFigure(
  panels: HeatmapPanel[],
  scale: HeatmapScale,
  { width, theme, letters }: FigureOptions,
): FigureSpec {
  const longest = Math.max(...panels.flatMap((panel) => panel.methods.map((method) => methodLabel(method).length)));
  const columns = Math.max(1, Math.min(panels.length, Math.floor(width / MIN_PANEL_WIDTH)));
  const cellWidth = width / columns;
  // Narrow panels (phones) set their text a size smaller, and give the method names at most 45 % of the panel.
  const compact = cellWidth < 460;
  const fontSize = compact ? 9 : 12;
  // Room on the right for each panel's vertical color scale, its ticks and its title.
  const padding = {
    top: 32,
    right: compact ? 52 : 76,
    bottom: 30,
    left: Math.min(cellWidth * 0.42, longest * fontSize * 0.6 + 10),
  };
  const cellHeight = CELL_HEIGHT;
  const plotWidth = cellWidth - padding.left - padding.right;
  const grid = gridLayout({
    width,
    panelHeights: panels.map((panel) => panel.methods.length * cellHeight),
    minPanelWidth: MIN_PANEL_WIDTH,
    padding,
    bottom: 4,
  });
  const layout = baseLayout(theme, grid, false);
  const annotations = layout.annotations as Record<string, unknown>[];
  const shapes = layout.shapes as Record<string, unknown>[];
  const colorscale = theme.heat.map((color, stop) => [stop / (theme.heat.length - 1), color]);
  const data: Trace[] = panels.map((panel, index) => {
    const names = axisNames(index);
    const domain = grid.domains[index];
    const labels = panel.methods.map(methodLabel);
    layout[names.xaxis] = axis(theme, domain.x, names.y, "", {
      type: "category",
      tickfont: { color: theme.muted, size: fontSize },
      showline: false,
      showgrid: false,
      ticks: "",
      fixedrange: true,
    });
    layout[names.yaxis] = axis(theme, domain.y, names.x, "", {
      type: "category",
      autorange: "reversed",
      tickfont: { color: theme.muted, size: fontSize },
      showline: false,
      showgrid: false,
      ticks: "",
      fixedrange: true,
    });
    annotations.push(...panelLabels(theme, grid, domain, panel.title, panelLetter(letters, index), padding));
    // The fastest method of each modality: its cell outlined, and a star badge in its corner (or, where
    // a narrow cell has no room beside its value, a star before the value).
    panel.fastest.forEach((method, modality) => {
      if (method === null) return;
      const at = { xref: names.x, yref: names.y };
      shapes.push({
        type: "rect",
        ...at,
        x0: modality - 0.5,
        x1: modality + 0.5,
        y0: method - 0.5,
        y1: method + 0.5,
        line: { color: theme.accent, width: 3 },
        layer: "above",
      });
      if (compact) return;
      annotations.push({
        ...at,
        text: "★",
        x: modality + 0.5,
        y: method - 0.5,
        xanchor: "right",
        yanchor: "top",
        xshift: -2,
        yshift: -2,
        showarrow: false,
        bgcolor: theme.accent,
        borderpad: 1,
        font: { color: theme.surface, size: 11 },
      });
    });
    const max = heatMax(panel, scale);
    return {
      type: "heatmap",
      xaxis: names.x,
      yaxis: names.y,
      x: panel.modalities,
      y: labels,
      z: panel.cells.map((row) => row.map((cell) => cell?.mean ?? null)),
      text: panel.cells.map((row, method) =>
        row.map((cell, modality) => {
          if (!cell) return "";
          const star = compact && panel.fastest[modality] === method ? "★ " : "";
          return `${star}${formatG(cell.mean, 3)}`;
        }),
      ),
      customdata: panel.cells.map((row, method) =>
        row.map((cell, modality) =>
          cell ? cellHover(labels[method], panel.modalities[modality], cell, panel.fastest[modality] === method) : "",
        ),
      ),
      texttemplate: "%{text}",
      textfont: { size: plotWidth / panel.modalities.length < 64 ? 9 : fontSize - 1 },
      hovertemplate: "%{customdata}<extra></extra>",
      hoverongaps: false,
      xgap: 2,
      ygap: 2,
      zmin: 0,
      zmax: max,
      colorscale,
      colorbar: {
        x: domain.x[1] + grid.fx(10),
        xanchor: "left",
        y: (domain.y[0] + domain.y[1]) / 2,
        yanchor: "middle",
        len: domain.y[1] - domain.y[0],
        thickness: compact ? 8 : 10,
        nticks: panel.methods.length < 6 ? 3 : 6,
        outlinewidth: 0,
        tickfont: { color: theme.muted, size: compact ? 9 : 10 },
        title: { text: "Mean (s)", side: "right", font: { color: theme.muted, size: compact ? 10 : 11 } },
      },
    };
  });
  return { data, layout };
}

export interface RankingsRow {
  panel: string;
  method: string;
  modality: string;
  summary: Summary;
  fastest: boolean;
}

export function rankingsRows(panels: HeatmapPanel[]): RankingsRow[] {
  return panels.flatMap((panel) =>
    panel.methods.flatMap((method, row) =>
      panel.modalities.flatMap((modality, column) => {
        const summary = panel.cells[row][column];
        return summary
          ? [{ panel: panel.title, method, modality, summary, fastest: panel.fastest[column] === row }]
          : [];
      }),
    ),
  );
}

export const RANKINGS_COLUMNS: Column<RankingsRow>[] = [
  { label: "Task", value: (row) => row.panel },
  { label: "Method", value: (row) => methodLabel(row.method) },
  { label: "Method (benchmark name)", value: (row) => row.method },
  { label: "Modality", value: (row) => row.modality },
  { label: "n", value: (row) => row.summary.n },
  { label: "Mean (s)", value: (row) => row.summary.mean },
  { label: "Median (s)", value: (row) => row.summary.median },
  { label: "Std (s)", value: (row) => row.summary.std },
  { label: "Min (s)", value: (row) => row.summary.min },
  { label: "Max (s)", value: (row) => row.summary.max },
  { label: "Fastest", value: (row) => row.fastest },
];
