// The incremental slicing figure: per modality, the median cumulative time of each curve with its
// range across runs as a band, and a cross where streaming first falls behind downloading, as
// nwb-benchmarks' `plot_incremental_slicing_benchmarks` draws it.

import type { Column } from "../../lib/csv";
import { formatSeconds } from "../../lib/format";
import { incrementalOverview, type IncrementalOverview, type IncrementalPanel } from "../../lib/figures/incremental";
import { axisNames, gridLayout, legendHeight } from "../charts/grid";
import {
  axis,
  baseLayout,
  hoverText,
  logTickSpacing,
  panelLabels,
  panelLetter,
  plotlyDash,
  type FigureOptions,
  type FigureSpec,
  type Trace,
} from "../charts/plot";
import { translucent } from "../charts/theme";

export type TimeAxis = "linear" | "log";

export function incrementalFigure(
  panels: IncrementalPanel[],
  timeAxis: TimeAxis,
  { width, theme, letters }: FigureOptions,
): FigureSpec {
  const log = timeAxis === "log";
  const padding = { top: 32, right: 14, bottom: 50, left: 64 };
  const columns = Math.max(1, Math.min(panels.length, Math.floor(width / 320)));
  const plotWidth = width / columns - padding.left - padding.right;
  const curveLabels = new Set(panels.flatMap((panel) => panel.curves.map((curve) => curve.label)));
  const grid = gridLayout({
    width,
    panelHeights: panels.map(() => Math.round(Math.min(340, Math.max(220, plotWidth * 0.72)))),
    minPanelWidth: 320,
    padding,
    bottom: legendHeight(curveLabels.size, width),
  });
  const layout = baseLayout(theme, grid, true);
  const annotations = layout.annotations as Record<string, unknown>[];
  const shown = new Set<string>();
  const data: Trace[] = [];
  // A logarithmic axis cannot show zero: those values are left out of the line.
  const onAxis = (value: number): number | null => (log && value <= 0 ? null : value);
  panels.forEach((panel, index) => {
    const names = axisNames(index);
    const domain = grid.domains[index];
    const lastIndex = Math.max(...panel.curves.flatMap((curve) => curve.points.map((point) => point.sliceIndex)));
    const times = panel.curves.flatMap((curve) => curve.points.flatMap((point) => [point.min, point.max]));
    const positive = times.filter((time) => time > 0);
    layout[names.xaxis] = axis(
      theme,
      domain.x,
      names.y,
      panel.modality === "Icephys" ? "Number of TimeSeries read" : "Number of slices read",
      { range: [0, Math.max(1, lastIndex)] },
    );
    layout[names.yaxis] = axis(
      theme,
      domain.y,
      names.x,
      log ? "Cumulative time (s, log scale)" : "Cumulative time (s)",
      log
        ? { type: "log", exponentformat: "SI", dtick: logTickSpacing(Math.min(...positive), Math.max(...positive)) }
        : { type: "linear", rangemode: "tozero" },
    );
    annotations.push(...panelLabels(theme, grid, domain, panel.modality, panelLetter(letters, index), padding));
    const at = { xaxis: names.x, yaxis: names.y };
    for (const curve of panel.curves) {
      const color = theme.color(curve.color);
      const x = curve.points.map((point) => point.sliceIndex);
      if (curve.points.some((point) => point.n > 1)) {
        data.push(
          {
            type: "scatter",
            mode: "lines",
            ...at,
            x,
            y: curve.points.map((point) => onAxis(point.max)),
            line: { width: 0, color },
            hoverinfo: "skip",
            showlegend: false,
            legendgroup: curve.label,
          },
          {
            type: "scatter",
            mode: "lines",
            ...at,
            x,
            y: curve.points.map((point) => onAxis(point.min)),
            line: { width: 0, color },
            fill: "tonexty",
            fillcolor: translucent(color, 0.18),
            hoverinfo: "skip",
            showlegend: false,
            legendgroup: curve.label,
          },
        );
      }
      data.push({
        type: "scatter",
        mode: "lines",
        ...at,
        x,
        y: curve.points.map((point) => onAxis(point.median)),
        line: { color, dash: plotlyDash(curve.lineStyle), width: 2 },
        name: curve.label,
        legendgroup: curve.label,
        showlegend: !shown.has(curve.label),
        customdata: curve.points.map((point) =>
          hoverText(`${curve.label} · ${panel.modality}`, [
            { label: "slices read", value: String(point.sliceIndex) },
            { label: "median cumulative time", value: formatSeconds(point.median) },
            { label: "runs", value: String(point.n) },
          ]),
        ),
        hovertemplate: "%{customdata}<extra></extra>",
      });
      shown.add(curve.label);
      if (curve.crossover !== null) {
        const point = curve.points[curve.crossover];
        data.push({
          type: "scatter",
          mode: "markers",
          ...at,
          x: [point.sliceIndex],
          y: [onAxis(point.median)],
          marker: { symbol: "x-thin", size: 12, color, line: { color, width: 2.5 } },
          showlegend: false,
          legendgroup: curve.label,
          customdata: [
            hoverText(`${curve.label} · ${panel.modality}`, [
              { label: "first slice slower than downloading first", value: String(point.sliceIndex) },
              { label: "cumulative time there", value: formatSeconds(point.median) },
            ]),
          ],
          hovertemplate: "%{customdata}<extra></extra>",
        });
      }
    }
  });
  return { data, layout };
}

export function incrementalRows(panels: IncrementalPanel[]): IncrementalOverview[] {
  return incrementalOverview(panels);
}

export const INCREMENTAL_COLUMNS: Column<IncrementalOverview>[] = [
  { label: "Modality", value: (row) => row.modality },
  { label: "Curve", value: (row) => row.label },
  { label: "Method (benchmark name)", value: (row) => row.method },
  { label: "Access", value: (row) => row.accessMode },
  { label: "Format", value: (row) => row.formatFamily },
  { label: "Runs", value: (row) => row.runs },
  { label: "Slices", value: (row) => row.slices },
  { label: "Download (s)", value: (row) => row.downloadTime },
  { label: "Open (s)", value: (row) => row.openTime },
  { label: "Per slice (s)", value: (row) => row.meanTimePerSlice },
  { label: "Total (s)", value: (row) => row.totalTime },
  { label: "Streaming falls behind at slice", value: (row) => row.crossover },
];
