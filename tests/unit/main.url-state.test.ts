// @vitest-environment jsdom
// Boots with a search in the URL, as a shared link carries it: it wins over the default selection,
// here narrowing to a machine with no results so every card says so.
import { beforeAll, describe, expect, it } from "vitest";
import { bootMain, dashboardShown, el } from "./helpers/mainHarness";

beforeAll(async () => {
  await bootMain("?test&mock_data&q=machine%3Anobody+exclusions%3Aoff");
  await dashboardShown();
});

describe("main.ts boot with filters in the URL", () => {
  it("shows the search and applies it", () => {
    expect(el<HTMLInputElement>("search-input").value).toBe("machine:nobody exclusions:off");
    el("search-input").dispatchEvent(new Event("focus"));
    expect(document.querySelector(".search-note")?.textContent).toBe('No machine matches "nobody".');
    expect(el("summary-totals").textContent).toContain("Records0");
  });

  it("explains every empty figure instead of drawing it", () => {
    expect(el("rankings-note").textContent).toContain("No remote file-opening or slicing results");
    expect(el("traffic-note").textContent).toContain("No pairs of network-tracking and timing results");
    expect(el("versions-note").textContent).toContain("No PyNWB timing results");
    expect(el("incremental-note").textContent).toContain("No incremental slicing results");
    expect(el<HTMLButtonElement>("rankings-csv-btn").disabled).toBe(true);
  });
});
