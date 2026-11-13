// Reads back what the Plotly stand-in (plotlyMock.ts) was asked to draw.
import Plotly from "plotly.js-cartesian-dist-min";
import { vi } from "vitest";
import type { FigureSpec } from "../../../src/ui/charts/plot";

interface Drawn extends FigureSpec {
  config: Record<string, unknown>;
}

/** The last figure drawn into `target`, or undefined if none was. */
export function lastPlot(target: HTMLElement): Drawn | undefined {
  const calls = vi.mocked(Plotly.react).mock.calls as unknown as [
    HTMLElement,
    FigureSpec["data"],
    FigureSpec["layout"],
    Record<string, unknown>,
  ][];
  const call = calls.filter(([element]) => element === target).at(-1);
  return call ? { data: call[1], layout: call[2], config: call[3] } : undefined;
}

/** How many times a figure has been drawn into `target`. */
export function plotCount(target: HTMLElement): number {
  return vi.mocked(Plotly.react).mock.calls.filter(([element]) => element === target).length;
}
