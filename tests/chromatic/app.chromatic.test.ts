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
  await expect(page.locator("#incremental-figure svg.chart")).toHaveCount(3);
  await expectNoHorizontalOverflow(page);
});

forEachViewport(test, "Main page - dashboard, nothing selected", async ({ page }) => {
  await page.goto("/?test&mock_data&machine=nobody");
  await expect(page.locator("#rankings-note")).toBeVisible();
  await expectNoHorizontalOverflow(page);
});
