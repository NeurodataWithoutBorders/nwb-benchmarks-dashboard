import "./style.css";
import { initThemeToggle, renderVersion } from "@brain-bbqs/ui";
import { BundleError, RESULTS_BUNDLE_URL, decodeBundle, fetchBundleBytes } from "./lib/bundle";
import { digestOf, readStoredBundle, storeBundle, type StoredBundle } from "./lib/bundleCache";
import { readDatabase, type Bundle, type Database } from "./lib/database";
import { synthesizeMockBundle } from "./lib/mockBundle";
import { THEME_KEY } from "./lib/settings";
import { FROZEN_PROGRESS, INJECTED_LOAD_ERROR, readTestInjection } from "./lib/testInjection";
import type { Dashboard } from "./ui/dashboard";
import { getElements, getShell } from "./ui/elements";
import { createLoader } from "./ui/loader";

const shell = getShell();
const els = getElements();

// ---------------------------------------------------------------------------------------------
// The shared shell: the footer version stamp and the light/dark toggle. Unlike the BBQS companion
// apps, this one carries no What's New modal, bug or feature links, or BBQS mark.
// ---------------------------------------------------------------------------------------------

renderVersion(shell.versionIndicator, __APP_VERSION__);

// The inline script in index.html already applied any stored theme override before first paint,
// so the toggle only has to flip and persist it, under the key that script reads.
initThemeToggle(shell.themeToggle, { storageKey: THEME_KEY });

// ---------------------------------------------------------------------------------------------
// The app: download the published results bundle, then show the dashboard.
// ---------------------------------------------------------------------------------------------

const injection = readTestInjection(window.location.search);
/** Whether a `?test` injection stands in for the published bundle (bare `?test` changes nothing). */
const faked = Boolean(injection?.mockData || injection?.freezeLoading || injection?.loadError);
/** Where the last download is kept for the next visit: never a fake's, and only where the browser has it. */
const storage: CacheStorage | undefined = !faked && "caches" in window ? window.caches : undefined;
const loader = createLoader(els);
let current: AbortController | null = null;

function errorMessage(error: unknown): string {
  if (error instanceof BundleError) return error.message;
  if (error instanceof TypeError) return "The results server could not be reached. Check the connection and try again.";
  return error instanceof Error ? error.message : String(error);
}

/** Under a `?test` injection, its stand-in for the published bundle, at this one point. */
async function fakeBundle(): Promise<Bundle> {
  if (injection?.mockData) return synthesizeMockBundle();
  if (injection?.freezeLoading) {
    loader.downloading(FROZEN_PROGRESS);
    return new Promise<Bundle>(() => {});
  }
  throw new BundleError(INJECTED_LOAD_ERROR);
}

/** Downloads the published bundle, reads it, and keeps it for the next visit. */
async function download(options: Parameters<typeof fetchBundleBytes>[1]): Promise<Bundle> {
  const bytes = await fetchBundleBytes(RESULTS_BUNDLE_URL, options);
  loader.reading("the results");
  const bundle = await decodeBundle(bytes);
  await keep(bytes);
  return bundle;
}

/** Keeps the bundle's bytes for the next visit. */
async function keep(bytes: Uint8Array): Promise<void> {
  try {
    await storeBundle(storage, RESULTS_BUNDLE_URL, bytes);
  } catch {
    // Only a convenience: a browser that refuses to keep a copy still shows the results.
  }
}

/** The copy kept from an earlier visit, read, or null when there is none or it no longer reads. */
async function readKept(): Promise<{ bundle: Bundle; kept: StoredBundle } | null> {
  try {
    const kept = await readStoredBundle(storage, RESULTS_BUNDLE_URL);
    return kept ? { bundle: await decodeBundle(kept.bytes), kept } : null;
  } catch {
    return null;
  }
}

/** Downloads the results again in place, for the refresh button. */
async function refresh(): Promise<Database> {
  try {
    if (faked) return readDatabase(await fakeBundle());
    return readDatabase(await download({ fresh: true }));
  } catch (error) {
    throw new Error(errorMessage(error), { cause: error });
  }
}

// The dashboard, and Plotly with it, loads beside the results rather than ahead of this script, so a
// kept copy is drawn without the loading card ever showing, and a first visit shows it at once.
const dashboardReady: Promise<Dashboard> = import("./ui/dashboard").then(({ createDashboard }) =>
  createDashboard(els, window.location, { refresh }),
);

async function show(db: Database): Promise<void> {
  const dashboard = await dashboardReady;
  els.loadCard.hidden = true;
  els.dashboard.hidden = false;
  dashboard.show(db);
}

/** After drawing a kept copy: has the browser revalidate its own HTTP-cached copy against the bundle's
 * ETag (a 304 when nothing changed), and redraws only if the bytes that come back are new. */
async function checkForNewer(kept: StoredBundle): Promise<void> {
  try {
    const bytes = await fetchBundleBytes(RESULTS_BUNDLE_URL, { fresh: true });
    if ((await digestOf(bytes)) === kept.digest) return;
    const bundle = await decodeBundle(bytes);
    await keep(bytes);
    (await dashboardReady).show(readDatabase(bundle));
  } catch {
    const saved = kept.storedAt.slice(0, 10);
    (await dashboardReady).note(
      `Showing the results saved${saved ? ` on ${saved}` : ""}, as newer ones could not be checked for.`,
    );
  }
}

/** Shows the loading card, which the page starts without so a kept copy can be drawn without it. */
function showLoading(): void {
  els.dashboard.hidden = true;
  els.loadCard.hidden = false;
  loader.downloading(null);
}

/** The first load: the copy kept from an earlier visit, drawn without the loading card, then a check
 * for newer results; or, without one, a download behind the loading card. A retry supersedes a load
 * still running. */
async function load(): Promise<void> {
  current?.abort();
  const controller = new AbortController();
  current = controller;
  try {
    if (faked) {
      showLoading();
      await show(readDatabase(await fakeBundle()));
      return;
    }
    const kept = await readKept();
    if (kept) {
      await show(readDatabase(kept.bundle));
      void checkForNewer(kept.kept);
      return;
    }
    showLoading();
    const bundle = await download({
      signal: controller.signal,
      onProgress: (progress) => loader.downloading(progress),
    });
    if (controller.signal.aborted) return;
    await show(readDatabase(bundle));
  } catch (error) {
    if (controller.signal.aborted) return;
    els.dashboard.hidden = true;
    els.loadCard.hidden = false;
    loader.failed(errorMessage(error));
  }
}

els.retryLoadBtn.addEventListener("click", () => void load());

void load();
