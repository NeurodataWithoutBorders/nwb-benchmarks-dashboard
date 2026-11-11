// Draws the paper's Figure 3: one heatmap per task, cells annotated with the mean, the fastest
// method of each modality starred.

import { svgEl, svgText } from "@brain-bbqs/ui";
import type { Column } from "../../lib/csv";
import { formatG, formatSeconds } from "../../lib/format";
import type { HeatmapPanel } from "../../lib/figures/rankings";
import { methodLabel } from "../../lib/methods";
import { niceTicks } from "../../lib/scale";
import type { Summary } from "../../lib/stats";
import { onHover, panelSlots, slotWidth, type Tooltip } from "../charts/chrome";

export type HeatmapScale = "paper" | "data";

/** The five-stop sequential ramp, declared light and dark in src/style.css. */
const HEAT_STOPS = 5;

/** The fill for a position along the ramp, mixed between its two nearest stops by CSS. */
export function heatFill(fraction: number): string {
  const t = Math.min(1, Math.max(0, fraction)) * (HEAT_STOPS - 1);
  const stop = Math.min(HEAT_STOPS - 2, Math.floor(t));
  const share = Math.round((t - stop) * 100);
  return `color-mix(in oklab, var(--heat-${stop + 1}) ${share}%, var(--heat-${stop}))`;
}

/** The upper end of a panel's color scale. */
export function heatMax(panel: HeatmapPanel, scale: HeatmapScale): number {
  if (scale === "paper") return panel.paperMax;
  const means = panel.cells.flat().flatMap((cell) => (cell ? [cell.mean] : []));
  const max = means.length ? Math.max(...means) : 1;
  const ticks = niceTicks(0, max, 4);
  return Math.max(max, ticks[ticks.length - 1] ?? max) || 1;
}

function drawPanel(
  panel: HeatmapPanel,
  letter: string,
  width: number,
  scale: HeatmapScale,
  tooltip: Tooltip,
): SVGSVGElement {
  const labels = panel.methods.map(methodLabel);
  // Narrow panels (phones) set their text a size smaller so the values fit their cells.
  const compact = width < 460;
  const characterWidth = compact ? 5.6 : 6.4;
  const labelWidth = Math.min(
    compact ? 132 : 170,
    Math.max(...labels.map((label) => label.length)) * characterWidth + 12,
  );
  const cellHeight = 30;
  const top = 34;
  const left = labelWidth;
  const right = width - 10;
  const gridBottom = top + panel.methods.length * cellHeight;
  const height = gridBottom + 22 + 52;
  const cellWidth = (right - left) / panel.modalities.length;
  const max = heatMax(panel, scale);
  const svg = svgEl("svg", {
    class: compact ? "chart heat-compact" : "chart",
    viewBox: `0 0 ${width} ${height}`,
    width,
    height,
    role: "img",
    "aria-label": `${panel.title}: mean runtime by method and modality`,
  });
  svg.append(svgText("panel-letter", { x: 2, y: 16 }, letter));
  svg.append(svgText("panel-title", { x: (left + right) / 2, y: 18, "text-anchor": "middle" }, panel.title));

  panel.methods.forEach((_method, row) => {
    const y = top + row * cellHeight;
    svg.append(svgText("tick", { x: left - 8, y: y + cellHeight / 2 + 4, "text-anchor": "end" }, labels[row]));
    panel.modalities.forEach((modality, column) => {
      const x = left + column * cellWidth;
      const cell = panel.cells[row][column];
      const rect = svgEl("rect", {
        class: cell ? "heat-cell" : "heat-cell empty",
        x: x + 1,
        y: y + 1,
        width: cellWidth - 2,
        height: cellHeight - 2,
        rx: 2,
      });
      if (!cell) {
        svg.append(rect);
        return;
      }
      const fraction = cell.mean / max;
      rect.setAttribute("style", `fill: ${heatFill(fraction)}`);
      svg.append(rect);
      const fastest = panel.fastest[column] === row;
      const ink = fraction > 0.55 ? "strong" : "";
      svg.append(
        svgText(
          `heat-value ${ink}`,
          { x: x + cellWidth / 2, y: y + cellHeight / 2 + 4, "text-anchor": "middle" },
          formatG(cell.mean, 3),
        ),
      );
      if (fastest)
        svg.append(svgText(`heat-star ${ink}`, { x: x + cellWidth - 4, y: y + 14, "text-anchor": "end" }, "*"));
      onHover(rect, tooltip, `${labels[row]} · ${modality}`, () => summaryLines(cell, fastest));
    });
  });
  panel.modalities.forEach((modality, column) => {
    svg.append(
      svgText("tick", { x: left + (column + 0.5) * cellWidth, y: gridBottom + 16, "text-anchor": "middle" }, modality),
    );
  });

  // The color scale, under the grid.
  const barTop = gridBottom + 30;
  const gradientId = `heat-gradient-${panel.id}-${Math.round(width)}`;
  const gradient = svgEl("linearGradient", { id: gradientId, x1: 0, x2: 1, y1: 0, y2: 0 });
  for (let stop = 0; stop < HEAT_STOPS; stop++) {
    gradient.append(svgEl("stop", { offset: stop / (HEAT_STOPS - 1), style: `stop-color: var(--heat-${stop})` }));
  }
  const defs = svgEl("defs");
  defs.append(gradient);
  svg.append(defs);
  svg.append(
    svgEl("rect", {
      class: "heat-bar",
      x: left,
      y: barTop,
      width: right - left,
      height: 8,
      fill: `url(#${gradientId})`,
    }),
  );
  for (const tick of niceTicks(0, max, 4)) {
    const x = left + (tick / max) * (right - left);
    svg.append(svgText("tick", { x, y: barTop + 22, "text-anchor": "middle" }, formatG(tick, 3)));
  }
  svg.append(svgText("axis-title", { x: left - 8, y: barTop + 8, "text-anchor": "end" }, "Mean (s)"));
  return svg;
}

function summaryLines(cell: Summary, fastest: boolean): { label: string; value: string }[] {
  const lines = [
    { label: "mean", value: formatSeconds(cell.mean) },
    { label: "standard deviation", value: formatSeconds(cell.std) },
    { label: "median", value: formatSeconds(cell.median) },
    { label: "range", value: `${formatG(cell.min, 3)}–${formatG(cell.max, 3)} s` },
    { label: "runs", value: String(cell.n) },
  ];
  return fastest ? [...lines, { label: "in this modality", value: "Fastest" }] : lines;
}

export function renderRankings(
  target: HTMLElement,
  panels: HeatmapPanel[],
  scale: HeatmapScale,
  tooltip: Tooltip,
): void {
  const slots = panelSlots(target, panels.length, 360);
  panels.forEach((panel, index) => {
    slots[index].append(drawPanel(panel, `${"abcd"[index]})`, slotWidth(slots[index]), scale, tooltip));
  });
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
