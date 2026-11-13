// Draws a figure with Plotly, configured as dandi/usage-page configures its plots: the modebar shows
// on hover, its camera button is replaced by a pair that saves the figure as PNG or SVG, and a third
// button opens the data the figure was drawn from. The figures themselves are built as plain specs
// (src/ui/figures/), so only this module touches Plotly.

import Plotly from "plotly.js-cartesian-dist-min";
import type { ChartTheme } from "./theme";
import type { Domain, GridLayout } from "./grid";

export type Trace = Record<string, unknown>;
export type Layout = Record<string, unknown>;

export interface FigureSpec {
  data: Trace[];
  layout: Layout;
}

/** What every figure builder is told: how wide to draw, in which colors, and whether to letter panels. */
export interface FigureOptions {
  width: number;
  theme: ChartTheme;
  /** The manuscript's a), b), c) panel letters, shown in the manuscript view only. */
  letters: boolean;
}

/** Material Design's "file_download" arrow, as usage-page's SVG button draws it. */
const DOWNLOAD_ICON = { width: 24, height: 24, path: "M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z" };

/** Material Design's "database" (stacked cylinder) icon. */
const DATA_ICON = {
  width: 24,
  height: 24,
  path: "M12 3C7.58 3 4 4.79 4 7s3.58 4 8 4 8-1.79 8-4-3.58-4-8-4zM4 9v3c0 2.21 3.58 4 8 4s8-1.79 8-4V9c0 2.21-3.58 4-8 4s-8-1.79-8-4zm0 5v3c0 2.21 3.58 4 8 4s8-1.79 8-4v-3c0 2.21-3.58 4-8 4s-8-1.79-8-4z",
};

export function plotConfig(filename: string, sourceUrl: string): Partial<Plotly.Config> {
  const save = (format: "png" | "svg") => (gd: Plotly.PlotlyHTMLElement) => {
    void Plotly.downloadImage(gd, { format, filename });
  };
  return {
    responsive: true,
    // Plotly 4 adds a button that uploads the chart to Plotly Cloud; nothing here leaves the browser.
    showSendToCloud: false,
    modeBarButtonsToRemove: ["toImage", "sendChartToCloud"],
    modeBarButtonsToAdd: [
      [
        { name: "Download plot as PNG", icon: Plotly.Icons.camera, click: save("png") },
        { name: "Download plot as SVG", icon: DOWNLOAD_ICON, click: save("svg") },
      ],
      [
        {
          name: "View source data on GitHub",
          icon: DATA_ICON,
          click: () => {
            window.open(sourceUrl, "_blank", "noopener");
          },
        },
      ],
    ] as unknown as Plotly.ModeBarButtonAny[],
  };
}

/** Draws (or redraws in place) a figure into `target`. */
export function drawFigure(target: HTMLElement, spec: FigureSpec, filename: string, sourceUrl: string): void {
  Plotly.react(
    target,
    spec.data as Plotly.Data[],
    spec.layout as Partial<Plotly.Layout>,
    plotConfig(filename, sourceUrl),
  ).catch((error: unknown) => {
    console.error(error);
  });
}

export function clearFigure(target: HTMLElement): void {
  Plotly.purge(target);
  target.replaceChildren();
}

/** Escapes text from the data for Plotly, which reads `<` as the start of one of its own tags. */
export function plotText(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Hover text: a bold heading over lines of `label: value`. */
export function hoverText(heading: string, lines: { label: string; value: string }[]): string {
  return [
    `<b>${plotText(heading)}</b>`,
    ...lines.map((line) => `${plotText(line.label)}: ${plotText(line.value)}`),
  ].join("<br>");
}

export function baseLayout(theme: ChartTheme, grid: GridLayout, showLegend: boolean): Layout {
  return {
    height: grid.height,
    autosize: true,
    margin: { ...grid.margin, pad: 0 },
    paper_bgcolor: theme.surface,
    plot_bgcolor: theme.surface,
    font: { family: theme.font, color: theme.text, size: 12 },
    hovermode: "closest",
    hoverlabel: { bgcolor: theme.surface, bordercolor: theme.border, font: { family: theme.font, color: theme.text } },
    showlegend: showLegend,
    legend: {
      orientation: "h",
      x: 0,
      xanchor: "left",
      y: 0,
      yanchor: "top",
      bgcolor: "rgba(0,0,0,0)",
      font: { size: 12, color: theme.text },
    },
    annotations: [],
    shapes: [],
  };
}

export function axis(
  theme: ChartTheme,
  domain: [number, number],
  anchor: string,
  title: string,
  options: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    domain,
    anchor,
    automargin: false,
    showline: true,
    mirror: true,
    linecolor: theme.frame,
    gridcolor: theme.grid,
    zeroline: false,
    ticks: "outside",
    ticklen: 4,
    tickcolor: theme.frame,
    tickfont: { color: theme.muted, size: 11 },
    title: { text: title, font: { color: theme.muted, size: 12 }, standoff: 4 },
    ...options,
  };
}

/** A panel's title, centred over its plot (but kept inside its cell, where a long title would leave
 * it), and the manuscript's letter at its top left. */
export function panelLabels(
  theme: ChartTheme,
  grid: GridLayout,
  domain: Domain,
  title: string,
  letter: string | null,
  padding: { left: number; right: number },
): Record<string, unknown>[] {
  const cell: [number, number] = [domain.x[0] - grid.fx(padding.left), domain.x[1] + grid.fx(padding.right)];
  const half = grid.fx(title.length * 3.9 + 4);
  const centre = Math.min(Math.max((domain.x[0] + domain.x[1]) / 2, cell[0] + half), cell[1] - half);
  const labels: Record<string, unknown>[] = [
    {
      text: `<b>${plotText(title)}</b>`,
      xref: "paper",
      yref: "paper",
      x: centre,
      y: domain.y[1],
      xanchor: "center",
      yanchor: "bottom",
      yshift: 8,
      showarrow: false,
      font: { size: 13, color: theme.text },
    },
  ];
  if (letter) {
    labels.push({
      text: `<b>${letter}</b>`,
      xref: "paper",
      yref: "paper",
      x: Math.max(0, cell[0]),
      y: domain.y[1],
      xanchor: "left",
      yanchor: "bottom",
      yshift: 8,
      showarrow: false,
      font: { size: 14, color: theme.text },
    });
  }
  return labels;
}

/** The letter of the nth panel, as the manuscript letters them, or null outside the manuscript view. */
export function panelLetter(letters: boolean, index: number): string | null {
  return letters ? `${"abcdefgh"[index]})` : null;
}

/** An empty figure that says why there is nothing to draw. */
export function emptyFigure(theme: ChartTheme, message: string): FigureSpec {
  return {
    data: [],
    layout: {
      height: 160,
      margin: { l: 0, r: 0, t: 0, b: 0 },
      paper_bgcolor: theme.surface,
      plot_bgcolor: theme.surface,
      font: { family: theme.font, color: theme.muted },
      xaxis: { visible: false },
      yaxis: { visible: false },
      annotations: [{ text: plotText(message), showarrow: false, xref: "paper", yref: "paper", x: 0.5, y: 0.5 }],
    },
  };
}

const PLOTLY_DASHES: Record<string, string> = { solid: "solid", dashed: "dash", dashdot: "dashdot" };
const PLOTLY_SYMBOLS: Record<string, string> = { circle: "circle", square: "square", triangle: "triangle-up" };

export function plotlyDash(style: string): string {
  return PLOTLY_DASHES[style] ?? "solid";
}

export function plotlySymbol(shape: string): string {
  return PLOTLY_SYMBOLS[shape] ?? "circle";
}
