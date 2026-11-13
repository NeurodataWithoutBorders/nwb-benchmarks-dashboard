// The comparison across versions: per modality, the mean runtime of each PyNWB method across
// environments (or package versions), joined by lines, with 95 % bootstrap intervals, as
// nwb-benchmarks' `plot_performance_across_versions` draws it.

import type { Column } from "../../lib/csv";
import { formatG, formatSeconds } from "../../lib/format";
import type { PerformanceAcrossVersions, VersionPanel, VersionPoint } from "../../lib/figures/versions";
import { methodColor, methodLabel, methodLineStyle, methodMarker } from "../../lib/methods";
import { axisNames, gridLayout, legendHeight } from "../charts/grid";
import {
  axis,
  baseLayout,
  hoverText,
  panelLabels,
  panelLetter,
  plotText,
  plotlyDash,
  plotlySymbol,
  type FigureOptions,
  type FigureSpec,
  type Trace,
} from "../charts/plot";

function panelTitle(panel: VersionPanel): string {
  if (panel.preloaded === null) return panel.modality;
  return `${panel.modality} · ${panel.preloaded ? "preloaded" : "not preloaded"}`;
}

function pointHover(method: string, group: string, point: VersionPoint): string {
  return hoverText(`${methodLabel(method)} · ${group}`, [
    { label: `mean (n = ${point.summary.n})`, value: formatSeconds(point.summary.mean) },
    {
      label: "95% interval",
      value: point.interval ? `${formatG(point.interval[0], 3)}–${formatG(point.interval[1], 3)} s` : "–",
    },
    { label: "median", value: formatSeconds(point.summary.median) },
  ]);
}

export function versionsFigure(
  figure: PerformanceAcrossVersions,
  axisLabel: string,
  { width, theme, letters }: FigureOptions,
): FigureSpec {
  const labels = new Map(figure.groups.map((group) => [group.key, plotText(group.label)]));
  const categories = figure.groups.map((group) => labels.get(group.key) as string);
  const count = figure.panels.length;
  const columns = Math.max(1, Math.min(count, Math.floor(width / 320)));
  const longest = Math.max(...figure.groups.map((group) => group.label.length));
  // Long labels (environment labels; package versions are short) turn to fit.
  const slanted = longest * 6.5 > (width / columns - 90) / Math.max(1, figure.groups.length);
  const padding = {
    top: 32,
    right: 14,
    bottom: 50 + (slanted ? Math.ceil(longest * 6 * Math.sin((35 * Math.PI) / 180)) : 0),
    left: 60,
  };
  const plotWidth = width / columns - padding.left - padding.right;
  const grid = gridLayout({
    width,
    panelHeights: figure.panels.map(() => Math.round(Math.min(320, Math.max(220, plotWidth * 0.62)))),
    minPanelWidth: 320,
    padding,
    bottom: legendHeight(figure.methods.length, width),
  });
  const layout = baseLayout(theme, grid, true);
  const annotations = layout.annotations as Record<string, unknown>[];
  const shown = new Set<string>();
  const data: Trace[] = [];
  figure.panels.forEach((panel, index) => {
    const names = axisNames(index);
    const domain = grid.domains[index];
    layout[names.xaxis] = axis(theme, domain.x, names.y, axisLabel, {
      type: "category",
      categoryorder: "array",
      categoryarray: categories,
      tickangle: slanted ? -35 : 0,
      showgrid: false,
    });
    layout[names.yaxis] = axis(theme, domain.y, names.x, "Time (s)", { rangemode: "tozero" });
    annotations.push(...panelLabels(theme, grid, domain, panelTitle(panel), panelLetter(letters, index), padding));
    for (const series of panel.series) {
      const label = methodLabel(series.method);
      const color = theme.color(methodColor(series.method));
      data.push({
        type: "scatter",
        mode: "lines+markers",
        xaxis: names.x,
        yaxis: names.y,
        x: series.points.map((point) => labels.get(point.group) ?? point.group),
        y: series.points.map((point) => point.summary.mean),
        error_y: {
          type: "data",
          symmetric: false,
          array: series.points.map((point) => (point.interval ? point.interval[1] - point.summary.mean : 0)),
          arrayminus: series.points.map((point) => (point.interval ? point.summary.mean - point.interval[0] : 0)),
          color,
          thickness: 1.2,
          width: 3,
        },
        line: { color, dash: plotlyDash(methodLineStyle(series.method)), width: 2 },
        marker: { color, symbol: plotlySymbol(methodMarker(series.method)), size: 8 },
        name: label,
        legendgroup: label,
        showlegend: !shown.has(label),
        customdata: series.points.map((point) =>
          pointHover(
            series.method,
            figure.groups.find((group) => group.key === point.group)?.label ?? point.group,
            point,
          ),
        ),
        hovertemplate: "%{customdata}<extra></extra>",
      });
      shown.add(label);
    }
  });
  return { data, layout };
}

export interface VersionsRow {
  group: string;
  method: string;
  modality: string;
  preloaded: boolean | null;
  point: VersionPoint;
}

export function versionsRows(figure: PerformanceAcrossVersions): VersionsRow[] {
  const labels = new Map(figure.groups.map((group) => [group.key, group.label]));
  return figure.panels.flatMap((panel) =>
    panel.series.flatMap((series) =>
      series.points.map((point) => ({
        group: labels.get(point.group) ?? point.group,
        method: series.method,
        modality: panel.modality,
        preloaded: panel.preloaded,
        point,
      })),
    ),
  );
}

export const VERSIONS_COLUMNS: Column<VersionsRow>[] = [
  { label: "Group", value: (row) => row.group },
  { label: "Method", value: (row) => methodLabel(row.method) },
  { label: "Method (benchmark name)", value: (row) => row.method },
  { label: "Modality", value: (row) => row.modality },
  { label: "Preloaded", value: (row) => row.preloaded },
  { label: "n", value: (row) => row.point.summary.n },
  { label: "Mean (s)", value: (row) => row.point.summary.mean },
  { label: "95% low (s)", value: (row) => row.point.interval?.[0] ?? null },
  { label: "95% high (s)", value: (row) => row.point.interval?.[1] ?? null },
  { label: "Median (s)", value: (row) => row.point.summary.median },
  { label: "Std (s)", value: (row) => row.point.summary.std },
];
