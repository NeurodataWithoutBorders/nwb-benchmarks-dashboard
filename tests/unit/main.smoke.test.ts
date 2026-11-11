// @vitest-environment jsdom
// Boots the real src/main.ts against the real index.html markup, serving the parity fixture as the
// published bundle, and drives the dashboard and the shell end to end. Besides covering main.ts's
// wiring, this guards the index.html/elements.ts id contract: getShell() and getElements() throw
// on import if any registered id is missing from the page.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { installObserverStub, throwingStorage } from "@brain-bbqs/test-utils/vitest";
import { countChangelogVersions } from "@brain-bbqs/ui";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { ENVIRONMENT_TIMEPOINTS, LBL_MAC_MACHINE_IDS } from "../../src/lib/curation";
import { THEME_KEY } from "../../src/lib/settings";
import { bootMain, dashboardShown, el, publishedBundleFetch } from "./helpers/mainHarness";

const WHATS_NEW_RECENT_VERSIONS = 3;
let resizeObservers: ReturnType<typeof installObserverStub>;

beforeAll(async () => {
  await bootMain({
    fetch: publishedBundleFetch(),
    beforeImport: () => {
      resizeObservers = { instances: [], restore: () => {} };
      const Original = window.ResizeObserver;
      window.ResizeObserver = class extends Original {
        constructor(callback: ResizeObserverCallback) {
          super(callback);
          resizeObservers.instances.push(this as never);
        }
      };
    },
  });
  await dashboardShown();
});

function select(id: string, value: string): void {
  const element = el<HTMLSelectElement>(id);
  element.value = value;
  element.dispatchEvent(new Event("change"));
}

describe("main.ts boot", () => {
  it("stamps the version into the footer link", () => {
    expect(el("version-indicator").textContent).toMatch(/^v\d+\.\d+\.\d+$/);
  });

  it("loads the published bundle and opens on the paper's selection", () => {
    expect(el("load-card").hidden).toBe(true);
    expect(el("data-summary").textContent).toContain("published by NeurodataWithoutBorders/nwb-benchmarks-results");
    const pressed = document.querySelector(".preset-button[aria-pressed='true']");
    expect(pressed?.textContent).toBe("Paper: all reference environments");
    for (const id of LBL_MAC_MACHINE_IDS) expect(window.location.search).toContain(`machine=${id}`);
    expect(el("filter-from").getAttribute("value") ?? el<HTMLInputElement>("filter-from").value).toBe("2025-11-01");
  });

  it("draws every figure card", () => {
    expect(el("rankings-figure").querySelectorAll("svg.chart")).toHaveLength(4);
    expect(el("traffic-figure").querySelectorAll("svg.chart").length).toBeGreaterThan(0);
    expect(el("versions-figure").querySelectorAll("svg.chart")).toHaveLength(3);
    expect(el("extrapolation-figure").children.length).toBeGreaterThan(0);
    expect(el("incremental-figure").querySelectorAll("svg.chart")).toHaveLength(3);
    expect(el("versions-legend").children.length).toBeGreaterThan(0);
  });

  it("redraws a figure for its own controls", () => {
    select("rankings-scale", "data");
    select("traffic-metric", "total_transfer_in_number_of_packets");
    select("traffic-preload", "true");
    select("versions-benchmark", "time_remote_slicing");
    expect(el("versions-figure").querySelectorAll("svg.chart")).toHaveLength(6);
    select("versions-axis", "pkg-h5py");
    select("extrapolation-preload", "true");
    select("incremental-scale", "log");
    expect(el("incremental-figure").textContent).toContain("log scale");
  });

  it("shows the paper's view of a figure on request", () => {
    el("rankings-paper-btn").click();
    expect(el<HTMLSelectElement>("rankings-scale").value).toBe("paper");
    expect(window.location.search).toContain(`environment=${ENVIRONMENT_TIMEPOINTS["2025-09-01"]}`);
    expect(el("versions-note").hidden).toBe(false);
    expect(el("incremental-note").textContent).toContain("2026-10-07");
    el("traffic-paper-btn").click();
    expect(el<HTMLSelectElement>("traffic-metric").value).toBe("total_transfer_in_bytes");
    el("extrapolation-paper-btn").click();
    expect(el<HTMLSelectElement>("extrapolation-preload").value).toBe("false");
    el("versions-paper-btn").click();
    expect(el<HTMLSelectElement>("versions-axis").value).toBe("environment");
    expect(el("versions-note").hidden).toBe(true);
  });

  it("narrows the selection from the filters", () => {
    const all = [...document.querySelectorAll<HTMLButtonElement>(".preset-button")].find(
      (button) => button.textContent === "All results",
    );
    all?.click();
    expect(window.location.search).not.toContain("machine=");

    const from = el<HTMLInputElement>("filter-from");
    from.value = "2026-10-01";
    from.dispatchEvent(new Event("change"));
    expect(window.location.search).toContain("from=2026-10-01");
    const to = el<HTMLInputElement>("filter-to");
    to.value = "2026-12-31";
    to.dispatchEvent(new Event("change"));
    expect(window.location.search).toContain("to=2026-12-31");
    const exclusions = el<HTMLInputElement>("filter-exclusions");
    exclusions.checked = false;
    exclusions.dispatchEvent(new Event("change"));
    expect(window.location.search).toContain("exclusions=off");
    expect(el("filter-exclusions-label").textContent).toBe("Leave out the 7 curated outlier samples");
  });

  it("narrows and reopens a facet", () => {
    const facet = document.querySelector<HTMLDetailsElement>(
      "details.facet[data-facet='machine']",
    ) as HTMLDetailsElement;
    facet.open = true;
    facet.dispatchEvent(new Event("toggle"));
    const firstBox = facet.querySelector<HTMLInputElement>("input[type='checkbox']") as HTMLInputElement;
    firstBox.checked = false;
    firstBox.dispatchEvent(new Event("change"));
    const reopened = document.querySelector<HTMLDetailsElement>(
      "details.facet[data-facet='machine']",
    ) as HTMLDetailsElement;
    expect(reopened.open).toBe(true);
    expect(reopened.querySelector(".facet-count")?.textContent).toMatch(/^\d+ of \d+$/);
    reopened.querySelector<HTMLButtonElement>(".facet-only")?.click();
    expect(new URLSearchParams(window.location.search).getAll("machine")).toHaveLength(1);
    document.querySelector<HTMLButtonElement>("details.facet[data-facet='machine'] .facet-all")?.click();
    expect(window.location.search).not.toContain("machine=");
    const closing = document.querySelector<HTMLDetailsElement>(
      "details.facet[data-facet='machine']",
    ) as HTMLDetailsElement;
    closing.open = false;
    closing.dispatchEvent(new Event("toggle"));

    const more = document.querySelector<HTMLDetailsElement>("details.facet-more") as HTMLDetailsElement;
    more.open = true;
    more.dispatchEvent(new Event("toggle"));
    more.querySelector<HTMLButtonElement>("details.facet[data-facet='pkg-h5py'] .facet-only")?.click();
    expect(document.querySelector("details.facet-more summary")?.textContent).toContain("(1 narrowed)");
  });

  it("saves a figure's table and drawing", () => {
    [...document.querySelectorAll<HTMLButtonElement>(".preset-button")]
      .find((button) => button.textContent?.includes("all reference"))
      ?.click();
    const createObjectURL = vi.fn(() => "blob:x");
    vi.stubGlobal("URL", Object.assign(URL, { createObjectURL, revokeObjectURL: vi.fn() }));
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    el("rankings-csv-btn").click();
    el("traffic-svg-btn").click();
    expect(click).toHaveBeenCalledTimes(2);
    click.mockRestore();
  });

  it("redraws a figure when its width changes", () => {
    const observer = resizeObservers.instances[0] as unknown as { callback: ResizeObserverCallback };
    const figure = el("rankings-figure");
    const before = figure.querySelector("svg");
    observer.callback(
      [{ target: figure, contentRect: { width: 500 } } as unknown as ResizeObserverEntry],
      observer as never,
    );
    observer.callback(
      [{ target: figure, contentRect: { width: 500 } } as unknown as ResizeObserverEntry],
      observer as never,
    );
    expect(figure.querySelector("svg")).toBe(before);
    observer.callback(
      [{ target: figure, contentRect: { width: 640 } } as unknown as ResizeObserverEntry],
      observer as never,
    );
    expect(figure.querySelector("svg")).not.toBe(before);
  });

  it("goes back to the loading card to change the source, and loads again", async () => {
    el("change-source-btn").click();
    expect(el("dashboard").hidden).toBe(true);
    expect(el("load-card").hidden).toBe(false);
    expect(el("retry-load-btn").textContent).toBe("Download the latest results");
    el("retry-load-btn").click();
    await dashboardShown();
  });

  it("flips the theme from the header toggle and remembers the choice", () => {
    el("theme-toggle").click();
    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(localStorage.getItem(THEME_KEY)).toBe("dark");
    el("theme-toggle").click();
    expect(document.documentElement.dataset.theme).toBe("light");
  });

  it("still flips the theme when storage refuses the write, and warns rather than throws", () => {
    const restoreStorage = throwingStorage();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      el("theme-toggle").click();
      expect(document.documentElement.dataset.theme).toBe("dark");
      expect(warn).toHaveBeenCalledWith("Could not save theme preference:", expect.any(Error));
    } finally {
      restoreStorage();
      warn.mockRestore();
    }
  });

  it("renders the changelog into the What's New modal and opens it from the footer", async () => {
    const changelog = readFileSync(resolve(process.cwd(), "CHANGELOG.md"), "utf-8");
    expect(el("whats-new-content").querySelectorAll(".changelog-version").length).toBe(
      Math.min(countChangelogVersions(changelog), WHATS_NEW_RECENT_VERSIONS),
    );
    const modal = el<HTMLDialogElement>("whats-new-modal");
    el("whats-new-button").click();
    expect(modal.open).toBe(true);
    expect(window.location.hash).toBe("#changelog");
    el("whats-new-close").click();
    await vi.waitFor(() => expect(window.location.hash).toBe(""));
  });
});
