// @vitest-environment jsdom
// Boots with a kept copy that no longer reads, in a browser that refuses to keep a new one: the
// published bundle is downloaded behind the loading card as on a first visit, and shown all the same.
import { beforeAll, describe, expect, it, vi } from "vitest";
import { RESULTS_BUNDLE_URL } from "../../src/lib/bundle";
import { BUNDLE_CACHE } from "../../src/lib/bundleCache";
import { fakeCacheStorage } from "./helpers/cacheStorage";
import { bootMain, dashboardShown, el, publishedBundleFetch } from "./helpers/mainHarness";

const storage = fakeCacheStorage({ refuse: true });
const fetched = publishedBundleFetch();

beforeAll(async () => {
  storage.stored.set(BUNDLE_CACHE, new Map([[RESULTS_BUNDLE_URL, new Response("not a bundle")]]));
  await bootMain({ fetch: fetched, beforeImport: () => vi.stubGlobal("caches", storage) });
  await dashboardShown();
});

describe("main.ts boot with an unreadable kept copy", () => {
  it("downloads the published bundle as on a first visit", () => {
    expect(fetched.calls.length).toBe(1);
    expect(fetched.calls[0].init?.cache).toBeUndefined();
    expect(el("summary-totals").textContent).toMatch(/Records\d+/);
  });
});
