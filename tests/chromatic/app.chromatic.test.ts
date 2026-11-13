import { test, expect } from "@chromatic-com/playwright";
import { expectNoHorizontalOverflow, forEachViewport } from "@brain-bbqs/test-utils/playwright";

// forEachViewport registers each state once per viewport, sized and named in the title, since
// Chromatic keys a capture by the test's title alone.

forEachViewport(test, "Main page - loading", async ({ page }) => {
  // Held part-way through the download (see src/lib/testInjection.ts), so the capture never races it.
  await page.goto("/?test&freeze_loading");
  await expect(page.locator("#load-status")).toContainText("793 KB");
  await expectNoHorizontalOverflow(page);
});

forEachViewport(test, "Main page - load failed", async ({ page }) => {
  await page.goto("/?test&load_error");
  await expect(page.locator("#load-error")).toBeVisible();
  await expectNoHorizontalOverflow(page);
});

forEachViewport(test, "Main page - dashboard", async ({ page }) => {
  // The synthesized bundle is built from fixed formulas and a seeded generator (see
  // src/lib/mockBundle.ts), so the figures are the same on every run.
  await page.goto("/?test&mock_data");
  for (const id of ["rankings", "traffic", "versions", "incremental"]) {
    await expect(page.locator(`#${id}-plot.js-plotly-plot .main-svg`).first()).toBeVisible();
  }
  await expectNoHorizontalOverflow(page);
});

forEachViewport(test, "Main page - dashboard, nothing selected", async ({ page }) => {
  await page.goto("/?test&mock_data&q=machine%3Anobody");
  await expect(page.locator("#rankings-note")).toBeVisible();
  await expectNoHorizontalOverflow(page);
});

forEachViewport(test, "Main page - search suggestions", async ({ page }) => {
  await page.goto("/?test&mock_data");
  await page.locator("#search-input").click();
  await page.locator("#search-input").pressSequentially("environment:");
  await expect(page.locator("#search-suggestions [role=option]").first()).toBeVisible();
  await expectNoHorizontalOverflow(page);
});

forEachViewport(test, "Main page - manuscript button explained", async ({ page }) => {
  await page.goto("/?test&mock_data");
  await page.locator("#manuscript-toggle").hover();
  await expect(page.locator("#manuscript-tooltip")).toBeVisible();
  await expectNoHorizontalOverflow(page);
});
