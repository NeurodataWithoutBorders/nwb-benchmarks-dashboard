import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test, expect, type Page } from "@playwright/test";

const PARITY_BUNDLE = resolve(process.cwd(), "tests/fixtures/parity-bundle.json.gz");

/** Serves the parity fixture as the published bundle: no `?test` injection holds the paper machine's results. */
async function serveParityBundle(page: Page): Promise<void> {
  await page.route("https://raw.githubusercontent.com/**/bundle.json.gz", (route) =>
    route.fulfill({ body: readFileSync(PARITY_BUNDLE), contentType: "application/octet-stream" }),
  );
}

test.describe("the dashboard", () => {
  test("totals the results and draws every figure with Plotly", async ({ page }) => {
    await page.goto("/?test&mock_data");
    await expect(page.locator("#dashboard")).toBeVisible();
    await expect(page.locator("#load-card")).toBeHidden();
    await expect(page.locator("#summary-totals th")).toHaveText([
      "Records",
      "Machines",
      "Environments",
      "Benchmarks",
      "Test cases",
    ]);
    await expect(page.locator("#summary-updated")).toHaveText(/^Last updated \d{4}-\d{2}-\d{2}$/);
    for (const id of ["rankings", "traffic", "versions", "incremental"]) {
      await expect(page.locator(`#${id}-plot.js-plotly-plot .main-svg`).first()).toBeVisible();
    }
    await expect(page.locator("#rankings-plot")).toContainText("Remote File Opening");
    // Panels are lettered in the manuscript view only.
    await expect(page.locator("#rankings-plot")).not.toContainText("a)");
  });

  test("shows a value on hover, and the modebar's downloads", async ({ page }) => {
    await page.goto("/?test&mock_data");
    const panel = page.locator("#rankings-plot .nsewdrag").first();
    const box = await panel.boundingBox();
    if (!box) throw new Error("the first heatmap has no drag area");
    await page.mouse.move(box.x + box.width / 6, box.y + 6);
    await expect(page.locator("#rankings-plot .hoverlayer")).toContainText("HDF5 remfile · Ecephys");
    await expect(page.locator('#rankings-plot [data-title="Download plot as SVG"]')).toHaveCount(1);
    await expect(page.locator('#rankings-plot [data-title="Share chart..."]')).toHaveCount(0);

    const svg = page.waitForEvent("download");
    await page.locator('#traffic-plot [data-title="Download plot as SVG"]').click({ force: true });
    const download = await svg;
    expect(download.suggestedFilename()).toBe("network-traffic-vs-runtime.svg");
    expect(readFileSync(await download.path(), "utf-8")).toContain("<svg");
  });

  test("narrows every figure from the search, suggesting keys and values, and keeps it in the address", async ({
    page,
  }) => {
    await page.goto("/?test&mock_data");
    const input = page.locator("#search-input");
    await input.click();
    await expect(page.locator("#search-suggestions")).toBeVisible();
    await input.pressSequentially("enviro");
    await expect(page.locator("#search-suggestions [role=option]").first()).toContainText("environment:");
    await input.press("ArrowDown");
    await input.press("Enter");
    await expect(input).toHaveValue("environment:");
    await input.pressSequentially("test-a");
    await input.press("ArrowDown");
    await input.press("Enter");
    await expect(page).toHaveURL(/q=environment%3A/);
    await expect(page.locator("#versions-note")).toContainText("single software environment");
    await expect(page.locator("#incremental-note")).toContainText("No incremental slicing results");

    await page.reload();
    await expect(page.locator("#search-input")).toHaveValue(/^environment:/);
    await expect(page.locator("#versions-note")).toContainText("single software environment");
    await page.locator("#search-input").fill("");
    await page.locator("#search-input").press("Enter");
    await expect(page.locator("#versions-note")).toBeHidden();
    await expect(page).toHaveURL(/\?test&mock_data$/);
  });

  test("redraws a figure for the settings behind its gear, and switches it to a table", async ({ page }) => {
    await page.goto("/?test&mock_data");
    await expect(page.locator("#versions-benchmark")).toBeHidden();
    await page.locator("#versions-settings-btn").click();
    await page.locator("#versions-benchmark").selectOption("time_remote_slicing");
    await expect(page.locator("#versions-plot")).toContainText("not preloaded");
    await page.keyboard.press("Escape");
    await expect(page.locator("#versions-settings")).toBeHidden();
    await page.locator("#incremental-settings-btn").click();
    await page.locator("#incremental-scale").selectOption("log");
    await expect(page.locator("#incremental-plot")).toContainText("log scale");
    await page.locator("#incremental-card h2").click();
    await expect(page.locator("#incremental-settings")).toBeHidden();

    await page.locator("label[for=rankings-view-table]").click();
    await expect(page.locator("#rankings-plot")).toBeHidden();
    await expect(page.locator("#rankings-table tbody tr").first()).toBeVisible();
    const csv = page.waitForEvent("download");
    await page.locator("#rankings-csv-btn").click();
    expect((await csv).suggestedFilename()).toBe("method-rankings.csv");
    await page.locator("label[for=rankings-view-plot]").click();
    await expect(page.locator("#rankings-plot .main-svg").first()).toBeVisible();
  });

  test("shows the manuscript's figures from the header, and leaves them for a search", async ({ page }) => {
    await serveParityBundle(page);
    await page.goto("/");
    const toggle = page.locator("#manuscript-toggle");
    const tooltip = page.locator("#manuscript-tooltip");
    await expect(tooltip).toBeHidden();
    await toggle.hover();
    await expect(tooltip).toBeVisible();
    await expect(tooltip).toContainText("Draws each figure as the NWB Benchmarks manuscript does");
    await toggle.click();
    await expect(page).toHaveURL(/\?manuscript$/);
    await expect(toggle).toHaveAttribute("aria-pressed", "true");
    await expect(tooltip).toContainText("Click again, or type a search, to see every record.");
    await expect(page.locator("#search-input")).toHaveAttribute("placeholder", /^Showing the manuscript's figures/);
    await expect(page.locator("#rankings-plot")).toContainText("a)");
    await expect(page.locator("#versions-plot")).toContainText("2024-06-30");

    await page.locator("#search-input").fill("pynwb:3");
    await page.locator("#search-input").press("Enter");
    await expect(page).toHaveURL(/\?q=pynwb%3A3$/);
    await expect(toggle).toHaveAttribute("aria-pressed", "false");
    await expect(page.locator("#rankings-plot")).not.toContainText("a)");
  });

  test("draws the results kept from the last visit, and says so when newer ones cannot be checked for", async ({
    page,
  }) => {
    await serveParityBundle(page);
    await page.goto("/");
    await expect(page.locator("#dashboard")).toBeVisible();

    await page.unroute("https://raw.githubusercontent.com/**/bundle.json.gz");
    await page.route("https://raw.githubusercontent.com/**/bundle.json.gz", (route) => route.abort());
    // Records whether the loading card is ever on screen, from the first frame of the next page.
    await page.addInitScript(() => {
      const watch = (): void => {
        const card = document.getElementById("load-card");
        if (card && !card.hidden) document.documentElement.dataset.loadCardShown = "";
        requestAnimationFrame(watch);
      };
      requestAnimationFrame(watch);
    });
    await page.reload();
    await expect(page.locator("#dashboard")).toBeVisible();
    await expect(page.locator("html")).not.toHaveAttribute("data-load-card-shown");
    await expect(page.locator("#summary-note")).toContainText(/^Showing the results saved on \d{4}-\d{2}-\d{2}/);
  });

  test("reports a failed download, and refreshes the results in place", async ({ page }) => {
    await page.goto("/?test&load_error");
    await expect(page.locator("#load-error")).toContainText("test injection");
    await expect(page.locator("#retry-load-btn")).toBeVisible();

    await serveParityBundle(page);
    await page.goto("/");
    await expect(page.locator("#dashboard")).toBeVisible();
    const refreshed = page.waitForRequest((request) => request.url().endsWith("/dist/bundle.json.gz"));
    await page.locator("#refresh-btn").click();
    await refreshed;
    await expect(page.locator("#refresh-btn")).toBeEnabled();
    await expect(page.locator("#load-card")).toBeHidden();
  });
});
