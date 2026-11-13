import "./style.css";
import { initThemeToggle, renderVersion } from "@brain-bbqs/ui";
import { BundleError, RESULTS_BUNDLE_URL, decodeBundle, fetchBundleBytes } from "./lib/bundle";
import { readDatabase, type Bundle, type Database } from "./lib/database";
import { synthesizeMockBundle } from "./lib/mockBundle";
import { THEME_KEY } from "./lib/settings";
import { FROZEN_PROGRESS, INJECTED_LOAD_ERROR, readTestInjection } from "./lib/testInjection";
import { createDashboard } from "./ui/dashboard";
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
const loader = createLoader(els);
let current: AbortController | null = null;

function errorMessage(error: unknown): string {
  if (error instanceof BundleError) return error.message;
  if (error instanceof TypeError) return "The results server could not be reached. Check the connection and try again.";
  return error instanceof Error ? error.message : String(error);
}

/** The published bundle, or, under a `?test` injection, its stand-in at this one point. */
async function obtainPublished(signal: AbortSignal, fresh: boolean): Promise<Bundle> {
  if (injection?.mockData) return synthesizeMockBundle();
  if (injection?.freezeLoading) {
    loader.downloading(FROZEN_PROGRESS);
    return new Promise<Bundle>(() => {});
  }
  if (injection?.loadError) throw new BundleError(INJECTED_LOAD_ERROR);
  const bytes = await fetchBundleBytes(RESULTS_BUNDLE_URL, {
    signal,
    fresh,
    onProgress: (progress) => loader.downloading(progress),
  });
  loader.reading("the results");
  return decodeBundle(bytes);
}

/** Downloads the results again in place, for the summary's refresh button. */
async function refresh(): Promise<Database> {
  try {
    return readDatabase(await obtainPublished(new AbortController().signal, true));
  } catch (error) {
    throw new Error(errorMessage(error), { cause: error });
  }
}

const dashboard = createDashboard(els, window.location, { refresh });

/** The first load, with the loading card; a retry supersedes a load still running. */
async function load(): Promise<void> {
  current?.abort();
  const controller = new AbortController();
  current = controller;
  els.dashboard.hidden = true;
  els.loadCard.hidden = false;
  loader.downloading(null);
  try {
    const bundle = await obtainPublished(controller.signal, false);
    if (controller.signal.aborted) return;
    loader.reading("the results");
    const db = readDatabase(bundle);
    els.loadCard.hidden = true;
    els.dashboard.hidden = false;
    dashboard.show(db);
  } catch (error) {
    if (controller.signal.aborted) return;
    loader.failed(errorMessage(error));
  }
}

els.retryLoadBtn.addEventListener("click", () => void load());

void load();
