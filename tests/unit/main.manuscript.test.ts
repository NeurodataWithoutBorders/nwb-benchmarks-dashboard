// @vitest-environment jsdom
// Boots at `?manuscript`, the link to the manuscript's figures: each figure takes the selection the
// Python pipeline draws it from, on the parity fixture served as the published bundle.
import { beforeAll, describe, expect, it } from "vitest";
import { MANUSCRIPT_DESCRIPTION } from "../../src/lib/filters";
import { bootMain, dashboardShown, el, publishedBundleFetch } from "./helpers/mainHarness";
import { lastPlot } from "./helpers/plotly";

beforeAll(async () => {
  await bootMain({ url: "?manuscript&q=machine%3Aignored", fetch: publishedBundleFetch() });
  await dashboardShown();
});

describe("main.ts boot at ?manuscript", () => {
  it("opens the manuscript view in place of any search in the URL", () => {
    expect(window.location.search).toBe("?manuscript");
    expect(el("manuscript-toggle").getAttribute("aria-pressed")).toBe("true");
    expect(el<HTMLInputElement>("search-input").value).toBe("");
    expect(el("manuscript-toggle").title).toContain(MANUSCRIPT_DESCRIPTION);
  });

  it("draws the single-environment figures from the reference environment, lettering the panels", () => {
    const rankings = lastPlot(el("rankings-plot"));
    expect(rankings?.data.filter((trace) => trace.type === "heatmap")).toHaveLength(4);
    expect((rankings?.layout.annotations as { text: string }[]).map((annotation) => annotation.text)).toContain(
      "<b>d)</b>",
    );
    expect(el("rankings-note").hidden).toBe(true);
    const versions = lastPlot(el("versions-plot"));
    expect(JSON.stringify(versions?.layout.xaxis)).toContain("2026-10-07");
  });

  it("goes back to every result from the toggle", () => {
    el("manuscript-toggle").click();
    expect(window.location.search).toBe("");
    expect(el("manuscript-toggle").title).not.toContain(MANUSCRIPT_DESCRIPTION);
  });
});
