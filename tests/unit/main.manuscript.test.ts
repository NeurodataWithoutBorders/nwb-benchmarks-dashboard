// @vitest-environment jsdom
// Boots at `?manuscript`, the link to the manuscript's figures: each figure takes the selection the
// Python pipeline draws it from, on the parity fixture served as the published bundle.
import { beforeAll, describe, expect, it } from "vitest";
import { MANUSCRIPT_DESCRIPTION } from "../../src/lib/filters";
import { bootMain, dashboardShown, el, publishedBundleFetch } from "./helpers/mainHarness";

beforeAll(async () => {
  await bootMain({ url: "?manuscript&machine=ignored", fetch: publishedBundleFetch() });
  await dashboardShown();
});

describe("main.ts boot at ?manuscript", () => {
  it("opens the manuscript view in place of any filters in the URL", () => {
    expect(window.location.search).toBe("?manuscript");
    expect(document.querySelector(".preset-button[aria-pressed='true']")?.textContent).toBe("Manuscript figures");
    expect(el("filter-summary").textContent).toBe(MANUSCRIPT_DESCRIPTION);
  });

  it("draws the single-environment figures from the reference environment", () => {
    expect(el("rankings-figure").querySelectorAll("svg.chart")).toHaveLength(4);
    expect(el("rankings-note").hidden).toBe(true);
    expect(el("versions-figure").textContent).toContain("2026-10-07");
  });

  it("goes back to every result", () => {
    [...document.querySelectorAll<HTMLButtonElement>(".preset-button")]
      .find((button) => button.textContent === "All results")
      ?.click();
    expect(window.location.search).toBe("");
    expect(el("filter-summary").textContent).not.toBe(MANUSCRIPT_DESCRIPTION);
  });
});
