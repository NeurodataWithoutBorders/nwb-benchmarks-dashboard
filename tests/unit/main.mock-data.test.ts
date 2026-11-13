// @vitest-environment jsdom
// Boots under `?test&mock_data`: the synthesized bundle stands in for the published one at the
// fetch, and, holding none of the paper's machine, the dashboard starts from every result.
import { beforeAll, describe, expect, it, vi } from "vitest";
import { bootMain, dashboardShown, el } from "./helpers/mainHarness";
import { lastPlot } from "./helpers/plotly";

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

  it("starts from all results, outside the manuscript view", () => {
    expect(el("search-status").textContent).toMatch(/^Showing all \d+ results files\./);
    expect(el("manuscript-toggle").getAttribute("aria-pressed")).toBe("false");
    expect(window.location.search).toBe("?test&mock_data");
  });

  it("fills every figure", () => {
    for (const id of ["rankings", "traffic", "versions", "incremental"]) {
      expect(lastPlot(el(`${id}-plot`))?.data.length).toBeGreaterThan(0);
      expect(el(`${id}-note`).hidden).toBe(true);
    }
  });

  it("keeps the mock data on a refresh", async () => {
    el("refresh-btn").click();
    await vi.waitFor(() => expect(el<HTMLButtonElement>("refresh-btn").disabled).toBe(false));
    expect(el("summary-note").hidden).toBe(true);
  });
});
