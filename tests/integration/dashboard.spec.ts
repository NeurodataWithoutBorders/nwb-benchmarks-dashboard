import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test, expect } from "@playwright/test";
import { dropFile } from "./helpers/drop";

test.describe("the dashboard", () => {
  test("draws every figure from the synthesized results", async ({ page }) => {
    await page.goto("/?test&mock_data");
    await expect(page.locator("#dashboard")).toBeVisible();
    await expect(page.locator("#load-card")).toBeHidden();
    await expect(page.locator("#data-summary")).toContainText("synthesized by the mock_data test injection");
    await expect(page.locator("#rankings-figure svg.chart")).toHaveCount(4);
    await expect(page.locator("#traffic-figure svg.chart")).toHaveCount(5);
    await expect(page.locator("#versions-figure svg.chart")).toHaveCount(3);
    await expect(page.locator("#extrapolation-figure svg.chart")).toHaveCount(3);
    await expect(page.locator("#incremental-figure svg.chart")).toHaveCount(3);
  });

  test("shows a value on hover", async ({ page }) => {
    await page.goto("/?test&mock_data");
    await page.locator("#rankings-figure .heat-cell").first().hover();
    await expect(page.locator("#chart-tooltip")).toBeVisible();
    await expect(page.locator("#chart-tooltip")).toContainText("HDF5 remfile · Ecephys");
  });

  test("narrows every figure from a facet, and keeps the filters in the address", async ({ page }) => {
    await page.goto("/?test&mock_data");
    await page.locator("details.facet[data-facet='environment'] summary").click();
    await page.locator("details.facet[data-facet='environment'] .facet-option").first().hover();
    await page.locator("details.facet[data-facet='environment'] .facet-only").first().click();
    await expect(page).toHaveURL(/environment=test-a-environment/);
    await expect(page.locator("#versions-note")).toContainText("single software environment");
    await expect(page.locator("#incremental-note")).toContainText("No incremental slicing results");

    await page.reload();
    await expect(page.locator("#versions-note")).toContainText("single software environment");
    await page.locator(".preset-button", { hasText: "All results" }).click();
    await expect(page.locator("#versions-note")).toBeHidden();
  });

  test("redraws a figure for its own controls", async ({ page }) => {
    await page.goto("/?test&mock_data");
    await page.locator("#versions-benchmark").selectOption("time_remote_slicing");
    await expect(page.locator("#versions-figure svg.chart")).toHaveCount(6);
    await page.locator("#incremental-scale").selectOption("log");
    await expect(page.locator("#incremental-figure")).toContainText("log scale");
  });

  test("saves a figure as CSV and SVG", async ({ page }) => {
    await page.goto("/?test&mock_data");
    const csv = page.waitForEvent("download");
    await page.locator("#rankings-csv-btn").click();
    expect((await csv).suggestedFilename()).toBe("method-rankings.csv");
    const svg = page.waitForEvent("download");
    await page.locator("#traffic-svg-btn").click();
    const download = await svg;
    expect(download.suggestedFilename()).toBe("network-traffic-vs-runtime.svg");
    const text = readFileSync(await download.path(), "utf-8");
    expect(text).toContain("<svg");
    expect(text).not.toContain("var(--");
  });

  test("reports a failed download, then loads a dropped bundle instead", async ({ page }) => {
    await page.goto("/?test&load_error");
    await expect(page.locator("#load-error")).toContainText("test injection");
    await expect(page.locator("#retry-load-btn")).toBeVisible();
    await dropFile(page, {
      name: "bundle.json.gz",
      mimeType: "application/gzip",
      buffer: readFileSync(resolve(process.cwd(), "tests/fixtures/parity-bundle.json.gz")),
    });
    await expect(page.locator("#dashboard")).toBeVisible();
    await expect(page.locator("#data-summary")).toContainText("from bundle.json.gz");
    await expect(page.locator(".preset-button[aria-pressed='true']")).toHaveText("Paper: all reference environments");
  });
});
