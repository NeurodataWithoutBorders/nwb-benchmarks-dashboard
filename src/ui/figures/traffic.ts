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
    x: { log: true, domain: xDomain, label: metricLabel(figure.metric), format: formatCompact },
    y: { log: true, domain: yDomain, label: "Runtime (s)", format: formatCompact },
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

function drawZeroTrafficInset(panel: Panel, points: TrafficPoint[]): void {
  const { inner } = panel;
  const width = (inner.right - inner.left) * 0.42;
  const height = (inner.bottom - inner.top) * 0.36;
  const left = inner.right - width - 6;
  const top = inner.bottom - height - 6;
  const group = svgEl("g", { class: "chart-inset" });
  group.append(
    svgEl("rect", {
      class: "chart-inset-frame",
      x: left - 30,
      y: top - 16,
      width: width + 34,
      height: height + 34,
      rx: 4,
    }),
  );
  group.append(
    svgText("inset-title", { x: left + width / 2 - 13, y: top - 5, "text-anchor": "middle" }, "no traffic measured"),
  );
  const slices = points.map((point) => point.sliceNumber ?? 0);
  const runtimes = points.map((point) => point.runtime.mean);
  const [minSlice, maxSlice] = [Math.min(...slices), Math.max(...slices)];
  const [minRuntime, maxRuntime] = [Math.min(...runtimes), Math.max(...runtimes)];
  const logY = minRuntime > 0 && maxRuntime / minRuntime > 20;
  const x = (slice: number): number => left + ((slice - minSlice) / (maxSlice - minSlice || 1)) * width;
  const y: (runtime: number) => number = logY
    ? (runtime) =>
        top +
        height -
        ((Math.log10(runtime) - Math.log10(minRuntime)) / (Math.log10(maxRuntime) - Math.log10(minRuntime) || 1)) *
          height
    : (runtime) => top + height - ((runtime - minRuntime) / (maxRuntime - minRuntime || 1)) * height;
  group.append(svgText("inset-tick", { x: left - 3, y: top + 4, "text-anchor": "end" }, formatG(maxRuntime, 2)));
  group.append(
    svgText("inset-tick", { x: left - 3, y: top + height + 2, "text-anchor": "end" }, formatG(minRuntime, 2)),
  );
  group.append(svgText("inset-tick", { x: left, y: top + height + 12, "text-anchor": "middle" }, String(minSlice)));
  group.append(
    svgText("inset-tick", { x: left + width, y: top + height + 12, "text-anchor": "middle" }, String(maxSlice)),
  );
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
    x: { log: true, domain: xDomain, label: metricLabel(figure.metric), format: formatCompact },
    y: { log: true, domain: yDomain, label: "Runtime (s)", format: formatCompact },
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
      figure.points.map((point) => ({ panel: figure.title, point, metric: figure.metric })),
    ),
    ...slicing.panels.flatMap((panel) =>
      [...panel.points, ...panel.zeroTraffic].map((point) => ({ panel: slicingTitle, point, metric: slicing.metric })),
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
