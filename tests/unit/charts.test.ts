// @vitest-environment jsdom
// The Plotly layer: the subplot grid, the theme's colors, and the wrapper with usage-page's modebar.
import Plotly from "plotly.js-cartesian-dist-min";
import { afterEach, describe, expect, it, vi } from "vitest";
import { axisNames, gridLayout, legendHeight } from "../../src/ui/charts/grid";
import {
  clearFigure,
  drawFigure,
  emptyFigure,
  hoverText,
  plotConfig,
  plotText,
  plotlyDash,
  plotlySymbol,
} from "../../src/ui/charts/plot";
import { readTheme, translucent } from "../../src/ui/charts/theme";
import { lastPlot, plotCount } from "./helpers/plotly";

describe("the subplot grid", () => {
  const padding = { top: 30, right: 10, bottom: 50, left: 60 };

  it("fits as many columns as the width allows, rows as tall as their tallest panel", () => {
    const grid = gridLayout({ width: 1000, panelHeights: [100, 200, 150], minPanelWidth: 300, padding, bottom: 40 });
    expect(grid.columns).toBe(3);
    expect(grid.height).toBe(30 + 200 + 50 + 40);
    // Each panel's plot sits inside its cell, below the row's padding.
    expect(grid.domains[0].x).toEqual([60 / 1000, (1000 / 3 - 10) / 1000]);
    expect(grid.domains[0].y).toEqual([1 - 230 / 280, 1 - 30 / 280]);
    expect(grid.fx(100)).toBe(0.1);
    expect(grid.fy(28)).toBe(0.1);
    expect(grid.margin).toEqual({ l: 0, r: 0, t: 0, b: 40 });
  });

  it("stacks panels in one column when the width is narrow", () => {
    const grid = gridLayout({ width: 320, panelHeights: [100, 100], minPanelWidth: 400, padding, bottom: 0 });
    expect(grid.columns).toBe(1);
    expect(grid.domains[1].y[1]).toBeLessThan(grid.domains[0].y[0]);
  });

  it("names subplot axes as Plotly does, and sizes a legend", () => {
    expect(axisNames(0)).toEqual({ x: "x", y: "y", xaxis: "xaxis", yaxis: "yaxis" });
    expect(axisNames(2)).toEqual({ x: "x3", y: "y3", xaxis: "xaxis3", yaxis: "yaxis3" });
    expect(legendHeight(0, 500)).toBe(16);
    expect(legendHeight(7, 500)).toBe(24 + 4 * 22);
    expect(legendHeight(3, 100)).toBe(24 + 3 * 22);
  });
});

describe("the theme", () => {
  it("resolves colors on the page, falling back to the expression where it cannot", () => {
    const theme = readTheme();
    // jsdom does not resolve custom properties, so the tokens come back as they were asked for.
    expect(theme.text).toBe("var(--text)");
    expect(theme.heat).toHaveLength(5);
    expect(theme.color("rgb(1, 2, 3)")).toBe("rgb(1, 2, 3)");
    expect(theme.color("rgb(1, 2, 3)")).toBe("rgb(1, 2, 3)");
    expect(theme.color("red")).toBe("rgb(255, 0, 0)");
    expect(document.body.querySelectorAll("span[aria-hidden='true']")).toHaveLength(1);
  });

  it("makes a color see-through", () => {
    expect(translucent("rgb(10, 20, 30)", 0.2)).toBe("rgba(10, 20, 30, 0.2)");
    expect(translucent("rgba(10,20,30,1)", 0.5)).toBe("rgba(10, 20, 30, 0.5)");
    expect(translucent("var(--x)", 0.5)).toBe("var(--x)");
  });
});

describe("drawing with Plotly", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("swaps the camera for PNG and SVG downloads beside a source-data link, and never offers the cloud", () => {
    const config = plotConfig("figure", "https://example.org/data");
    expect(config.showSendToCloud).toBe(false);
    expect(config.modeBarButtonsToRemove).toEqual(["toImage", "sendChartToCloud"]);
    const [downloads, source] = config.modeBarButtonsToAdd as unknown as {
      name: string;
      click: (gd: unknown) => void;
    }[][];
    expect(downloads.map((button) => button.name)).toEqual(["Download plot as PNG", "Download plot as SVG"]);
    const gd = document.createElement("div");
    downloads[0].click(gd);
    downloads[1].click(gd);
    expect(vi.mocked(Plotly.downloadImage).mock.calls.slice(-2)).toEqual([
      [gd, { format: "png", filename: "figure" }],
      [gd, { format: "svg", filename: "figure" }],
    ]);
    const open = vi.spyOn(window, "open").mockImplementation(() => null);
    source[0].click(gd);
    expect(open).toHaveBeenCalledWith("https://example.org/data", "_blank", "noopener");
  });

  it("draws a spec into its element, reports Plotly's failures, and clears it", async () => {
    const target = document.createElement("div");
    const spec = emptyFigure(readTheme(), "Nothing <here>");
    drawFigure(target, spec, "name", "https://example.org");
    expect(plotCount(target)).toBe(1);
    expect(lastPlot(target)?.layout).toBe(spec.layout);
    expect((spec.layout.annotations as { text: string }[])[0].text).toBe("Nothing &lt;here&gt;");

    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.mocked(Plotly.react).mockRejectedValueOnce(new Error("no"));
    drawFigure(target, spec, "name", "https://example.org");
    await vi.waitFor(() => expect(error).toHaveBeenCalled());

    target.append(document.createElement("span"));
    clearFigure(target);
    expect(Plotly.purge).toHaveBeenCalledWith(target);
    expect(target.childElementCount).toBe(0);
  });

  it("escapes text from the data, and writes hover text as a heading over lines", () => {
    expect(plotText("a < b & c > d")).toBe("a &lt; b &amp; c &gt; d");
    expect(hoverText("Method <x>", [{ label: "mean", value: "1 s" }])).toBe("<b>Method &lt;x&gt;</b><br>mean: 1 s");
  });

  it("translates line styles and marker shapes", () => {
    expect(plotlyDash("dashed")).toBe("dash");
    expect(plotlyDash("other")).toBe("solid");
    expect(plotlySymbol("triangle")).toBe("triangle-up");
    expect(plotlySymbol("other")).toBe("circle");
  });
});
