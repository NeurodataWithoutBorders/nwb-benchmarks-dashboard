// Live smoketest URL params (`?test&...`), the scheme every BBQS companion app shares (see
// docs/README.md): a link pasted into the deployed app's address bar drives the UI into a specific,
// real state with no local file, no sign-in and no network call, purely so a human can eyeball every
// important UI state live and so Playwright specs (the Chromatic snapshots above all) can reach the
// same states without heavy `page.route` stubbing.
//
// This module only *parses* the query string into a plan; every field here is inert until main.ts
// reads it and, at the exact point the real code path would otherwise have fetched the published
// results, substitutes the fake instead. That split keeps the fakes honest: a state built this way
// runs through the same reading, filtering and rendering code a real one would, so a screenshot of
// it is a screenshot of the real UI, not a mockup drawn beside it.
//
// `?test` alone (with none of the params below) is a no-op: every field defaults to off, so nothing
// downstream branches away from the ordinary boot path. Nothing here writes to localStorage.

import type { LoadProgress } from "./bundle";

/** What one `?test&...` URL asks the app to fake. */
export interface TestInjection {
  /** Loads the synthesized bundle of mockBundle.ts instead of fetching the published one, so the
   * dashboard can be looked at (and snapshotted) on fixed data. */
  mockData: boolean;
  /** Holds the loading card part-way through a download that never finishes. */
  freezeLoading: boolean;
  /** Fails the download, as an unreachable results server would. */
  loadError: boolean;
}

/**
 * Reads `?test&...` out of a query string, or null when the page was not asked to fake anything,
 * the ordinary case, which every caller should treat as "boot for real".
 */
export function readTestInjection(search: string): TestInjection | null {
  const params = new URLSearchParams(search);
  if (!params.has("test")) return null;
  return {
    mockData: params.has("mock_data"),
    freezeLoading: params.has("freeze_loading"),
    loadError: params.has("load_error"),
  };
}

/** The fixed progress `?test&freeze_loading` holds the loading card at. */
export const FROZEN_PROGRESS: LoadProgress = { received: 812_345, total: 1_993_919 };

/** The failure `?test&load_error` reports, worded so it is never mistaken for a real outage. */
export const INJECTED_LOAD_ERROR = "The results server answered 503 (a test injection, not a real outage).";
