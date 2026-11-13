// Lays a figure's panels out as Plotly subplots in a grid that fits the card: as many columns as fit
// at the panel's minimum width, each panel with room around its plot for its title, ticks and axis
// titles. Plotly places subplots by fractions of the figure, so everything is worked out in pixels
// first and then converted.

export interface Padding {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export interface GridOptions {
  /** The figure's width in pixels. */
  width: number;
  /** The height of each panel's plot area, in pixels. */
  panelHeights: readonly number[];
  minPanelWidth: number;
  /** Room around each panel's plot area, inside its cell. */
  padding: Padding;
  /** Room under the grid, for a legend under it. */
  bottom: number;
  /** Room right of the grid, for a legend beside it. */
  right?: number;
}

export interface Domain {
  x: [number, number];
  y: [number, number];
}

export interface GridLayout {
  height: number;
  columns: number;
  domains: Domain[];
  /** The figure's margins; the domains are fractions of what lies inside them. */
  margin: { l: number; r: number; t: number; b: number };
  /** Converts a length in pixels to a fraction of the plotting area's width or height. */
  fx: (pixels: number) => number;
  fy: (pixels: number) => number;
}

/** How wide Plotly's modebar is with every button this app gives it; a figure narrower wraps it in two rows. */
const MODEBAR_WIDTH = 340;

/** Room above the grid for Plotly's modebar, so its buttons do not sit on the top panels' titles. */
export function modebarRoom(width: number): number {
  return width < MODEBAR_WIDTH ? 48 : 24;
}

export function gridLayout({
  width: figureWidth,
  panelHeights,
  minPanelWidth,
  padding,
  bottom,
  right = 0,
}: GridOptions): GridLayout {
  const width = figureWidth - right;
  const above = modebarRoom(figureWidth);
  const count = panelHeights.length;
  const columns = Math.max(1, Math.min(count, Math.floor(width / minPanelWidth)));
  const rows = Math.ceil(count / columns);
  const rowHeights = Array.from({ length: rows }, (_row, row) =>
    Math.max(...panelHeights.slice(row * columns, row * columns + columns)),
  );
  const innerHeight = rowHeights.reduce((sum, height) => sum + padding.top + height + padding.bottom, 0);
  const cellWidth = width / columns;
  const domains: Domain[] = [];
  let top = 0;
  rowHeights.forEach((rowHeight, row) => {
    for (let column = 0; column < columns && row * columns + column < count; column++) {
      const left = column * cellWidth + padding.left;
      const right = (column + 1) * cellWidth - padding.right;
      const plotTop = top + padding.top;
      domains.push({
        x: [left / width, right / width],
        y: [1 - (plotTop + rowHeight) / innerHeight, 1 - plotTop / innerHeight],
      });
    }
    top += padding.top + rowHeight + padding.bottom;
  });
  return {
    height: above + innerHeight + bottom,
    columns,
    domains,
    margin: { l: 0, r: right, t: above, b: bottom },
    fx: (pixels) => pixels / width,
    fy: (pixels) => pixels / innerHeight,
  };
}

/** Plotly's names for the nth subplot's axes: `xaxis`/`x` for the first, `xaxis2`/`x2` after it. */
export function axisNames(index: number): { x: string; y: string; xaxis: string; yaxis: string } {
  const suffix = index === 0 ? "" : String(index + 1);
  return { x: `x${suffix}`, y: `y${suffix}`, xaxis: `xaxis${suffix}`, yaxis: `yaxis${suffix}` };
}

/** How wide a vertical legend of these labels is, from the gap before it to its longest label. */
export function legendWidth(labels: Iterable<string>, fontSize = 12): number {
  const longest = Math.max(0, ...[...labels].map((label) => label.length));
  return Math.round(64 + longest * fontSize * 0.6);
}

/** How much room a horizontal legend of `entries` entries takes at this width. */
export function legendHeight(entries: number, width: number, entryWidth = 170): number {
  if (entries === 0) return 16;
  const perRow = Math.max(1, Math.floor(width / entryWidth));
  return 24 + Math.ceil(entries / perRow) * 22;
}
