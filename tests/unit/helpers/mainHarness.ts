// Shared harness for tests that boot the real src/main.ts against the real index.html markup.
// Each test file gets its own module registry, so importing main.ts runs its top-level wiring
// exactly once per file; boot with the URL search params the scenario needs before that first
// import (one file per boot scenario, e.g. main.smoke.test.ts and main.mock-data.test.ts).
// The import stays here, in the app's own code, so Vitest transforms it and a test file's
// `vi.mock` calls apply to what main.ts imports.
import { createMainHarness, routeFetch, type FetchRouter } from "@brain-bbqs/test-utils/vitest";
import { vi } from "vitest";
import { RESULTS_BUNDLE_URL } from "../../../src/lib/bundle";
import { readParityBundleBytes } from "./parity";

export const { bootMain } = createMainHarness({
  importMain: () => import("../../../src/main"),
  observers: ["ResizeObserver"],
});
export { el } from "@brain-bbqs/test-utils/vitest";

/** A fetch that serves the parity fixture as the published bundle, the way GitHub serves it. */
export function publishedBundleFetch(): FetchRouter {
  const bytes = readParityBundleBytes();
  return routeFetch([
    {
      match: RESULTS_BUNDLE_URL,
      respond: () => new Response(bytes as BlobPart, { headers: { "content-length": String(bytes.length) } }),
    },
  ]);
}

/** Waits until the dashboard has replaced the loading card. */
export async function dashboardShown(): Promise<void> {
  await vi.waitFor(() => {
    if ((document.getElementById("dashboard") as HTMLElement).hidden) throw new Error("still loading");
  });
}

/** Applies a search at once, the way pressing Enter in the search box does. */
export function search(query: string): void {
  const input = document.getElementById("search-input") as HTMLInputElement;
  input.value = query;
  (document.getElementById("search-form") as HTMLFormElement).dispatchEvent(new Event("submit", { cancelable: true }));
}
