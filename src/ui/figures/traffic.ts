// Draws the paper's Figure 5: traffic against runtime on log-log axes, for backend and PyNWB file
// opening (methods joined across modalities) and for slicing (methods followed across slice sizes).

import { svgEl, svgText } from "@brain-bbqs/ui";
import type { Column } from "../../lib/csv";
import { formatCompact, formatG, formatMetric, formatSeconds } from "../../lib/format";
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
import {
  emptyPanel,
  onHover,
  panelSlots,
  slotWidth,
  type LegendEntry,
  type Tooltip,
  type TooltipLine,
} from "../charts/chrome";
import { annotation, createPanel, hitTarget, line, marker, throughputLines, type Panel } from "../charts/svg";

function panelHeight(width: number): number {
  return Math.round(Math.min(440, Math.max(300, width * 0.78)));
}

function logDomain(values: number[]): [number, number] | null {
  const range = extent(values, { log: true, pad: 0 });
  if (!range) return null;
  // `_plot_slicing_network_runtime_trajectories` pads by a factor of 1.6 either side.
  return [range[0] / 1.6, range[1] * 1.6];
}

function metricLabel(metric: string): string {
  return NETWORK_METRIC_LABELS[metric] ?? metric;
}

function pointLines(point: TrafficPoint, metric: string): TooltipLine[] {
  const lines: TooltipLine[] = [
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
  return lines;
}

function addLetter(panel: Panel, letter: string): void {
  panel.svg.append(svgText("panel-letter", { x: 2, y: 16 }, letter));
}

function drawFileOpen(slot: HTMLElement, figure: FileOpenTraffic, letter: string, tooltip: Tooltip): void {
  const xDomain = logDomain(figure.points.map((point) => point.network.mean));
  const yDomain = logDomain(figure.points.map((point) => point.runtime.mean));
  if (!xDomain || !yDomain) {
    emptyPanel(slot, figure.title);
    return;
  }
  const width = slotWidth(slot);
  const panel = createPanel({
    width,
    height: panelHeight(width),
    title: figure.title,
    x: {
      log: true,
      domain: xDomain,
      label: metricLabel(figure.metric),
      format: formatCompact,
    },
    y: {
      log: true,
      domain: yDomain,
      label: "Runtime (s)",
      format: formatCompact,
    },
    description: `${figure.title}: ${metricLabel(figure.metric)} against runtime, per method and modality`,
  });
  addLetter(panel, letter);
  throughputLines(panel, figure.throughputRates);
  for (const method of figure.methods) {
    const points = ["Ecephys", "Ophys", "Icephys"].flatMap((modality) =>
      figure.points.filter((point) => point.method === method && point.modality === modality),
    );
    const color = methodColor(method);
    panel.plot.append(
      line(
        points.map((point) => [panel.x(point.network.mean), panel.y(point.runtime.mean)]),
        color,
        methodLineStyle(method),
        1.5,
      ),
    );
    for (const point of points) {
      const x = panel.x(point.network.mean);
      const y = panel.y(point.runtime.mean);
      panel.plot.append(marker(MODALITY_MARKERS[point.modality], x, y, color, 9));
      const target = hitTarget(x, y);
      panel.overlay.append(target);
      onHover(target, tooltip, `${methodLabel(method)} · ${point.modality}`, () => pointLines(point, figure.metric));
    }
  }
  slot.replaceChildren(panel.svg);
}

// The inset's 9px type, by a generous average glyph width, so labels are measured without a layout pass.
const INSET_CHAR_WIDTH = 5.5;
const INSET_PAD = 4;
const INSET_TITLE_HEIGHT = 13;
const INSET_X_AXIS_HEIGHT = 13;

interface Box {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export interface InsetLayout {
  /** The backdrop, holding the title and tick labels as well as the plot box. */
  frame: Box;
  /** Where the inset's points go. */
  box: Box;
}

/** `ax.inset_axes([0.58, 0.095, 0.40, 0.34])` in `_plot_slicing_network_runtime_trajectories`: a plot box
 * 40% by 34% of the panel's plot area at its lower right, shrunk where needed so that its frame, tick
 * labels included, stays inside the plot area rather than over the axes. */
export function zeroTrafficInsetLayout(inner: Box, yLabelChars: number): InsetLayout {
  const gutter = INSET_PAD + yLabelChars * INSET_CHAR_WIDTH + 3;
  const right = inner.right - 3 * INSET_PAD;
  const bottom = inner.bottom - INSET_PAD - INSET_X_AXIS_HEIGHT - INSET_PAD;
  const width = Math.min((inner.right - inner.left) * 0.4, right - inner.left - INSET_PAD - gutter);
  const height = Math.min((inner.bottom - inner.top) * 0.34, bottom - inner.top - 2 * INSET_PAD - INSET_TITLE_HEIGHT);
  const box = { left: right - width, top: bottom - height, right, bottom };
  return {
    box,
    frame: {
      left: box.left - gutter,
      top: box.top - INSET_TITLE_HEIGHT - INSET_PAD,
      right: inner.right - INSET_PAD,
      bottom: inner.bottom - INSET_PAD,
    },
  };
}

function drawZeroTrafficInset(panel: Panel, points: TrafficPoint[]): void {
  const slices = points.map((point) => point.sliceNumber ?? 0);
  const runtimes = points.map((point) => point.runtime.mean);
  const [minSlice, maxSlice] = [Math.min(...slices), Math.max(...slices)];
  const [minRuntime, maxRuntime] = [Math.min(...runtimes), Math.max(...runtimes)];
  const yLabels = [formatG(maxRuntime, 2), formatG(minRuntime, 2)];
  const { frame, box } = zeroTrafficInsetLayout(panel.inner, Math.max(...yLabels.map((label) => label.length)));
  // Markers keep clear of the box's edges and the labels beside them.
  const plot = {
    left: box.left + INSET_PAD,
    top: box.top + INSET_PAD,
    right: box.right - INSET_PAD,
    bottom: box.bottom - INSET_PAD,
  };
  const group = svgEl("g", { class: "chart-inset" });
  group.append(
    svgEl("rect", {
      class: "chart-inset-frame",
      x: frame.left,
      y: frame.top,
      width: frame.right - frame.left,
      height: frame.bottom - frame.top,
      rx: 4,
    }),
    svgEl("rect", {
      class: "chart-inset-box",
      x: box.left,
      y: box.top,
      width: box.right - box.left,
      height: box.bottom - box.top,
    }),
    svgText(
      "inset-title",
      {
        x: (frame.left + frame.right) / 2,
        y: frame.top + INSET_PAD + 8,
        "text-anchor": "middle",
      },
      "no traffic measured",
    ),
    svgText("inset-tick", { x: box.left - 3, y: plot.top + 3, "text-anchor": "end" }, yLabels[0]),
    svgText("inset-tick", { x: box.left - 3, y: plot.bottom + 3, "text-anchor": "end" }, yLabels[1]),
    svgText("inset-tick", { x: plot.left, y: box.bottom + 11, "text-anchor": "middle" }, String(minSlice)),
    svgText(
      "inset-tick",
      {
        x: (box.left + box.right) / 2,
        y: box.bottom + 11,
        "text-anchor": "middle",
      },
      "slice",
    ),
    svgText("inset-tick", { x: plot.right, y: box.bottom + 11, "text-anchor": "middle" }, String(maxSlice)),
  );
  const logY = minRuntime > 0 && maxRuntime / minRuntime > 20;
  const x = (slice: number): number =>
    plot.left + ((slice - minSlice) / (maxSlice - minSlice || 1)) * (plot.right - plot.left);
  const yFraction = logY
    ? (runtime: number) =>
        (Math.log10(runtime) - Math.log10(minRuntime)) / (Math.log10(maxRuntime) - Math.log10(minRuntime) || 1)
    : (runtime: number) => (runtime - minRuntime) / (maxRuntime - minRuntime || 1);
  const y = (runtime: number): number => plot.bottom - yFraction(runtime) * (plot.bottom - plot.top);
  for (const method of new Set(points.map((point) => point.method))) {
    const ofMethod = points.filter((point) => point.method === method);
    const color = methodColor(method);
    group.append(
      line(
        ofMethod.map((point) => [x(point.sliceNumber ?? 0), y(point.runtime.mean)]),
        color,
        methodLineStyle(method),
        1.2,
      ),
    );
    for (const point of ofMethod)
      group.append(marker(methodMarker(method), x(point.sliceNumber ?? 0), y(point.runtime.mean), color, 5));
  }
  panel.overlay.append(group);
}

function drawTrajectories(
  slot: HTMLElement,
  data: SlicingTrafficPanel,
  figure: SlicingTraffic,
  letter: string,
  tooltip: Tooltip,
): void {
  const xDomain = logDomain(data.points.map((point) => point.network.mean));
  const yDomain = logDomain(data.points.map((point) => point.runtime.mean));
  if (!xDomain || !yDomain) {
    emptyPanel(slot, data.modality, data.zeroTraffic.length ? "No traffic measured" : "No data");
    return;
  }
  const width = slotWidth(slot);
  const panel = createPanel({
    width,
    height: panelHeight(width),
    title: data.modality,
    x: {
      log: true,
      domain: xDomain,
      label: metricLabel(figure.metric),
      format: formatCompact,
    },
    y: {
      log: true,
      domain: yDomain,
      label: "Runtime (s)",
      format: formatCompact,
    },
    description: `${data.modality} slicing: ${metricLabel(figure.metric)} against runtime with increasing slice size`,
  });
  addLetter(panel, letter);
  throughputLines(panel, figure.throughputRates);
  for (const method of figure.methods) {
    const points = data.points.filter((point) => point.method === method);
    if (points.length === 0) continue;
    const color = methodColor(method);
    const projected = points.map((point): [number, number] => [
      panel.x(point.network.mean),
      panel.y(point.runtime.mean),
    ]);
    panel.plot.append(line(projected, color, methodLineStyle(method), 1.5));
    points.forEach((point, index) => {
      const [x, y] = projected[index];
      panel.plot.append(marker(methodMarker(method), x, y, color, 7));
      const target = hitTarget(x, y, 10);
      panel.overlay.append(target);
      onHover(target, tooltip, `${methodLabel(method)} · ${data.modality} · slice ${point.sliceNumber ?? "?"}`, () =>
        pointLines(point, figure.metric),
      );
    });
    const [lastX, lastY] = projected[projected.length - 1];
    panel.overlay.append(annotation(lastX, lastY, String(points[points.length - 1].sliceNumber ?? "")));
  }
  if (data.zeroTraffic.length) drawZeroTrafficInset(panel, data.zeroTraffic);
  slot.replaceChildren(panel.svg);
}

export function renderTraffic(
  target: HTMLElement,
  fileOpen: FileOpenTraffic[],
  slicing: SlicingTraffic,
  tooltip: Tooltip,
): void {
  const slots = panelSlots(target, fileOpen.length + slicing.panels.length, 340);
  fileOpen.forEach((figure, index) => drawFileOpen(slots[index], figure, `${"ab"[index]})`, tooltip));
  slicing.panels.forEach((panel, index) =>
    drawTrajectories(slots[fileOpen.length + index], panel, slicing, `${"cde"[index]})`, tooltip),
  );
}

export function trafficLegend(fileOpen: FileOpenTraffic[], slicing: SlicingTraffic): LegendEntry[] {
  const methods = new Map<string, string>();
  for (const method of [...fileOpen.flatMap((figure) => figure.methods), ...slicing.methods]) {
    const label = methodLabel(method);
    if (!methods.has(label)) methods.set(label, method);
  }
  return [
    ...[...methods.entries()].map(([label, method]) => ({
      label,
      color: methodColor(method),
      lineStyle: methodLineStyle(method),
      marker: methodMarker(method),
    })),
    ...Object.entries(MODALITY_MARKERS).map(([modality, shape]) => ({
      label: `${modality} (panels a, b)`,
      color: "var(--text)",
      lineStyle: null,
      marker: shape,
    })),
  ];
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
