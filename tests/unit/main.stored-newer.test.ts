// @vitest-environment jsdom
// Boots with an older copy kept from an earlier visit: the dashboard is drawn from it, then redrawn
// with the newer published results once they arrive, which are kept in its place.
import { beforeAll, describe, expect, it, vi } from "vitest";
import { RESULTS_BUNDLE_URL } from "../../src/lib/bundle";
import { digestOf, readStoredBundle, storeBundle } from "../../src/lib/bundleCache";
import { synthesizeMockBundle } from "../../src/lib/mockBundle";
import { fakeCacheStorage } from "./helpers/cacheStorage";
import { bootMain, dashboardShown, el, publishedBundleFetch } from "./helpers/mainHarness";
import { readParityBundleBytes } from "./helpers/parity";

const storage = fakeCacheStorage();
let keptTotals = "";

beforeAll(async () => {
  const older = new TextEncoder().encode(JSON.stringify(synthesizeMockBundle()));
  await storeBundle(storage, RESULTS_BUNDLE_URL, older);
  await bootMain({ fetch: publishedBundleFetch(), beforeImport: () => vi.stubGlobal("caches", storage) });
  await dashboardShown();
  keptTotals = el("summary-totals").textContent;
});

describe("main.ts boot with an older kept copy", () => {
  it("redraws the dashboard with the newer results and keeps them", async () => {
    await vi.waitFor(() => expect(el("summary-totals").textContent).not.toBe(keptTotals));
    const kept = await readStoredBundle(storage, RESULTS_BUNDLE_URL);
    expect(kept?.digest).toBe(await digestOf(readParityBundleBytes()));
  });
});
