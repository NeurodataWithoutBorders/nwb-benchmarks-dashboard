// Draws the paper's Figure 4a: for each modality, the fitted streaming line of each method (solid)
// against the fitted download-first line of its file format (dashed), from zero slices to a little
// past where they cross, with the crossing marked.

import type { Column } from "../../lib/csv";
import { formatG, formatSeconds, formatTick } from "../../lib/format";
import type { Extrapolation } from "../../lib/figures/extrapolation";
import {
  downloadColor,
  FORMAT_FAMILY_LABELS,
  methodColor,
  methodLabel,
  methodLineStyle,
  orderMethods,
} from "../../lib/methods";
import { niceDomain } from "../../lib/scale";
import { MODALITY_ORDER } from "../../lib/benchmarkNames";
import { emptyPanel, onHover, panelSlots, slotWidth, type LegendEntry, type Tooltip } from "../charts/chrome";
import { createPanel, cross, hitTarget, line } from "../charts/svg";

/** The x range `plot_linear_extrapolation_with_intersection` draws a fit over. */
export function drawnRange(fit: Extrapolation): number {
  const x = fit.crossover?.x ?? 0;
  return Math.max(x * 1.2, x + 2);
}

function drawPanel(slot: HTMLElement, modality: string, fits: Extrapolation[], tooltip: Tooltip): void {
  const drawn = fits.filter((fit) => fit.crossover !== null);
  if (drawn.length === 0) {
    emptyPanel(slot, modality, fits.length ? "No crossover in the positive quadrant" : "No data");
    return;
  }
  const xMax = Math.max(...drawn.map(drawnRange));
  const yValues = drawn.flatMap((fit) => {
    const end = drawnRange(fit);
    return [
      fit.stream.intercept,
      fit.stream.slope * end + fit.stream.intercept,
      fit.download.intercept,
      fit.download.slope * end + fit.download.intercept,
    ];
  });
  const width = slotWidth(slot);
  const panel = createPanel({
    width,
    height: Math.round(Math.min(400, Math.max(300, width * 0.75))),
    title: modality,
    x: { domain: niceDomain(0, xMax, 5), label: "Number of slices", format: formatTick },
    y: { domain: niceDomain(Math.min(0, ...yValues), Math.max(...yValues), 5), label: "Time (s)", format: formatTick },
    margin: { left: 62 },
    description: `${modality}: streaming against download-first time with increasing slices`,
  });
  for (const fit of drawn) {
    const end = drawnRange(fit);
    const along = (slope: number, intercept: number): [number, number][] => [
      [panel.x(0), panel.y(intercept)],
      [panel.x(end), panel.y(slope * end + intercept)],
    ];
    panel.plot.append(
      line(along(fit.download.slope, fit.download.intercept), downloadColor(fit.formatFamily), "dashed"),
    );
    const color = methodColor(fit.method);
    panel.plot.append(line(along(fit.stream.slope, fit.stream.intercept), color, methodLineStyle(fit.method)));
  }
  for (const fit of drawn) {
    const crossover = fit.crossover as { x: number; y: number };
    const x = panel.x(crossover.x);
    const y = panel.y(crossover.y);
    panel.overlay.append(cross(x, y, methodColor(fit.method)));
    const target = hitTarget(x, y);
    panel.overlay.append(target);
    onHover(target, tooltip, `${methodLabel(fit.method)} · ${modality}`, () => [
      { label: "slices where downloading first catches up", value: formatG(crossover.x, 3) },
      { label: "time at that point", value: formatSeconds(crossover.y) },
      {
        label: "streaming: open + per slice",
        value: `${formatG(fit.stream.intercept, 3)} + ${formatG(fit.stream.slope, 3)} s`,
      },
      {
        label: "download first: start + per slice",
        value: `${formatG(fit.download.intercept, 3)} + ${formatG(fit.download.slope, 3)} s`,
      },
    ]);
  }
  slot.replaceChildren(panel.svg);
}

export function renderExtrapolation(
  target: HTMLElement,
  fits: Extrapolation[],
  preloaded: boolean,
  tooltip: Tooltip,
): void {
  const shown = fits.filter((fit) => fit.isPreloaded === preloaded);
  const modalities = MODALITY_ORDER.filter((modality) => shown.some((fit) => fit.modality === modality));
  const slots = panelSlots(target, modalities.length, 300);
  modalities.forEach((modality, index) =>
    drawPanel(
      slots[index],
      modality,
      shown.filter((fit) => fit.modality === modality),
      tooltip,
    ),
  );
}

export function extrapolationLegend(fits: Extrapolation[], preloaded: boolean): LegendEntry[] {
  const shown = fits.filter((fit) => fit.isPreloaded === preloaded && fit.crossover !== null);
  const methods = orderMethods(shown.map((fit) => fit.method));
  const formats = [...new Set(shown.map((fit) => fit.formatFamily))].sort();
  return [
    ...methods.map((method) => ({
      label: methodLabel(method),
      color: methodColor(method),
      lineStyle: methodLineStyle(method),
    })),
    ...formats.map((format) => ({
      label: `${FORMAT_FAMILY_LABELS[format] ?? format} download + local`,
      color: downloadColor(format),
      lineStyle: "dashed" as const,
    })),
  ];
}

/** The methods whose lines do not cross where the figure can show it. */
export function uncrossed(fits: Extrapolation[], preloaded: boolean): string[] {
  return orderMethods(
    fits.filter((fit) => fit.isPreloaded === preloaded && fit.crossover === null).map((fit) => fit.method),
  ).map(methodLabel);
}

export const EXTRAPOLATION_COLUMNS: Column<Extrapolation>[] = [
  { label: "Modality", value: (fit) => fit.modality },
  { label: "Preloaded", value: (fit) => fit.isPreloaded },
  { label: "Method", value: (fit) => methodLabel(fit.method) },
  { label: "Method (benchmark name)", value: (fit) => fit.method },
  { label: "Stream slope (s per slice)", value: (fit) => fit.stream.slope },
  { label: "Stream intercept (s)", value: (fit) => fit.stream.intercept },
  { label: "Download slope (s per slice)", value: (fit) => fit.download.slope },
  { label: "Download intercept (s)", value: (fit) => fit.download.intercept },
  { label: "Crossover (slices)", value: (fit) => fit.crossover?.x ?? null },
  { label: "Crossover (s)", value: (fit) => fit.crossover?.y ?? null },
];
