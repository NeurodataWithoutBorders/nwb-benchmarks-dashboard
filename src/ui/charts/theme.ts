// The colors a Plotly figure is drawn in. Plotly takes literal colors, not CSS custom properties, so
// the theme tokens (src/style.css and @brain-bbqs/ui's tokens.css) are resolved against the page as
// it is themed when a figure is drawn, and the figures are drawn again when the theme changes.

export interface ChartTheme {
  text: string;
  muted: string;
  surface: string;
  border: string;
  grid: string;
  frame: string;
  guide: string;
  /** For what the eye should go to first, such as the fastest cell of a heatmap. */
  accent: string;
  font: string;
  /** The heatmap's five-stop sequential ramp, low to high. */
  heat: string[];
  /** Resolves a CSS color, such as `var(--method-ros3)`, to one Plotly can draw. */
  color: (expression: string) => string;
}

/** The same color, see-through: `rgb(...)` becomes `rgba(..., alpha)`; anything else is left as it is. */
export function translucent(color: string, alpha: number): string {
  const match = /^rgba?\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)/.exec(color);
  return match ? `rgba(${match[1]}, ${match[2]}, ${match[3]}, ${alpha})` : color;
}

/** A hidden element the page's colors are resolved on; kept in the page, since a figure resolves its
 * methods' colors while it is built, after the theme is read. */
let probe: HTMLSpanElement | null = null;

function resolve(root: HTMLElement, expression: string): string {
  if (!probe) {
    probe = document.createElement("span");
    probe.hidden = true;
    probe.setAttribute("aria-hidden", "true");
  }
  if (probe.parentElement !== root) root.append(probe);
  probe.style.color = "";
  probe.style.color = expression;
  const resolved = getComputedStyle(probe).color;
  // Where custom properties do not resolve (jsdom), the expression is the best there is.
  return resolved.startsWith("rgb") ? resolved : expression;
}

/** The theme as the page currently shows it. */
export function readTheme(root: HTMLElement = document.body): ChartTheme {
  const cache = new Map<string, string>();
  const color = (expression: string): string => {
    let resolved = cache.get(expression);
    if (resolved === undefined) {
      resolved = resolve(root, expression);
      cache.set(expression, resolved);
    }
    return resolved;
  };
  const token = (name: string): string => color(`var(--${name})`);
  return {
    text: token("text"),
    muted: token("muted"),
    surface: token("card"),
    border: token("border"),
    grid: token("chart-grid"),
    frame: token("chart-frame"),
    guide: token("chart-guide"),
    accent: token("accent"),
    font: getComputedStyle(root).fontFamily || "sans-serif",
    heat: [0, 1, 2, 3, 4].map((stop) => token(`heat-${stop}`)),
    color,
  };
}
