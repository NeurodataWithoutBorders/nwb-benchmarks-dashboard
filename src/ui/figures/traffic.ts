// Network traffic against runtime on log-log axes, for backend and PyNWB file opening (methods
// joined across modalities) and for slicing (methods followed across slice sizes), as
// nwb-benchmarks' network-runtime correlation plots draw them.

import type { Column } from "../../lib/csv";
import { formatG, formatMetric, formatSeconds } from "../../lib/format";
import type { FileOpenTraffic, SlicingTraffic, SlicingTrafficPanel, TrafficPoint } from "../../lib/figures/traffic";
import {
  MODALITY_MARKERS,
  NETWORK_METRIC_LABELS,
  isByteMetric,
  methodColor,
  methodLabel,
  methodLineStyle,
  methodMarker,
} from "../../lib/methods";
import { extent } from "../../lib/scale";
import { axisNames, gridLayout, legendHeight, legendWidth, type Domain, type GridLayout } from "../charts/grid";
import {
  axis,
  baseLayout,
  hoverText,
  panelLabels,
  panelLetter,
  plotlyDash,
  plotlySymbol,
  type FigureOptions,
  type FigureSpec,
  type Layout,
  type Trace,
} from "../charts/plot";
import type { ChartTheme } from "../charts/theme";

function logDomain(values: number[]): [number, number] | null {
  const range = extent(values, { log: true, pad: 0 });
  if (!range) return null;
  // `_plot_slicing_network_runtime_trajectories` pads by a factor of 1.6 either side.
  return [range[0] / 1.6, range[1] * 1.6];
}

function metricLabel(metric: string): string {
  return NETWORK_METRIC_LABELS[metric] ?? metric;
}

function pointHover(heading: string, point: TrafficPoint, metric: string): string {
  const lines = [
    {
      label: `mean runtime (±${formatG(point.runtime.std, 2)}, n = ${point.runtime.n})`,
      value: formatSeconds(point.runtime.mean),
    },
    {
      label: `mean ${metricLabel(metric).toLowerCase()} (n = ${point.network.n})`,
      value: formatMetric(metric, point.network.mean),
    },
  ];
  if (isByteMetric(metric) && point.runtime.mean > 0) {
    lines.push({
      label: "effective throughput",
      value: `${formatG(point.network.mean / point.runtime.mean / 1e6, 3)} MB/s`,
    });
  }
  return hoverText(heading, lines);
}

const PADDING = { top: 34, right: 14, bottom: 48, left: 62 };
/** From this width on, the legend stands beside the panels, for all of them, rather than under them. */
const SIDE_LEGEND_MIN_WIDTH = 760;
/** The gap between the panels and a legend beside them. */
const SIDE_LEGEND_GAP = 12;

/** One log-log panel: its axes, and the dashed lines of constant throughput across it. */
interface LogPanel {
  index: number;
  domain: Domain;
  x: [number, number];
  y: [number, number];
}

function logAxes(layout: Layout, theme: ChartTheme, panel: LogPanel, metric: string): void {
  const names = axisNames(panel.index);
  // Decades only, once an axis spans enough of them; Plotly otherwise labels the 2s and 5s between.
  const logRange = (range: [number, number]) => ({
    type: "log",
    range: range.map(Math.log10),
    exponentformat: "SI",
    dtick: Math.log10(range[1] / range[0]) >= 1.5 ? 1 : "D2",
  });
  layout[names.xaxis] = axis(theme, panel.domain.x, names.y, metricLabel(metric), logRange(panel.x));
  layout[names.yaxis] = axis(theme, panel.domain.y, names.x, "Runtime (s)", logRange(panel.y));
}

function throughputLines(
  panel: LogPanel,
  rates: readonly number[],
  theme: ChartTheme,
): { traces: Trace[]; labels: Record<string, unknown>[] } {
  const names = axisNames(panel.index);
  const traces: Trace[] = [];
  const labels: Record<string, unknown>[] = [];
  const [xMin, xMax] = panel.x;
  const [yMin, yMax] = panel.y;
  for (const rate of rates) {
    const bytesPerSecond = rate * 1e6;
    const start = Math.max(xMin, yMin * bytesPerSecond);
    const end = Math.min(xMax, yMax * bytesPerSecond);
    if (start >= end) continue;
    traces.push({
      type: "scatter",
      mode: "lines",
      xaxis: names.x,
      yaxis: names.y,
      x: [start, end],
      y: [start / bytesPerSecond, end / bytesPerSecond],
      line: { color: theme.guide, dash: "dash", width: 1 },
      hoverinfo: "skip",
      showlegend: false,
    });
    // Labelled inside the plot where the line leaves it: above the line at the right edge, beside it at the top.
    const atRight = end === xMax;
    labels.push({
      text: `${rate} MB/s`,
      xref: names.x,
      yref: names.y,
      x: Math.log10(end),
      y: Math.log10(end / bytesPerSecond),
      xanchor: "right",
      yanchor: atRight ? "bottom" : "top",
      xshift: atRight ? -2 : -4,
      yshift: atRight ? 2 : -2,
      showarrow: false,
      font: { size: 10, color: theme.muted },
    });
  }
  return { traces, labels };
}

class LegendTracker {
  private readonly shown = new Set<string>();
  /** Whether this is the first trace of its legend entry, which is the one that shows it. */
  first(label: string): boolean {
    if (this.shown.has(label)) return false;
    this.shown.add(label);
    return true;
  }
}

function methodTrace(
  method: string,
  points: TrafficPoint[],
  panel: LogPanel,
  symbols: string[],
  hover: string[],
  theme: ChartTheme,
  legend: LegendTracker,
): Trace {
  const names = axisNames(panel.index);
  const label = methodLabel(method);
  const color = theme.color(methodColor(method));
  return {
    type: "scatter",
    mode: "lines+markers",
    xaxis: names.x,
    yaxis: names.y,
    x: points.map((point) => point.network.mean),
    y: points.map((point) => point.runtime.mean),
    line: { color, dash: plotlyDash(methodLineStyle(method)), width: 1.5 },
    marker: { color, symbol: symbols, size: 8, line: { color: theme.surface, width: 1 } },
    name: label,
    legendgroup: label,
    showlegend: legend.first(label),
    customdata: hover,
    hovertemplate: "%{customdata}<extra></extra>",
  };
}

/** The panels' cells, worked out before the grid so each panel's height can follow its width. */
function panelHeight(width: number, count: number): number {
  const columns = Math.max(1, Math.min(count, Math.floor(width / 340)));
  const plotWidth = width / columns - PADDING.left - PADDING.right;
  return Math.round(Math.min(360, Math.max(240, plotWidth * 0.78)));
}

/** `ax.inset_axes([0.58, 0.095, 0.40, 0.34])`: the slices whose network runs measured no traffic, by slice size. */
function zeroTrafficInset(
  points: TrafficPoint[],
  metric: string,
  parent: LogPanel,
  index: number,
  grid: GridLayout,
  theme: ChartTheme,
  layout: Layout,
  legend: LegendTracker,
): Trace[] {
  const names = axisNames(index);
  const [x0, x1] = parent.domain.x;
  const [y0, y1] = parent.domain.y;
  const domain: Domain = {
    x: [x0 + 0.58 * (x1 - x0), x0 + 0.98 * (x1 - x0)],
    y: [y0 + 0.095 * (y1 - y0) + grid.fy(14), y0 + 0.435 * (y1 - y0)],
  };
  const slices = points.map((point) => point.sliceNumber ?? 0);
  const runtimes = points.map((point) => point.runtime.mean);
  const [minRuntime, maxRuntime] = [Math.min(...runtimes), Math.max(...runtimes)];
  const logY = minRuntime > 0 && maxRuntime / minRuntime > 20;
  const small = { color: theme.muted, size: 9 };
  layout[names.xaxis] = axis(theme, domain.x, names.y, "", {
    tickvals: [Math.min(...slices), Math.max(...slices)],
    tickfont: small,
    showgrid: false,
    fixedrange: true,
  });
  layout[names.yaxis] = axis(theme, domain.y, names.x, "", {
    type: logY ? "log" : "linear",
    tickvals: [minRuntime, maxRuntime],
    ticktext: [formatG(minRuntime, 2), formatG(maxRuntime, 2)],
    tickfont: small,
    showgrid: false,
    fixedrange: true,
  });
  (layout.annotations as Record<string, unknown>[]).push({
    text: "no traffic measured",
    xref: "paper",
    yref: "paper",
    x: (domain.x[0] + domain.x[1]) / 2,
    y: domain.y[1],
    yanchor: "bottom",
    showarrow: false,
    font: small,
    bgcolor: theme.surface,
  });
  const panel: LogPanel = { index, domain, x: [0, 0], y: [0, 0] };
  return [...new Set(points.map((point) => point.method))].map((method) => {
    const ofMethod = points.filter((point) => point.method === method);
    const trace = methodTrace(
      method,
      ofMethod,
      panel,
      ofMethod.map(() => plotlySymbol(methodMarker(method))),
      ofMethod.map((point) => pointHover(`${methodLabel(method)} · slice ${point.sliceNumber ?? "?"}`, point, metric)),
      theme,
      legend,
    );
    return {
      ...trace,
      x: ofMethod.map((point) => point.sliceNumber ?? 0),
      marker: { ...(trace.marker as object), size: 5 },
    };
  });
}

export function trafficFigure(
  fileOpen: FileOpenTraffic[],
  slicing: SlicingTraffic,
  { width, theme, letters }: FigureOptions,
): FigureSpec {
  const titles = [...fileOpen.map((figure) => figure.title), ...slicing.panels.map((panel) => panel.modality)];
  const methods = new Set([...fileOpen.flatMap((figure) => figure.methods), ...slicing.methods].map(methodLabel));
  const fileOpenModalities = Object.keys(MODALITY_MARKERS);
  const legendLabels = [...methods, ...fileOpenModalities.map(modalityLegendLabel)];
  const beside = width >= SIDE_LEGEND_MIN_WIDTH;
  const right = beside ? legendWidth(legendLabels) : 0;
  const grid = gridLayout({
    width,
    panelHeights: titles.map(() => panelHeight(width - right, titles.length)),
    minPanelWidth: 340,
    padding: PADDING,
    bottom: beside ? 8 : legendHeight(legendLabels.length, width),
    right,
  });
  const layout = baseLayout(theme, grid, true);
  if (beside) {
    layout.legend = {
      ...(layout.legend as object),
      orientation: "v",
      x: 1 + grid.fx(SIDE_LEGEND_GAP),
      xanchor: "left",
      y: 0.5,
      yanchor: "middle",
      tracegroupgap: 4,
    };
  }
  const annotations = layout.annotations as Record<string, unknown>[];
  const legend = new LegendTracker();
  const data: Trace[] = [];
  let nextAxis = titles.length;

  const addPanel = (
    index: number,
    points: TrafficPoint[],
    metric: string,
    rates: readonly number[],
  ): LogPanel | null => {
    const domain = grid.domains[index];
    annotations.push(...panelLabels(theme, grid, domain, titles[index], panelLetter(letters, index), PADDING));
    const x = logDomain(points.map((point) => point.network.mean));
    const y = logDomain(points.map((point) => point.runtime.mean));
    const names = axisNames(index);
    if (!x || !y) {
      layout[names.xaxis] = axis(theme, domain.x, names.y, "", { visible: false });
      layout[names.yaxis] = axis(theme, domain.y, names.x, "", { visible: false });
      return null;
    }
    const panel: LogPanel = { index, domain, x, y };
    logAxes(layout, theme, panel, metric);
    const guides = throughputLines(panel, rates, theme);
    data.push(...guides.traces);
    annotations.push(...guides.labels);
    return panel;
  };

  fileOpen.forEach((figure, index) => {
    const panel = addPanel(index, figure.points, figure.metric, figure.throughputRates);
    if (!panel) {
      annotations.push(noData(grid.domains[index], "No data", theme));
      return;
    }
    for (const method of figure.methods) {
      const points = fileOpenModalities.flatMap((modality) =>
        figure.points.filter((point) => point.method === method && point.modality === modality),
      );
      data.push(
        methodTrace(
          method,
          points,
          panel,
          points.map((point) => plotlySymbol(MODALITY_MARKERS[point.modality])),
          points.map((point) => pointHover(`${methodLabel(method)} · ${point.modality}`, point, figure.metric)),
          theme,
          legend,
        ),
      );
    }
  });

  slicing.panels.forEach((slicingPanel: SlicingTrafficPanel, offset) => {
    const index = fileOpen.length + offset;
    const panel = addPanel(index, slicingPanel.points, slicing.metric, slicing.throughputRates);
    if (!panel) {
      annotations.push(
        noData(grid.domains[index], slicingPanel.zeroTraffic.length ? "No traffic measured" : "No data", theme),
      );
      return;
    }
    const names = axisNames(index);
    for (const method of slicing.methods) {
      const points = slicingPanel.points.filter((point) => point.method === method);
      if (points.length === 0) continue;
      data.push(
        methodTrace(
          method,
          points,
          panel,
          points.map(() => plotlySymbol(methodMarker(method))),
          points.map((point) =>
            pointHover(
              `${methodLabel(method)} · ${slicingPanel.modality} · slice ${point.sliceNumber ?? "?"}`,
              point,
              slicing.metric,
            ),
          ),
          theme,
          legend,
        ),
      );
      const last = points[points.length - 1];
      annotations.push({
        text: String(last.sliceNumber ?? ""),
        xref: names.x,
        yref: names.y,
        x: Math.log10(last.network.mean),
        y: Math.log10(last.runtime.mean),
        xanchor: "left",
        yanchor: "bottom",
        xshift: 3,
        yshift: 2,
        showarrow: false,
        font: { size: 10, color: theme.muted },
      });
    }
    if (slicingPanel.zeroTraffic.length) {
      data.push(
        ...zeroTrafficInset(slicingPanel.zeroTraffic, slicing.metric, panel, nextAxis, grid, theme, layout, legend),
      );
      nextAxis++;
    }
  });

  // The modalities' markers, which the file-opening panels tell apart by shape.
  for (const modality of fileOpenModalities) {
    data.push({
      type: "scatter",
      mode: "markers",
      x: [null],
      y: [null],
      marker: { color: theme.text, symbol: plotlySymbol(MODALITY_MARKERS[modality]), size: 8 },
      name: modalityLegendLabel(modality),
      legendgroup: `modality-${modality}`,
      hoverinfo: "skip",
    });
  }
  return { data, layout };
}

function modalityLegendLabel(modality: string): string {
  return `${modality} (file opening)`;
}

function noData(domain: Domain, message: string, theme: ChartTheme): Record<string, unknown> {
  return {
    text: message,
    xref: "paper",
    yref: "paper",
    x: (domain.x[0] + domain.x[1]) / 2,
    y: (domain.y[0] + domain.y[1]) / 2,
    showarrow: false,
    font: { color: theme.muted },
  };
}

export interface TrafficRow {
  panel: string;
  point: TrafficPoint;
  metric: string;
}

export function trafficRows(fileOpen: FileOpenTraffic[], slicing: SlicingTraffic): TrafficRow[] {
  const slicingTitle = `Remote slicing - ${slicing.preloaded ? "preloaded" : "not preloaded"}`;
  return [
    ...fileOpen.flatMap((figure) =>
      figure.points.map((point) => ({
        panel: figure.title,
        point,
        metric: figure.metric,
      })),
    ),
    ...slicing.panels.flatMap((panel) =>
      [...panel.points, ...panel.zeroTraffic].map((point) => ({
        panel: slicingTitle,
        point,
        metric: slicing.metric,
      })),
    ),
  ];
}

export const TRAFFIC_COLUMNS: Column<TrafficRow>[] = [
  { label: "Task", value: (row) => row.panel },
  { label: "Method", value: (row) => methodLabel(row.point.method) },
  { label: "Method (benchmark name)", value: (row) => row.point.method },
  { label: "Modality", value: (row) => row.point.modality },
  { label: "Slice number", value: (row) => row.point.sliceNumber },
  { label: "Runtime n", value: (row) => row.point.runtime.n },
  { label: "Runtime mean (s)", value: (row) => row.point.runtime.mean },
  { label: "Runtime median (s)", value: (row) => row.point.runtime.median },
  { label: "Runtime std (s)", value: (row) => row.point.runtime.std },
  { label: "Network metric", value: (row) => row.metric },
  { label: "Network n", value: (row) => row.point.network.n },
  { label: "Network mean", value: (row) => row.point.network.mean },
  { label: "Network median", value: (row) => row.point.network.median },
  { label: "Network std", value: (row) => row.point.network.std },
];
