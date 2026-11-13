// @vitest-environment jsdom
// Boots with the published bundle kept from an earlier visit: the dashboard is drawn from that copy
// without the loading card, the browser is asked to revalidate its own copy, and unchanged results
// are neither redrawn nor kept again. The refresh button downloads and keeps them anew.
import { beforeAll, describe, expect, it, vi } from "vitest";
import { RESULTS_BUNDLE_URL } from "../../src/lib/bundle";
import { readStoredBundle, storeBundle } from "../../src/lib/bundleCache";
import { fakeCacheStorage } from "./helpers/cacheStorage";
import { bootMain, dashboardShown, el, publishedBundleFetch } from "./helpers/mainHarness";
import { readParityBundleBytes } from "./helpers/parity";

const storage = fakeCacheStorage();
const fetched = publishedBundleFetch();
const STORED_AT = new Date("2026-11-01T12:00:00Z");
let loadCardShown = false;

beforeAll(async () => {
  await storeBundle(storage, RESULTS_BUNDLE_URL, readParityBundleBytes(), STORED_AT);
  await bootMain({
    fetch: fetched,
    beforeImport: () => {
      vi.stubGlobal("caches", storage);
      const card = el("load-card");
      loadCardShown = !card.hidden;
      new MutationObserver(() => {
        loadCardShown ||= !card.hidden;
      }).observe(card, { attributes: true, attributeFilter: ["hidden"] });
    },
  });
  await dashboardShown();
  await vi.waitFor(() => expect(fetched.calls.length).toBe(1));
});

describe("main.ts boot with a kept copy", () => {
  it("draws the kept copy without the loading card, and only asks the browser to revalidate", () => {
    expect(loadCardShown).toBe(false);
    expect(el("summary-totals").textContent).toMatch(/Records\d+/);
    expect(fetched.calls[0].init?.cache).toBe("no-cache");
  });

  it("leaves unchanged results as they are", async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect((await readStoredBundle(storage, RESULTS_BUNDLE_URL))?.storedAt).toBe(STORED_AT.toISOString());
    expect(el("summary-note").hidden).toBe(true);
  });

  it("keeps the results the refresh button downloads", async () => {
    el("refresh-btn").click();
    await vi.waitFor(async () =>
      expect((await readStoredBundle(storage, RESULTS_BUNDLE_URL))?.storedAt).not.toBe(STORED_AT.toISOString()),
    );
    expect(fetched.calls.length).toBe(2);
    expect(fetched.calls[1].init?.cache).toBe("no-cache");
  });
});
