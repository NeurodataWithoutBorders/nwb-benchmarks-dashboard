import { test, expect } from "@playwright/test";
import { seedTheme } from "@brain-bbqs/test-utils/playwright";
import { THEME_KEY } from "../../src/lib/settings";

test.describe("NWB Benchmarks Dashboard shell", () => {
  test("renders branding, version, and the loading card", async ({ page }) => {
    // Wide enough that the corner watermark and footer bar stay in their fixed, viewport-anchored
    // spots instead of the narrow-screen fallback (the max-width: 1400px query in @brain-bbqs/ui's
    // shell.css) that hides the watermark and flows the footer into the page to avoid overlapping cards.
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/?test&freeze_loading");
    await expect(page).toHaveTitle("NWB Benchmarks Dashboard");
    await expect(page.locator("h1")).toHaveText("NWB Benchmarks Dashboard");
    await expect(page.locator(".site-subtitle")).toContainText("the paper's figures");
    await expect(page.locator(".header-logo")).toBeVisible();
    await expect(page.locator(".brand-watermark-logo")).toBeVisible();
    const versionLink = page.locator("#version-indicator");
    await expect(versionLink).toHaveText(/^v\d+\.\d+\.\d+$/);
    await expect(versionLink).toHaveAttribute("href", "https://github.com/brain-bbqs/nwb-benchmarks-dashboard");
    await expect(page.locator('a.footer-brand-link[href="https://centerforopenneuroscience.org"]')).toBeVisible();
    await expect(page.locator("#load-status")).toHaveText("Downloading the latest results… 793 KB of 1.9 MB");
    await expect(page.locator("#dropzone")).toBeVisible();
    await expect(page.locator("#dashboard")).toBeHidden();
  });

  test("boots for real when ?test names nothing to fake, fetching the published results", async ({ page }) => {
    const request = page.waitForRequest((candidate) =>
      candidate.url().includes("nwb-benchmarks-results/dist/bundle.json.gz"),
    );
    await page.goto("/?test");
    await request;
  });

  test("flips the theme from the header toggle and keeps it across a reload", async ({ page }) => {
    // Start from the light theme so the single toggle click below lands on dark.
    await page.emulateMedia({ colorScheme: "light" });
    await page.goto("/?test&freeze_loading");
    expect(await page.locator("html").getAttribute("data-theme")).toBe(null);
    await page.locator("#theme-toggle").click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    await page.reload();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  });

  test("applies a stored theme before first paint", async ({ page }) => {
    await seedTheme(page, "dark", { storageKey: THEME_KEY });
    await page.goto("/?test&freeze_loading");
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  });

  test("opens What's New from the footer and from the #changelog fragment", async ({ page }) => {
    await page.goto("/?test&freeze_loading");
    const modal = page.locator("#whats-new-modal");
    await page.locator("#whats-new-button").click();
    await expect(modal).toBeVisible();
    await expect(modal.locator(".changelog-version").first()).toBeVisible();
    await expect(page).toHaveURL(/#changelog$/);

    await page.locator("#whats-new-close").click();
    await expect(modal).toBeHidden();
    await expect(page).not.toHaveURL(/#changelog/);

    await page.goto("/?test&freeze_loading#changelog");
    await expect(modal).toBeVisible();
  });

  test("drops the fixed watermark once the viewport is too narrow to frame the page", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("/?test&freeze_loading");
    await expect(page.locator(".brand-watermark-link")).toBeHidden();
    // The footer stays, but in normal document flow under the page content.
    await expect(page.locator(".page-footer-bar")).toHaveCSS("position", "static");
    await expect(page.locator(".footer-brand-link")).toBeVisible();
  });
});
