// @vitest-environment jsdom
// Each figure drawn from the synthesized bundle: its panels, marks, legend entries and table rows.
import { beforeEach, describe, expect, it } from "vitest";
import { readDatabase } from "../../src/lib/database";
import { ALL_DATA, applyFilters } from "../../src/lib/filters";
import { extrapolations, type Extrapolation } from "../../src/lib/figures/extrapolation";
import { incrementalSlicing } from "../../src/lib/figures/incremental";
import { methodRankings } from "../../src/lib/figures/rankings";
import { fileOpenTraffic, slicingTraffic } from "../../src/lib/figures/traffic";
import { performanceAcrossVersions } from "../../src/lib/figures/versions";
import { synthesizeMockBundle } from "../../src/lib/mockBundle";
import { createTooltip } from "../../src/ui/charts/chrome";
import {
  drawnRange,
  extrapolationLegend,
  renderExtrapolation,
  uncrossed,
  EXTRAPOLATION_COLUMNS,
} from "../../src/ui/figures/extrapolation";
import {
  INCREMENTAL_COLUMNS,
  incrementalLegend,
  incrementalRows,
  renderIncremental,
} from "../../src/ui/figures/incremental";
import { RANKINGS_COLUMNS, heatFill, heatMax, rankingsRows, renderRankings } from "../../src/ui/figures/rankings";
import { TRAFFIC_COLUMNS, renderTraffic, trafficLegend, trafficRows } from "../../src/ui/figures/traffic";
import { VERSIONS_COLUMNS, renderVersions, versionsLegend, versionsRows } from "../../src/ui/figures/versions";

const dataset = applyFilters(readDatabase(synthesizeMockBundle()), ALL_DATA);
const empty = applyFilters(readDatabase(synthesizeMockBundle()), { ...ALL_DATA, selected: { machine: ["nobody"] } });
const tooltip = createTooltip(document.createElement("div"));
let target: HTMLDivElement;

beforeEach(() => {
  target = document.createElement("div");
  document.body.replaceChildren(target);
});

function hover(element: Element): void {
  element.dispatchEvent(Object.assign(new Event("pointermove"), { clientX: 1, clientY: 1 }));
}

describe("rankings", () => {
  const panels = methodRankings(dataset);

  it("draws four heatmaps with a star per modality", () => {
    renderRankings(target, panels, "paper", tooltip);
    expect(target.querySelectorAll("svg.chart")).toHaveLength(4);
    expect(target.querySelectorAll(".heat-star")).toHaveLength(12);
    expect(target.querySelectorAll(".heat-cell:not(.empty)")).toHaveLength(120);
    hover(target.querySelector(".heat-cell") as Element);
    expect(rankingsRows(panels)).toHaveLength(120);
    expect(RANKINGS_COLUMNS.map((column) => column.value(rankingsRows(panels)[0]))).toContain("HDF5 remfile");
  });

  it("compacts narrow panels and draws empty cells", () => {
    const sparse = methodRankings(empty);
    const slot = document.createElement("div");
    Object.defineProperty(HTMLElement.prototype, "clientWidth", { configurable: true, get: () => 300 });
    try {
      renderRankings(slot, sparse, "data", tooltip);
    } finally {
      Object.defineProperty(HTMLElement.prototype, "clientWidth", { configurable: true, get: () => 0 });
    }
    expect(slot.querySelector("svg")?.classList.contains("heat-compact")).toBe(true);
    expect(slot.querySelectorAll(".heat-cell.empty")).toHaveLength(30 * 4);
  });

  it("mixes its fill along the ramp and scales to the paper or the data", () => {
    expect(heatFill(0)).toBe("color-mix(in oklab, var(--heat-1) 0%, var(--heat-0))");
    expect(heatFill(2)).toBe("color-mix(in oklab, var(--heat-4) 100%, var(--heat-3))");
    expect(heatMax(panels[1], "paper")).toBe(200);
    expect(heatMax(panels[1], "data")).toBeGreaterThan(500);
    expect(heatMax(methodRankings(empty)[0], "data")).toBe(1);
  });
});

describe("traffic", () => {
  it("draws the file-open scatters and the slicing trajectories, with an inset for zero traffic", () => {
    const fileOpen = [fileOpenTraffic(dataset, "backend"), fileOpenTraffic(dataset, "pynwb")];
    const slicing = slicingTraffic(dataset, true);
    renderTraffic(target, fileOpen, slicing, tooltip);
    expect(target.querySelectorAll("svg.chart")).toHaveLength(5);
    expect(target.querySelectorAll(".chart-inset").length).toBeGreaterThan(0);
    expect(target.querySelectorAll(".guide-label").length).toBeGreaterThan(0);
    hover(target.querySelector(".chart-hit") as Element);
    const legend = trafficLegend(fileOpen, slicing);
    expect(legend.filter((entry) => entry.lineStyle === null)).toHaveLength(3);
    const rows = trafficRows(fileOpen, slicing);
    expect(rows.length).toBeGreaterThan(100);
    expect(TRAFFIC_COLUMNS.map((column) => column.value(rows[rows.length - 1]))[0]).toBe("Remote slicing - preloaded");
  });

  it("marks panels without data, and a metric that is not bytes draws no throughput lines", () => {
    renderTraffic(target, [fileOpenTraffic(empty, "backend")], slicingTraffic(empty, false), tooltip);
    expect(target.querySelectorAll(".chart-empty")).toHaveLength(4);
    renderTraffic(
      target,
      [fileOpenTraffic(dataset, "backend", "total_transfer_in_number_of_packets")],
      slicingTraffic(dataset, false, "total_transfer_in_number_of_packets"),
      tooltip,
    );
    expect(target.querySelectorAll(".guide-label")).toHaveLength(0);
    expect(trafficRows([fileOpenTraffic(dataset, "backend")], slicingTraffic(dataset, false))[0].panel).toBe(
      "Remote File Opening",
    );
  });

  it("names a panel whose slicing moved no traffic at all", () => {
    const slicing = slicingTraffic(dataset, true);
    const onlyZero = { ...slicing, panels: [{ ...slicing.panels[0], points: [] }] };
    renderTraffic(target, [], onlyZero, tooltip);
    expect(target.textContent).toContain("No traffic measured");
  });
});

describe("versions", () => {
  it("draws one point plot per modality and preload state, with intervals", () => {
    const figure = performanceAcrossVersions(dataset, "time_remote_slicing");
    renderVersions(target, figure, "Software environment", tooltip);
    expect(target.querySelectorAll("svg.chart")).toHaveLength(6);
    expect(target.querySelectorAll(".chart-errorbar").length).toBeGreaterThan(0);
    hover(target.querySelector(".chart-hit") as Element);
    expect(versionsLegend(figure)).toHaveLength(10);
    const rows = versionsRows(figure);
    expect(VERSIONS_COLUMNS.map((column) => column.value(rows[0]))).toHaveLength(VERSIONS_COLUMNS.length);
  });

  it("slants group labels too long for a narrow panel", () => {
    Object.defineProperty(HTMLElement.prototype, "clientWidth", { configurable: true, get: () => 200 });
    try {
      renderVersions(
        target,
        performanceAcrossVersions(dataset, "time_remote_file_reading"),
        "Software environment",
        tooltip,
      );
    } finally {
      Object.defineProperty(HTMLElement.prototype, "clientWidth", { configurable: true, get: () => 0 });
    }
    expect(target.querySelector("text[transform^='rotate(-35']")).not.toBeNull();
    renderVersions(
      target,
      performanceAcrossVersions(dataset, "time_remote_file_reading", "pkg-h5py"),
      "h5py version",
      tooltip,
    );
    expect(target.querySelector("text[transform^='rotate(-35']")).toBeNull();
  });

  it("marks a panel whose points carry no value", () => {
    const figure = performanceAcrossVersions(dataset, "time_remote_file_reading");
    const blank = { ...figure, panels: [{ ...figure.panels[0], series: [] }] };
    renderVersions(target, blank, "x", tooltip);
    expect(target.querySelector(".chart-empty")).not.toBeNull();
  });
});

describe("extrapolation", () => {
  const fits = extrapolations(dataset);

  it("draws a panel per modality with a cross at each crossover", () => {
    renderExtrapolation(target, fits, false, tooltip);
    const crossed = fits.filter((fit) => !fit.isPreloaded && fit.crossover);
    expect(target.querySelectorAll(".chart-cross")).toHaveLength(crossed.length);
    hover(target.querySelector(".chart-hit") as Element);
    expect(extrapolationLegend(fits, false).some((entry) => entry.label === "HDF5 download + local")).toBe(true);
    expect(EXTRAPOLATION_COLUMNS.map((column) => column.value(fits[0]))[0]).toBe(fits[0].modality);
  });

  it("lists methods without a crossover and marks panels with none", () => {
    const noCross: Extrapolation[] = fits.map((fit) => ({ ...fit, crossover: null }));
    expect(uncrossed(noCross, false).length).toBeGreaterThan(0);
    renderExtrapolation(target, noCross, false, tooltip);
    expect(target.textContent).toContain("No crossover in the positive quadrant");
    expect(EXTRAPOLATION_COLUMNS.at(-1)?.value(noCross[0])).toBe(null);
    expect(drawnRange(noCross[0])).toBe(2);
    expect(drawnRange({ ...fits[0], crossover: { x: 100, y: 1 } })).toBe(120);
  });
});

describe("incremental", () => {
  it("draws linear and log panels with bands and crosses", () => {
    const panels = incrementalSlicing(dataset);
    renderIncremental(target, panels, "linear", tooltip);
    expect(target.querySelectorAll("svg.chart")).toHaveLength(3);
    expect(target.querySelectorAll(".chart-band").length).toBeGreaterThan(0);
    renderIncremental(target, panels, "log", tooltip);
    expect(target.textContent).toContain("Cumulative time (s, log scale)");
    expect(target.textContent).toContain("Number of TimeSeries read");
    const hit = target.querySelector(".chart-hit");
    if (hit) hover(hit);
    expect(incrementalLegend(panels).map((entry) => entry.label)).toContain("HDF5 download + local");
    const rows = incrementalRows(panels);
    expect(INCREMENTAL_COLUMNS.map((column) => column.value(rows[0]))).toHaveLength(INCREMENTAL_COLUMNS.length);
  });
});
