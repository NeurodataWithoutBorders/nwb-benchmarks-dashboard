// A figure as one standalone SVG file: its panels where they sit on the page and its legend under
// them, with every color and font the page's stylesheet gives them written onto the elements, so
// the file looks the same outside the page (in the theme it was saved from).

import { svgEl, svgText } from "@brain-bbqs/ui";

const STYLE_PROPERTIES = [
  "stop-color",
  "fill",
  "fill-opacity",
  "stroke",
  "stroke-width",
  "stroke-dasharray",
  "stroke-opacity",
  "opacity",
  "font-size",
  "font-family",
  "font-weight",
] as const;

function inlineStyles(source: Element, target: Element): void {
  const computed = getComputedStyle(source);
  const declarations = STYLE_PROPERTIES.map((property) => [property, computed.getPropertyValue(property)])
    .filter(([, value]) => value !== "")
    .map(([property, value]) => `${property}: ${value}`);
  if (declarations.length) target.setAttribute("style", declarations.join("; "));
  // The resolved style replaces any color the element named by token, which means nothing outside the page.
  for (const attribute of ["fill", "stroke"]) {
    if (target.getAttribute(attribute)?.includes("var(")) target.removeAttribute(attribute);
  }
  for (let index = 0; index < source.children.length; index++) {
    inlineStyles(source.children[index], target.children[index]);
  }
}

function cloneWithStyles(source: SVGSVGElement): SVGSVGElement {
  const clone = source.cloneNode(true) as SVGSVGElement;
  inlineStyles(source, clone);
  return clone;
}

/** The figure's panels and legend composed into one SVG document. */
export function figureSvg(figure: HTMLElement, legend: HTMLElement, title: string): string {
  const panels = [...figure.querySelectorAll<SVGSVGElement>("svg.chart")];
  const origin = figure.getBoundingClientRect();
  const placed = panels.map((panel) => {
    const rect = panel.getBoundingClientRect();
    return {
      panel,
      x: rect.left - origin.left,
      y: rect.top - origin.top,
      width: Number(panel.getAttribute("width")) || rect.width,
      height: Number(panel.getAttribute("height")) || rect.height,
    };
  });
  const width = Math.max(1, ...placed.map((item) => item.x + item.width));
  let height = Math.max(1, ...placed.map((item) => item.y + item.height));
  const root = svgEl("svg", { xmlns: "http://www.w3.org/2000/svg", version: "1.1" });
  const background = svgEl("rect", { x: 0, y: 0, width: "100%", height: "100%" });
  background.setAttribute(
    "style",
    `fill: ${getComputedStyle(figure.closest(".card") ?? figure).backgroundColor || "white"}`,
  );
  root.append(background);
  const titleElement = svgEl("title");
  titleElement.textContent = title;
  root.append(titleElement);
  for (const item of placed) {
    const clone = cloneWithStyles(item.panel);
    clone.setAttribute("x", String(item.x));
    clone.setAttribute("y", String(item.y));
    root.append(clone);
  }
  // The legend's entries in rows under the panels.
  const textColor = getComputedStyle(legend).color || "black";
  let x = 0;
  let y = height + 24;
  for (const entry of legend.querySelectorAll("li")) {
    const swatch = entry.querySelector("svg");
    const label = entry.textContent;
    const entryWidth = (swatch ? 34 : 0) + label.length * 7 + 18;
    if (x + entryWidth > width && x > 0) {
      x = 0;
      y += 20;
    }
    if (swatch) {
      const clone = cloneWithStyles(swatch);
      clone.setAttribute("x", String(x));
      clone.setAttribute("y", String(y - 9));
      root.append(clone);
    }
    const text = svgText("legend-label", { x: x + (swatch ? 34 : 0), y }, label);
    text.setAttribute(
      "style",
      `fill: ${textColor}; font-size: 12px; font-family: ${getComputedStyle(legend).fontFamily || "sans-serif"}`,
    );
    root.append(text);
    x += entryWidth;
  }
  height = y + 12;
  root.setAttribute("width", String(Math.ceil(width)));
  root.setAttribute("height", String(Math.ceil(height)));
  root.setAttribute("viewBox", `0 0 ${Math.ceil(width)} ${Math.ceil(height)}`);
  return `<?xml version="1.0" encoding="UTF-8"?>\n${new XMLSerializer().serializeToString(root)}\n`;
}
