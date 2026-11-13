// @vitest-environment jsdom
// Boots with a copy kept from an earlier visit but no network: the kept results are shown, with a
// note that newer ones could not be checked for.
import { beforeAll, describe, expect, it, vi } from "vitest";
import { RESULTS_BUNDLE_URL } from "../../src/lib/bundle";
import { storeBundle } from "../../src/lib/bundleCache";
import { fakeCacheStorage } from "./helpers/cacheStorage";
import { bootMain, dashboardShown, el } from "./helpers/mainHarness";
import { readParityBundleBytes } from "./helpers/parity";

const storage = fakeCacheStorage();

beforeAll(async () => {
  await storeBundle(storage, RESULTS_BUNDLE_URL, readParityBundleBytes(), new Date("2026-11-01T12:00:00Z"));
  await bootMain({ beforeImport: () => vi.stubGlobal("caches", storage) });
  await dashboardShown();
});

describe("main.ts boot with a kept copy, offline", () => {
  it("shows the kept results and says when they were saved", async () => {
    await vi.waitFor(() => expect(el("summary-note").hidden).toBe(false));
    expect(el("summary-note").textContent).toBe(
      "Showing the results saved on 2026-11-01, as newer ones could not be checked for.",
    );
  });
});
