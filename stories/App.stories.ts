// Loaded via Vite's `?raw` import so this story always mirrors the real markup in index.html
// instead of a hand-maintained copy that can drift out of sync.
import indexHtml from "../index.html?raw";
import { INJECTED_LOAD_ERROR } from "../src/lib/testInjection";

// Injected by configs/storybook/main.ts, the same way vite.config.ts injects it for the real app.
declare const __APP_VERSION__: string;

type AppState = "loading" | "failed";

// Mirrors what src/ui/loader.ts writes into the loading card. Storybook runs none of the app's
// script, so the story fills in the same elements by hand. The loaded dashboard is snapshotted
// whole by the Playwright suite (tests/chromatic/), and each figure has its own stories.
function applyState(wrapper: HTMLElement, state: AppState): void {
  const status = wrapper.querySelector("#load-status");
  const fill = wrapper.querySelector<HTMLElement>("#load-progress-fill");
  if (state === "loading") {
    if (status) status.textContent = "Downloading the latest results… 793 KB of 1.9 MB";
    if (fill) fill.style.width = "41%";
    return;
  }
  if (status) status.textContent = "The results could not be loaded.";
  wrapper.querySelector("#load-progress")?.setAttribute("hidden", "");
  const error = wrapper.querySelector("#load-error");
  if (error) {
    error.textContent = INJECTED_LOAD_ERROR;
    error.removeAttribute("hidden");
  }
  wrapper.querySelector("#retry-load-btn")?.removeAttribute("hidden");
}

function buildApp(state: AppState): HTMLElement {
  const doc = new DOMParser().parseFromString(indexHtml, "text/html");
  // The app's own <script type="module"> wires up real behavior; Storybook only needs the static
  // markup for a visual snapshot of each state.
  doc.body.querySelectorAll("script").forEach((s) => s.remove());
  const wrapper = document.createElement("div");
  wrapper.innerHTML = doc.body.innerHTML;
  // Mirrors the one line of main.ts that runs before anything is loaded; without it the footer's
  // version link would render as an empty (invisible) anchor in the snapshots.
  const version = wrapper.querySelector("#version-indicator");
  if (version) version.textContent = `v${__APP_VERSION__}`;
  applyState(wrapper, state);
  return wrapper;
}

export default {
  title: "App",
};

export const Loading = {
  name: "Loading the results",
  render: () => buildApp("loading"),
};

export const LoadFailed = {
  name: "Loading failed",
  render: () => buildApp("failed"),
};
