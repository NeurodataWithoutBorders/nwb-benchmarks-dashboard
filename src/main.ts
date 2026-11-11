import "./style.css";
import { initThemeToggle, renderVersion } from "@brain-bbqs/ui";
import { BundleError, RESULTS_BUNDLE_URL, decodeBundle, fetchBundleBytes } from "./lib/bundle";
import { readDatabase, type Bundle } from "./lib/database";
import { synthesizeMockBundle } from "./lib/mockBundle";
import { THEME_KEY } from "./lib/settings";
import { FROZEN_PROGRESS, INJECTED_LOAD_ERROR, readTestInjection } from "./lib/testInjection";
import { PUBLISHED_SOURCE, createDashboard } from "./ui/dashboard";
import { initDropzone, readFileBytes } from "./ui/dropzone";
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
// The app: load the results bundle (the published one, or a copy dropped in), then the dashboard.
// ---------------------------------------------------------------------------------------------

const injection = readTestInjection(window.location.search);
const loader = createLoader(els);
const dashboard = createDashboard(els, window.location);
let current: AbortController | null = null;

function errorMessage(error: unknown): string {
  if (error instanceof BundleError) return error.message;
  if (error instanceof TypeError) return "The results server could not be reached. Check the connection and try again.";
  return error instanceof Error ? error.message : String(error);
}

/** Runs one load to the end: whatever starts after it (a drop, a retry) supersedes it. */
async function load(obtain: (signal: AbortSignal) => Promise<Bundle>, source: string): Promise<void> {
  current?.abort();
  const controller = new AbortController();
  current = controller;
  els.dashboard.hidden = true;
  els.loadCard.hidden = false;
  try {
    const bundle = await obtain(controller.signal);
    if (controller.signal.aborted) return;
    loader.reading("the results");
    const db = readDatabase(bundle);
    els.loadCard.hidden = true;
    els.dashboard.hidden = false;
    dashboard.show(db, source);
  } catch (error) {
    if (controller.signal.aborted) return;
    loader.failed(errorMessage(error));
  }
}

/** The published bundle, or, under a `?test` injection, its stand-in at this one point. */
async function obtainPublished(signal: AbortSignal): Promise<Bundle> {
  loader.downloading(null);
  if (injection?.mockData) return synthesizeMockBundle();
  if (injection?.freezeLoading) {
    loader.downloading(FROZEN_PROGRESS);
    return new Promise<Bundle>(() => {});
  }
  if (injection?.loadError) throw new BundleError(INJECTED_LOAD_ERROR);
  const bytes = await fetchBundleBytes(RESULTS_BUNDLE_URL, {
    signal,
    onProgress: (progress) => loader.downloading(progress),
  });
  loader.reading("the results");
  return decodeBundle(bytes);
}

function loadPublished(): void {
  void load(obtainPublished, injection?.mockData ? "synthesized by the mock_data test injection" : PUBLISHED_SOURCE);
}

initDropzone(els, (file) => {
  void load(async () => {
    loader.reading(file.name);
    return decodeBundle(await readFileBytes(file));
  }, `from ${file.name}`);
});

els.retryLoadBtn.addEventListener("click", loadPublished);
els.changeSourceBtn.addEventListener("click", () => {
  current?.abort();
  els.dashboard.hidden = true;
  els.loadCard.hidden = false;
  loader.idle("Drop a copy of the results bundle below, or download the latest one again.");
});

loadPublished();
