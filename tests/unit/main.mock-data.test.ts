// @vitest-environment jsdom
// Boots under `?test&mock_data`: the synthesized bundle stands in for the published one at the
// fetch, and, holding none of the paper's machine, the dashboard starts from every result.
import { beforeAll, describe, expect, it } from "vitest";
import { bootMain, dashboardShown, el } from "./helpers/mainHarness";

let fetched: { calls: unknown[] } | null = null;

beforeAll(async () => {
  const booted = await bootMain("?test&mock_data");
  fetched = booted.fetch;
  await dashboardShown();
});

describe("main.ts boot with ?test&mock_data", () => {
  it("never reaches the network", () => {
    expect(fetched?.calls).toEqual([]);
  });

  it("names the synthesized source and starts from all results", () => {
    expect(el("data-summary").textContent).toContain("synthesized by the mock_data test injection");
    const pressed = document.querySelector(".preset-button[aria-pressed='true']");
    expect(pressed?.textContent).toBe("All results");
    expect(window.location.search).toBe("?test&mock_data");
  });

  it("fills every figure", () => {
    for (const id of ["rankings", "traffic", "versions", "extrapolation", "incremental"]) {
      expect(el(`${id}-figure`).querySelectorAll("svg.chart").length).toBeGreaterThan(0);
      expect(el(`${id}-note`).hidden || id === "extrapolation").toBe(true);
    }
  });
});
