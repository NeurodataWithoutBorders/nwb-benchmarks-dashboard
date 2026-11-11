// Draws the incremental slicing figure: per modality, the median cumulative time of each curve with
// its range across runs as a band, and a cross where streaming first falls behind downloading.

import type { Column } from "../../lib/csv";
import { formatSeconds, formatTick } from "../../lib/format";
import { incrementalOverview, type IncrementalOverview, type IncrementalPanel } from "../../lib/figures/incremental";
import { extent, niceDomain } from "../../lib/scale";
import { onHover, panelSlots, slotWidth, type LegendEntry, type Tooltip } from "../charts/chrome";
import { band, createPanel, cross, hitTarget, line } from "../charts/svg";

export type TimeAxis = "linear" | "log";

function drawPanel(slot: HTMLElement, panel: IncrementalPanel, axis: TimeAxis, tooltip: Tooltip): void {
  const log = axis === "log";
  const values = panel.curves.flatMap((curve) => curve.points.flatMap((point) => [point.min, point.max, point.median]));
  const range = extent(values, { log, pad: log ? 0.02 : 0.04 }) ?? [0.1, 1];
  const lastIndex = Math.max(...panel.curves.flatMap((curve) => curve.points.map((point) => point.sliceIndex)));
  const width = slotWidth(slot);
  const view = createPanel({
    width,
    height: Math.round(Math.min(400, Math.max(300, width * 0.75))),
    title: panel.modality,
    x: {
      domain: [0, Math.max(1, lastIndex)],
      label: panel.modality === "Icephys" ? "Number of TimeSeries read" : "Number of slices read",
      format: formatTick,
    },
    y: {
      log,
      domain: log ? range : niceDomain(Math.max(0, range[0]), range[1], 5),
      label: log ? "Cumulative time (s, log scale)" : "Cumulative time (s)",
      format: formatTick,
    },
    margin: { left: 62 },
    description: `${panel.modality}: cumulative time to read every slice, streaming against downloading first`,
  });
  const y = (value: number): number => (log && value <= 0 ? view.inner.bottom : view.y(value));
  for (const curve of panel.curves) {
    if (curve.points.some((point) => point.n > 1)) {
      view.plot.append(
        band(
          curve.points.map((point) => [view.x(point.sliceIndex), y(point.max)]),
          curve.points.map((point) => [view.x(point.sliceIndex), y(point.min)]),
          curve.color,
        ),
      );
    }
    view.plot.append(
      line(
        curve.points.map((point) => [view.x(point.sliceIndex), y(point.median)]),
        curve.color,
        curve.lineStyle,
      ),
    );
  }
  for (const curve of panel.curves) {
    if (curve.crossover === null) continue;
    const point = curve.points[curve.crossover];
    const x = view.x(point.sliceIndex);
    const yPosition = y(point.median);
    view.overlay.append(cross(x, yPosition, curve.color));
    const target = hitTarget(x, yPosition);
    view.overlay.append(target);
    onHover(target, tooltip, `${curve.label} · ${panel.modality}`, () => [
      { label: "first slice slower than downloading first", value: String(point.sliceIndex) },
      { label: "cumulative time there", value: formatSeconds(point.median) },
    ]);
  }
  slot.replaceChildren(view.svg);
}

export function renderIncremental(
  target: HTMLElement,
  panels: IncrementalPanel[],
  axis: TimeAxis,
  tooltip: Tooltip,
): void {
  const slots = panelSlots(target, panels.length, 300);
  panels.forEach((panel, index) => drawPanel(slots[index], panel, axis, tooltip));
}

export function incrementalLegend(panels: IncrementalPanel[]): LegendEntry[] {
  const seen = new Map<string, LegendEntry>();
  for (const curve of panels.flatMap((panel) => panel.curves)) {
    if (!seen.has(curve.label))
      seen.set(curve.label, { label: curve.label, color: curve.color, lineStyle: curve.lineStyle });
  }
  return [...seen.values()];
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
