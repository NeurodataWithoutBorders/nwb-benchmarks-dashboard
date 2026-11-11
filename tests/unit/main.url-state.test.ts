// @vitest-environment jsdom
// Boots with filters in the URL, as a shared link carries them: they win over the default
// selection, here narrowing to a machine with no results so every card says so.
import { beforeAll, describe, expect, it } from "vitest";
import { bootMain, dashboardShown, el } from "./helpers/mainHarness";

beforeAll(async () => {
  await bootMain("?test&mock_data&machine=nobody&exclusions=off");
  await dashboardShown();
});

describe("main.ts boot with filters in the URL", () => {
  it("applies them", () => {
    expect(el<HTMLInputElement>("filter-exclusions").checked).toBe(false);
    expect(el("filter-summary").textContent).toBe("0 results files · 0 machines · 0 environments");
  });

  it("explains every empty figure instead of drawing it", () => {
    expect(el("rankings-note").textContent).toContain("No remote file-opening or slicing results");
    expect(el("traffic-note").textContent).toContain("No pairs of network-tracking and timing results");
    expect(el("versions-note").textContent).toContain("No PyNWB timing results");
    expect(el("extrapolation-note").textContent).toContain("the filters leave none");
    expect(el("incremental-note").textContent).toContain("No incremental slicing results");
    expect(el<HTMLButtonElement>("rankings-csv-btn").disabled).toBe(true);
    expect(el("versions-legend").hidden).toBe(true);
  });
});
