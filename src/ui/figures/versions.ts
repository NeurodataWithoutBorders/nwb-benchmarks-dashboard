// Draws the paper's Figure 4b: per-modality point plots of the mean runtime of each PyNWB method
// across environments (or package versions), joined by lines, with 95 % bootstrap intervals.

import { svgText } from "@brain-bbqs/ui";
import type { Column } from "../../lib/csv";
import { formatG, formatSeconds, formatTick } from "../../lib/format";
import type { PerformanceAcrossVersions, VersionPanel, VersionPoint } from "../../lib/figures/versions";
import { methodColor, methodLabel, methodLineStyle, methodMarker } from "../../lib/methods";
import { extent, niceDomain } from "../../lib/scale";
import { emptyPanel, onHover, panelSlots, slotWidth, type LegendEntry, type Tooltip } from "../charts/chrome";
import { createPanel, errorBar, hitTarget, line, marker } from "../charts/svg";

function panelTitle(panel: VersionPanel): string {
  if (panel.preloaded === null) return panel.modality;
  return `${panel.modality} · ${panel.preloaded ? "preloaded" : "not preloaded"}`;
}

function drawPanel(
  slot: HTMLElement,
  figure: PerformanceAcrossVersions,
  panel: VersionPanel,
  axisLabel: string,
  tooltip: Tooltip,
): void {
  const values = panel.series.flatMap((series) =>
    series.points.flatMap((point) => [point.summary.mean, ...(point.interval ?? [])]),
  );
  const range = extent(values, { pad: 0.08 });
  if (!range) {
    emptyPanel(slot, panelTitle(panel));
    return;
  }
  const width = slotWidth(slot);
  const groups = figure.groups;
  const index = new Map(groups.map((group, position) => [group.key, position]));
  const labels = groups.map((group) => group.label);
  const longest = Math.max(...labels.map((label) => label.length));
  // Long labels (package versions are short, environment labels are not) turn to fit.
  const slanted = longest * 6.5 > (width - 80) / Math.max(1, groups.length);
  // Room under the axis for the longest slanted label (35 degrees, about 6 px a character).
  const slantRoom = slanted ? Math.ceil(longest * 6 * Math.sin((35 * Math.PI) / 180)) + 16 : 0;
  const panelView = createPanel({
    width,
    height: Math.round(Math.min(380, Math.max(280, width * 0.7))) + slantRoom,
    title: panelTitle(panel),
    x: {
      domain: [-0.5, groups.length - 0.5],
      label: axisLabel,
      ticks: groups.map((_group, position) => position),
      format: (value) => (slanted ? "" : (labels[Math.round(value)] ?? "")),
    },
    y: { domain: niceDomain(Math.max(0, range[0]), range[1], 4), label: "Time (s)", format: formatTick },
    margin: slanted ? { bottom: 44 + slantRoom } : undefined,
    description: `${panelTitle(panel)}: mean time per method across ${axisLabel.toLowerCase()}`,
  });
  if (slanted) {
    groups.forEach((group, position) => {
      const x = panelView.x(position);
      const y = panelView.inner.bottom + 12;
      panelView.overlay.append(
        svgText("tick", { x, y, "text-anchor": "end", transform: `rotate(-35 ${x} ${y})` }, group.label),
      );
    });
  }
  for (const series of panel.series) {
    const color = methodColor(series.method);
    const position = (point: VersionPoint): number => panelView.x(index.get(point.group) ?? 0);
    panelView.plot.append(
      line(
        series.points.map((point) => [position(point), panelView.y(point.summary.mean)]),
        color,
        methodLineStyle(series.method),
      ),
    );
    for (const point of series.points) {
      const x = position(point);
      const y = panelView.y(point.summary.mean);
      if (point.interval)
        panelView.plot.append(errorBar(x, panelView.y(point.interval[0]), panelView.y(point.interval[1]), color));
      panelView.plot.append(marker(methodMarker(series.method), x, y, color, 8));
      const target = hitTarget(x, y);
      panelView.overlay.append(target);
      const group = groups.find((candidate) => candidate.key === point.group);
      onHover(target, tooltip, `${methodLabel(series.method)} · ${group?.label ?? point.group}`, () => [
        { label: `mean (n = ${point.summary.n})`, value: formatSeconds(point.summary.mean) },
        {
          label: "95% interval",
          value: point.interval ? `${formatG(point.interval[0], 3)}–${formatG(point.interval[1], 3)} s` : "–",
        },
        { label: "median", value: formatSeconds(point.summary.median) },
      ]);
    }
  }
  slot.replaceChildren(panelView.svg);
}

export function renderVersions(
  target: HTMLElement,
  figure: PerformanceAcrossVersions,
  axisLabel: string,
  tooltip: Tooltip,
): void {
  const slots = panelSlots(target, figure.panels.length, 300);
  figure.panels.forEach((panel, position) => drawPanel(slots[position], figure, panel, axisLabel, tooltip));
}

export function versionsLegend(figure: PerformanceAcrossVersions): LegendEntry[] {
  return figure.methods.map((method) => ({
    label: methodLabel(method),
    color: methodColor(method),
    lineStyle: methodLineStyle(method),
    marker: methodMarker(method),
  }));
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
