// What surrounds the panels of a figure: the responsive grid they sit in, the shared legend, the
// hover tooltip, and the note a card shows in place of a figure it cannot draw.

import { h, svgEl } from "@brain-bbqs/ui";
import type { LineStyle, MarkerShape } from "../../lib/methods";
import { line, marker } from "./svg";

/** Clears `target` and fills it with `count` panel slots in a grid of at least `minWidth` each. */
export function panelSlots(target: HTMLElement, count: number, minWidth: number): HTMLDivElement[] {
  target.replaceChildren();
  target.style.setProperty("--panel-min", `${minWidth}px`);
  const slots = Array.from({ length: count }, () => h("div", "chart-slot"));
  target.append(...slots);
  return slots;
}

/** The width a panel slot gives its chart, with a fallback where layout is unavailable (tests). */
export function slotWidth(slot: HTMLElement, fallback = 460): number {
  const width = Math.floor(slot.clientWidth);
  return width > 0 ? width : fallback;
}

export interface LegendEntry {
  label: string;
  color: string;
  lineStyle?: LineStyle | null;
  marker?: MarkerShape | null;
}

/** Fills a legend list: each entry keyed by a short stroke (and marker) of its mark. */
export function renderLegend(list: HTMLUListElement, entries: LegendEntry[], title?: string): void {
  list.replaceChildren();
  if (title) list.append(h("li", "chart-legend-title", title));
  for (const entry of entries) {
    const item = h("li", "chart-legend-item");
    const swatch = svgEl("svg", { width: 28, height: 12, viewBox: "0 0 28 12", "aria-hidden": "true" });
    if (entry.lineStyle !== null)
      swatch.append(
        line(
          [
            [1, 6],
            [27, 6],
          ],
          entry.color,
          entry.lineStyle ?? "solid",
        ),
      );
    if (entry.marker) swatch.append(marker(entry.marker, 14, 6, entry.color, 7));
    item.append(swatch, h("span", null, entry.label));
    list.append(item);
  }
  list.hidden = entries.length === 0;
}

export interface TooltipLine {
  label: string;
  value: string;
  color?: string;
}

export interface Tooltip {
  show: (event: { clientX: number; clientY: number }, title: string, lines: TooltipLine[]) => void;
  hide: () => void;
}

/** One tooltip for the page: the value leads, the label follows, written through textContent. */
export function createTooltip(element: HTMLDivElement): Tooltip {
  return {
    show(event, title, lines) {
      element.replaceChildren(h("div", "chart-tooltip-title", title));
      for (const entry of lines) {
        const row = h("div", "chart-tooltip-row");
        if (entry.color) {
          const key = svgEl("svg", { width: 12, height: 4, viewBox: "0 0 12 4", "aria-hidden": "true" });
          key.append(
            line(
              [
                [0, 2],
                [12, 2],
              ],
              entry.color,
              "solid",
              3,
            ),
          );
          row.append(key);
        }
        row.append(h("strong", null, entry.value), h("span", null, entry.label));
        element.append(row);
      }
      element.hidden = false;
      const margin = 14;
      const { innerWidth, innerHeight } = window;
      const rect = element.getBoundingClientRect();
      const left =
        event.clientX + margin + rect.width > innerWidth ? event.clientX - margin - rect.width : event.clientX + margin;
      const top =
        event.clientY + margin + rect.height > innerHeight
          ? event.clientY - margin - rect.height
          : event.clientY + margin;
      element.style.left = `${Math.max(4, left)}px`;
      element.style.top = `${Math.max(4, top)}px`;
    },
    hide() {
      element.hidden = true;
    },
  };
}

/** Wires a mark (or its hit target) to the tooltip. */
export function onHover(target: Element, tooltip: Tooltip, title: string, lines: () => TooltipLine[]): void {
  target.addEventListener("pointermove", (event) => tooltip.show(event as PointerEvent, title, lines()));
  target.addEventListener("pointerleave", () => tooltip.hide());
}

/** Shows `message` in the card's note line, or hides the line when there is none. */
export function setNote(note: HTMLElement, message: string | null): void {
  note.textContent = message ?? "";
  note.hidden = message === null;
}

/** A panel slot's own small "No data" placeholder, the way the Python figures mark an empty axis. */
export function emptyPanel(slot: HTMLElement, title: string, message = "No data"): void {
  slot.replaceChildren(h("div", "chart-empty-title", title), h("div", "chart-empty", message));
}
