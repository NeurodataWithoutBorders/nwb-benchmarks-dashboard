// @vitest-environment jsdom
// Boots the real src/main.ts against the real index.html markup, serving the parity fixture as the
// published bundle, and drives the dashboard and the shell end to end. Besides covering main.ts's
// wiring, this guards the index.html/elements.ts id contract: getShell() and getElements() throw
// on import if any registered id is missing from the page.
import { installObserverStub, routeFetch, throwingStorage } from "@brain-bbqs/test-utils/vitest";
import Plotly from "plotly.js-cartesian-dist-min";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { RESULTS_BUNDLE_URL } from "../../src/lib/bundle";
import { MANUSCRIPT_DESCRIPTION } from "../../src/lib/filters";
import { THEME_KEY } from "../../src/lib/settings";
import { bootMain, dashboardShown, el, publishedBundleFetch, search } from "./helpers/mainHarness";
import { lastPlot, plotCount } from "./helpers/plotly";

let resizeObservers: ReturnType<typeof installObserverStub>;
let fetched: ReturnType<typeof publishedBundleFetch>;

beforeAll(async () => {
  fetched = publishedBundleFetch();
  await bootMain({
    fetch: fetched,
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

function annotations(id: string): string[] {
  return ((lastPlot(el(id))?.layout.annotations ?? []) as { text: string }[]).map((annotation) => annotation.text);
}

function totals(): Record<string, string> {
  return Object.fromEntries(
    [...el<HTMLTableElement>("summary-totals").rows].map((row) => [
      row.cells[0].textContent ?? "",
      row.cells[1].textContent ?? "",
    ]),
  );
}

describe("main.ts boot", () => {
  it("renders the shell, and the dashboard in place of the loading card", () => {
    expect(el("version-indicator").textContent).toMatch(/^v\d+\.\d+\.\d+$/);
    expect(el("load-card").hidden).toBe(true);
    expect(fetched.calls[0].init?.cache).toBeUndefined();
  });

  it("totals every record, with the date of the latest", () => {
    expect(Object.keys(totals())).toEqual(["Records", "Machines", "Environments", "Benchmarks", "Test cases"]);
    expect(Number(totals().Records)).toBeGreaterThan(10);
    expect(el("summary-updated").textContent).toMatch(/^Last updated \d{4}-\d{2}-\d{2}$/);
    expect(el("summary-note").hidden).toBe(true);
    expect(window.location.search).toBe("");
  });

  it("draws every figure with Plotly, unlettered outside the manuscript view", () => {
    expect(lastPlot(el("rankings-plot"))?.data.filter((trace) => trace.type === "heatmap")).toHaveLength(4);
    expect(lastPlot(el("traffic-plot"))?.config.modeBarButtonsToRemove).toEqual(["toImage", "sendChartToCloud"]);
    for (const id of ["rankings", "traffic", "versions", "incremental"]) {
      expect(el(`${id}-note`).hidden).toBe(true);
      expect(annotations(`${id}-plot`)).not.toContain("<b>a)</b>");
    }
  });

  it("redraws a figure for its own controls", () => {
    const before = plotCount(el("versions-plot"));
    select("rankings-scale", "data");
    select("traffic-metric", "total_transfer_in_number_of_packets");
    select("traffic-preload", "true");
    select("versions-benchmark", "time_remote_slicing");
    expect(plotCount(el("versions-plot"))).toBe(before + 1);
    select("versions-axis", "pkg-h5py");
    select("incremental-scale", "log");
    expect((lastPlot(el("incremental-plot"))?.layout.yaxis as { type: string }).type).toBe("log");
  });

  it("narrows the results from the search, and says what it could not use", () => {
    search("environment:2026-10-07 machin:");
    expect(window.location.search).toBe("?q=environment%3A2026-10-07+machin%3A");
    el("search-input").dispatchEvent(new Event("focus"));
    expect(document.querySelector(".search-note")?.textContent).toBe(
      "There is no machin: filter. Did you mean machine:?",
    );
    expect(totals().Environments).toBe("1");
    // One environment is nothing to compare across.
    expect(el("versions-note").textContent).toContain("widen the search to compare several");

    search("machine:nobody");
    expect(el("rankings-note").textContent).toContain("No remote file-opening or slicing results match the search.");
    expect(el("traffic-note").textContent).toContain("No pairs of network-tracking and timing results");
    expect(el("incremental-note").textContent).toContain("No incremental slicing results");
    expect(el<HTMLButtonElement>("rankings-csv-btn").disabled).toBe(true);
    expect(annotations("versions-plot")).toEqual(["No PyNWB timing results match the search."]);

    search("");
    expect(window.location.search).toBe("");
  });

  it("shows the manuscript figures from the header's toggle, and leaves them for any search", () => {
    const toggle = el("manuscript-toggle");
    toggle.click();
    expect(window.location.search).toBe("?manuscript");
    expect(toggle.getAttribute("aria-pressed")).toBe("true");
    expect(toggle.title).toContain(MANUSCRIPT_DESCRIPTION);
    expect(el<HTMLInputElement>("search-input").value).toBe("");
    expect(el<HTMLInputElement>("search-input").placeholder).toMatch(/^Showing the manuscript's figures/);
    expect(el<HTMLSelectElement>("rankings-scale").value).toBe("paper");
    expect(el<HTMLSelectElement>("traffic-metric").value).toBe("total_transfer_in_bytes");
    expect(el<HTMLSelectElement>("versions-axis").value).toBe("environment");
    expect(annotations("rankings-plot")).toContain("<b>a)</b>");
    // The comparison across versions takes the dated environments, so it has several to compare.
    expect(el("versions-note").hidden).toBe(true);

    toggle.click();
    expect(window.location.search).toBe("");
    expect(toggle.getAttribute("aria-pressed")).toBe("false");
    expect(toggle.title).toBe("Show the manuscript's figures");
    expect(annotations("rankings-plot")).not.toContain("<b>a)</b>");

    toggle.click();
    search("pynwb:3");
    expect(window.location.search).toBe("?q=pynwb%3A3");
    expect(toggle.getAttribute("aria-pressed")).toBe("false");
    search("");
  });

  it("switches a figure between its plot and its table, and saves the table", () => {
    el<HTMLInputElement>("rankings-view-table").click();
    expect(el("rankings-plot").hidden).toBe(true);
    expect(el("rankings-table-view").hidden).toBe(false);
    expect(el("rankings-table").querySelectorAll("tbody tr").length).toBeGreaterThan(0);
    const drawn = plotCount(el("rankings-plot"));
    select("rankings-scale", "paper");
    // A hidden plot is not drawn again until it is shown.
    expect(plotCount(el("rankings-plot"))).toBe(drawn);

    const createObjectURL = vi.fn(() => "blob:x");
    vi.stubGlobal("URL", Object.assign(URL, { createObjectURL, revokeObjectURL: vi.fn() }));
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    el("rankings-csv-btn").click();
    expect(click).toHaveBeenCalledTimes(1);
    click.mockRestore();

    el<HTMLInputElement>("rankings-view-plot").click();
    expect(el("rankings-plot").hidden).toBe(false);
    expect(el("rankings-table-view").hidden).toBe(true);
    expect(plotCount(el("rankings-plot"))).toBe(drawn + 1);
  });

  it("redraws a figure when its width changes", () => {
    const observer = resizeObservers.instances[0] as unknown as { callback: ResizeObserverCallback };
    const plot = el("rankings-plot");
    const resize = (width: number): void =>
      observer.callback(
        [{ target: plot, contentRect: { width } } as unknown as ResizeObserverEntry],
        observer as never,
      );
    resize(500);
    const before = plotCount(plot);
    resize(500);
    resize(0);
    expect(plotCount(plot)).toBe(before);
    resize(640);
    expect(plotCount(plot)).toBe(before + 1);
  });

  it("says so in place of a figure that cannot be drawn", () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.mocked(Plotly.react).mockImplementationOnce(() => {
      throw new Error("no room");
    });
    select("incremental-scale", "linear");
    expect(el("incremental-note").textContent).toBe("This figure could not be drawn: no room");
    expect(Plotly.purge).toHaveBeenCalledWith(el("incremental-plot"));
    error.mockRestore();
  });

  it("downloads the results again in place from the refresh button", async () => {
    const button = el<HTMLButtonElement>("refresh-btn");
    button.click();
    expect(button.disabled).toBe(true);
    expect(button.getAttribute("aria-busy")).toBe("true");
    await vi.waitFor(() => expect(button.disabled).toBe(false));
    expect(fetched.calls.at(-1)?.init?.cache).toBe("no-cache");
    expect(el("load-card").hidden).toBe(true);
    expect(el("summary-note").hidden).toBe(true);

    vi.stubGlobal("fetch", routeFetch([]));
    button.click();
    await vi.waitFor(() => expect(button.disabled).toBe(false));
    expect(el("summary-note").textContent).toBe(
      "The results could not be refreshed: The results server could not be reached. Check the connection and try again.",
    );
    vi.stubGlobal(
      "fetch",
      routeFetch([
        { match: RESULTS_BUNDLE_URL, respond: () => new Response("{}", { status: 503, statusText: "Busy" }) },
      ]),
    );
    button.click();
    await vi.waitFor(() => expect(el("summary-note").textContent).toContain("answered 503 Busy"));
    vi.stubGlobal("fetch", fetched);
  });

  it("redraws the figures in the new theme's colors", async () => {
    const before = plotCount(el("traffic-plot"));
    el("theme-toggle").click();
    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(localStorage.getItem(THEME_KEY)).toBe("dark");
    await vi.waitFor(() => expect(plotCount(el("traffic-plot"))).toBe(before + 1));
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

  it("carries only the version stamp and the CON mark in its footer, and no BBQS mark", () => {
    const footer = document.querySelector(".page-footer-bar") as HTMLElement;
    expect([...footer.querySelectorAll("a")].map((link) => link.getAttribute("href"))).toEqual([
      "https://github.com/brain-bbqs/nwb-benchmarks-dashboard",
      "https://centerforopenneuroscience.org",
    ]);
    expect(document.querySelector('a[href*="brain-bbqs.org"]')).toBeNull();
    expect(document.querySelector("dialog")).toBeNull();
  });
});
