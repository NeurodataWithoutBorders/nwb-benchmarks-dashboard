// The drawing primitives every figure is built from: an SVG panel with its axes, and the marks
// (lines, markers, error bars, bands) drawn into it. Colors are CSS custom properties (tokens) or
// classes styled in src/style.css, never literal values.

import { svgEl, svgText } from "@brain-bbqs/ui";
import type { LineStyle, MarkerShape } from "../../lib/methods";
import { linearScale, logScale, type Scale } from "../../lib/scale";

export interface AxisSpec {
  log?: boolean;
  domain: [number, number];
  label: string;
  format: (value: number) => string;
  /** Replaces the scale's own ticks (a categorical axis passes its category positions). */
  ticks?: number[];
}

export interface Panel {
  svg: SVGSVGElement;
  /** The plotting area, clipped to the axes. */
  plot: SVGGElement;
  /** Above the plotting area and unclipped: annotations and hit targets. */
  overlay: SVGGElement;
  x: Scale;
  y: Scale;
  inner: { left: number; top: number; right: number; bottom: number };
}

let clipCounter = 0;

export interface PanelOptions {
  width: number;
  height: number;
  title: string;
  x: AxisSpec;
  y: AxisSpec;
  margin?: Partial<{ left: number; right: number; top: number; bottom: number }>;
  description?: string;
}

/** An SVG panel of the given size with its grid, axes, axis titles and panel title drawn. */
export function createPanel(options: PanelOptions): Panel {
  const margin = { left: 58, right: 16, top: 40, bottom: 44, ...options.margin };
  const { width, height } = options;
  const inner = { left: margin.left, top: margin.top, right: width - margin.right, bottom: height - margin.bottom };
  const svg = svgEl("svg", {
    class: "chart",
    viewBox: `0 0 ${width} ${height}`,
    width,
    height,
    role: "img",
    "aria-label": options.description ?? options.title,
  });
  const x = options.x.log
    ? logScale(options.x.domain, [inner.left, inner.right])
    : linearScale(
        options.x.domain,
        [inner.left, inner.right],
        Math.max(2, Math.round((inner.right - inner.left) / 80)),
      );
  const y = options.y.log
    ? logScale(options.y.domain, [inner.bottom, inner.top])
    : linearScale(
        options.y.domain,
        [inner.bottom, inner.top],
        Math.max(2, Math.round((inner.bottom - inner.top) / 50)),
      );
  const xTicks = options.x.ticks ?? x.ticks;
  const yTicks = options.y.ticks ?? y.ticks;

  const grid = svgEl("g", { class: "chart-grid" });
  for (const value of x.minorTicks)
    grid.append(svgEl("line", { class: "minor", x1: x(value), x2: x(value), y1: inner.top, y2: inner.bottom }));
  for (const value of y.minorTicks)
    grid.append(svgEl("line", { class: "minor", x1: inner.left, x2: inner.right, y1: y(value), y2: y(value) }));
  for (const value of xTicks)
    grid.append(svgEl("line", { x1: x(value), x2: x(value), y1: inner.top, y2: inner.bottom }));
  for (const value of yTicks)
    grid.append(svgEl("line", { x1: inner.left, x2: inner.right, y1: y(value), y2: y(value) }));
  svg.append(grid);

  const axes = svgEl("g", { class: "chart-axis" });
  axes.append(
    svgEl("rect", {
      class: "chart-frame",
      x: inner.left,
      y: inner.top,
      width: inner.right - inner.left,
      height: inner.bottom - inner.top,
    }),
  );
  for (const value of xTicks) {
    axes.append(svgEl("line", { x1: x(value), x2: x(value), y1: inner.bottom, y2: inner.bottom + 4 }));
    axes.append(
      svgText("tick", { x: x(value), y: inner.bottom + 16, "text-anchor": "middle" }, options.x.format(value)),
    );
  }
  for (const value of yTicks) {
    axes.append(svgEl("line", { x1: inner.left - 4, x2: inner.left, y1: y(value), y2: y(value) }));
    axes.append(svgText("tick", { x: inner.left - 7, y: y(value) + 4, "text-anchor": "end" }, options.y.format(value)));
  }
  axes.append(
    svgText(
      "axis-title",
      { x: (inner.left + inner.right) / 2, y: height - 8, "text-anchor": "middle" },
      options.x.label,
    ),
  );
  axes.append(
    svgText(
      "axis-title",
      {
        x: 14,
        y: (inner.top + inner.bottom) / 2,
        "text-anchor": "middle",
        transform: `rotate(-90 14 ${(inner.top + inner.bottom) / 2})`,
      },
      options.y.label,
    ),
  );
  axes.append(
    svgText("panel-title", { x: (inner.left + inner.right) / 2, y: 16, "text-anchor": "middle" }, options.title),
  );
  svg.append(axes);

  const clipId = `chart-clip-${++clipCounter}`;
  const defs = svgEl("defs");
  const clip = svgEl("clipPath", { id: clipId });
  clip.append(
    svgEl("rect", { x: inner.left, y: inner.top, width: inner.right - inner.left, height: inner.bottom - inner.top }),
  );
  defs.append(clip);
  svg.append(defs);
  const plot = svgEl("g", { "clip-path": `url(#${clipId})` });
  const overlay = svgEl("g");
  svg.append(plot, overlay);
  return { svg, plot, overlay, x, y, inner };
}

const DASHES: Record<LineStyle, string | null> = { solid: null, dashed: "7 4", dashdot: "8 3 2 3" };

/** A polyline through the points, skipping any that are not finite. */
export function line(points: [number, number][], color: string, style: LineStyle = "solid", width = 2): SVGPathElement {
  const kept = points.filter(([x, y]) => Number.isFinite(x) && Number.isFinite(y));
  const d = kept.map(([x, y], index) => `${index === 0 ? "M" : "L"}${x.toFixed(2)},${y.toFixed(2)}`).join("");
  const path = svgEl("path", { class: "chart-line", d, stroke: color, "stroke-width": width });
  const dash = DASHES[style];
  if (dash) path.setAttribute("stroke-dasharray", dash);
  return path;
}

/** A filled area between an upper and a lower edge. */
export function band(upper: [number, number][], lower: [number, number][], color: string): SVGPathElement {
  const points = [...upper, ...[...lower].reverse()];
  const d = `${points.map(([x, y], index) => `${index === 0 ? "M" : "L"}${x.toFixed(2)},${y.toFixed(2)}`).join("")}Z`;
  return svgEl("path", { class: "chart-band", d, fill: color });
}

/** A data marker of the given shape, centered on (x, y). */
export function marker(shape: MarkerShape, x: number, y: number, color: string, size = 8): SVGElement {
  const half = size / 2;
  if (shape === "square") {
    return svgEl("rect", { class: "chart-marker", x: x - half, y: y - half, width: size, height: size, fill: color });
  }
  if (shape === "triangle") {
    const top = y - half * 1.15;
    const bottom = y + half * 0.85;
    return svgEl("polygon", {
      class: "chart-marker",
      points: `${x},${top} ${x - half * 1.1},${bottom} ${x + half * 1.1},${bottom}`,
      fill: color,
    });
  }
  return svgEl("circle", { class: "chart-marker", cx: x, cy: y, r: half, fill: color });
}

/** An x-shaped marker, which the figures use for crossover points. */
export function cross(x: number, y: number, color: string, size = 10): SVGPathElement {
  const half = size / 2;
  return svgEl("path", {
    class: "chart-cross",
    d: `M${x - half},${y - half}L${x + half},${y + half}M${x - half},${y + half}L${x + half},${y - half}`,
    stroke: color,
  });
}

/** A vertical error bar with caps. */
export function errorBar(x: number, y0: number, y1: number, color: string): SVGPathElement {
  const cap = 4;
  return svgEl("path", {
    class: "chart-errorbar",
    d: `M${x},${y0}L${x},${y1}M${x - cap},${y0}L${x + cap},${y0}M${x - cap},${y1}L${x + cap},${y1}`,
    stroke: color,
  });
}

/** An invisible target, larger than the mark, that shows the mark's details on hover. */
export function hitTarget(x: number, y: number, radius = 12): SVGCircleElement {
  return svgEl("circle", { class: "chart-hit", cx: x, cy: y, r: radius });
}

/**
 * Lines of constant effective throughput (runtime = bytes / rate) on a log-log panel whose x axis
 * counts bytes and whose y axis counts seconds, each labeled where it leaves the plot.
 */
export function throughputLines(panel: Panel, ratesMBps: readonly number[]): void {
  const [xMin, xMax] = panel.x.domain;
  const [yMin, yMax] = panel.y.domain;
  for (const rate of ratesMBps) {
    const bytesPerSecond = rate * 1e6;
    const start: [number, number] = [xMin, xMin / bytesPerSecond];
    const end: [number, number] = [xMax, xMax / bytesPerSecond];
    panel.plot.append(
      line(
        [start, end].map(([bx, by]) => [panel.x(bx), panel.y(by)]),
        "var(--chart-guide)",
        "dashed",
        1,
      ),
    );
    const label = `${rate} MB/s`;
    const yAtRight = xMax / bytesPerSecond;
    if (yAtRight >= yMin && yAtRight <= yMax) {
      panel.overlay.append(
        svgText("guide-label", { x: panel.inner.right - 3, y: panel.y(yAtRight) - 4, "text-anchor": "end" }, label),
      );
    } else {
      const xAtTop = yMax * bytesPerSecond;
      if (xAtTop >= xMin && xAtTop <= xMax) {
        panel.overlay.append(
          svgText("guide-label", { x: panel.x(xAtTop), y: panel.inner.top - 4, "text-anchor": "middle" }, label),
        );
      }
    }
  }
}

/** A text annotation beside a point (in text ink: the mark it labels carries the identity). */
export function annotation(x: number, y: number, text: string): SVGTextElement {
  return svgText("chart-annotation", { x: x + 4, y: y - 4 }, text);
}
