// Each figure's Plotly spec, built from the synthesized bundle: its panels, traces, legend entries and
// table rows. How Plotly draws a spec is the Chromatic snapshots' to check.
import { describe, expect, it } from "vitest";
import { readDatabase } from "../../src/lib/database";
import { ALL_DATA, applyFilters } from "../../src/lib/filters";
import { incrementalSlicing } from "../../src/lib/figures/incremental";
import { methodRankings } from "../../src/lib/figures/rankings";
import { fileOpenTraffic, slicingTraffic } from "../../src/lib/figures/traffic";
import { performanceAcrossVersions } from "../../src/lib/figures/versions";
import { synthesizeMockBundle } from "../../src/lib/mockBundle";
import type { FigureOptions, FigureSpec, Trace } from "../../src/ui/charts/plot";
import type { ChartTheme } from "../../src/ui/charts/theme";
import { INCREMENTAL_COLUMNS, incrementalFigure, incrementalRows } from "../../src/ui/figures/incremental";
import { RANKINGS_COLUMNS, heatMax, rankingsFigure, rankingsRows } from "../../src/ui/figures/rankings";
import { TRAFFIC_COLUMNS, trafficFigure, trafficRows } from "../../src/ui/figures/traffic";
import { VERSIONS_COLUMNS, versionsFigure, versionsRows } from "../../src/ui/figures/versions";

const dataset = applyFilters(readDatabase(synthesizeMockBundle()), ALL_DATA);
const empty = applyFilters(readDatabase(synthesizeMockBundle()), { ...ALL_DATA, selected: { machine: ["nobody"] } });

const theme: ChartTheme = {
  text: "rgb(1, 1, 1)",
  muted: "rgb(2, 2, 2)",
  surface: "rgb(255, 255, 255)",
  border: "rgb(3, 3, 3)",
  grid: "rgb(4, 4, 4)",
  frame: "rgb(5, 5, 5)",
  guide: "rgb(6, 6, 6)",
  accent: "rgb(7, 7, 7)",
  font: "sans-serif",
  heat: ["rgb(0, 0, 0)", "rgb(1, 0, 0)", "rgb(2, 0, 0)", "rgb(3, 0, 0)", "rgb(4, 0, 0)"],
  color: (expression) => (expression.startsWith("var(") ? "rgb(9, 9, 9)" : expression),
};

const wide: FigureOptions = { width: 1100, theme, letters: false };
const narrow: FigureOptions = { width: 360, theme, letters: true };

function annotationTexts(spec: FigureSpec): string[] {
  return (spec.layout.annotations as { text: string }[]).map((annotation) => annotation.text);
}

function ofType(spec: FigureSpec, type: string): Trace[] {
  return spec.data.filter((trace) => trace.type === type);
}

function legendNames(spec: FigureSpec): string[] {
  return spec.data.filter((trace) => trace.showlegend !== false && trace.name).map((trace) => trace.name as string);
}

describe("rankings", () => {
  const panels = methodRankings(dataset);

  it("draws one heatmap per task, starring the fastest method of each modality", () => {
    const spec = rankingsFigure(panels, "paper", wide);
    const heatmaps = ofType(spec, "heatmap");
    expect(heatmaps).toHaveLength(4);
    // The fastest cell of each modality is outlined and badged with a star, its value left as it is.
    expect(annotationTexts(spec).filter((text) => text === "★")).toHaveLength(12);
    expect(spec.layout.shapes).toHaveLength(12);
    expect(heatmaps.flatMap((heatmap) => (heatmap.text as string[][]).flat()).some((text) => text.includes("★"))).toBe(
      false,
    );
    // Each heatmap's color scale stands upright beside it.
    expect((heatmaps[0].colorbar as { orientation?: string; xanchor: string }).orientation).toBeUndefined();
    expect((heatmaps[0].colorbar as { xanchor: string }).xanchor).toBe("left");
    expect(heatmaps[1].zmax).toBe(200);
    expect(annotationTexts(spec)).toContain("<b>Remote File Opening</b>");
    expect(annotationTexts(spec).some((text) => text.includes("a)"))).toBe(false);
    expect((heatmaps[0].customdata as string[][])[0][0]).toContain("standard deviation");
    expect(spec.layout.xaxis2).toBeDefined();
    const rows = rankingsRows(panels);
    expect(rows).toHaveLength(120);
    expect(RANKINGS_COLUMNS.map((column) => column.value(rows[0]))).toContain("HDF5 remfile");
  });

  it("letters panels in the manuscript view, and fits narrow ones", () => {
    const narrowSpec = rankingsFigure(panels, "paper", narrow);
    // No room for a badge beside a narrow cell's value: the star goes before it instead.
    expect(annotationTexts(narrowSpec).filter((text) => text === "★")).toHaveLength(0);
    const starred = ofType(narrowSpec, "heatmap").flatMap((heatmap) => (heatmap.text as string[][]).flat());
    expect(starred.filter((text) => text.startsWith("★ "))).toHaveLength(12);
    const spec = rankingsFigure(methodRankings(empty), "data", narrow);
    expect(annotationTexts(spec)).toContain("<b>a)</b>");
    const [first] = ofType(spec, "heatmap");
    expect((first.textfont as { size: number }).size).toBe(9);
    expect((first.z as (number | null)[][]).flat().every((value) => value === null)).toBe(true);
    expect((first.colorbar as { thickness: number }).thickness).toBe(8);
  });

  it("scales to the paper's ranges or to the data", () => {
    expect(heatMax(panels[1], "paper")).toBe(200);
    expect(heatMax(panels[1], "data")).toBeGreaterThan(500);
    expect(heatMax(methodRankings(empty)[0], "data")).toBe(1);
  });
});

describe("traffic", () => {
  it("draws the file-open scatters and the slicing trajectories, with an inset for zero traffic", () => {
    const fileOpen = [fileOpenTraffic(dataset, "backend"), fileOpenTraffic(dataset, "pynwb")];
    const slicing = slicingTraffic(dataset, true);
    const spec = trafficFigure(fileOpen, slicing, wide);
    const texts = annotationTexts(spec);
    expect(texts).toContain("no traffic measured");
    expect(texts.some((text) => text.endsWith("MB/s"))).toBe(true);
    expect(spec.layout.xaxis6).toBeDefined();
    // Every method appears once in the legend, and the file-opening panels' modality markers after them.
    const names = legendNames(spec);
    expect(new Set(names).size).toBe(names.length);
    expect(names.slice(-3)).toEqual(["Ecephys (file opening)", "Ophys (file opening)", "Icephys (file opening)"]);
    const hover = spec.data.flatMap((trace) => (trace.customdata as string[] | undefined) ?? []);
    expect(hover.some((text) => text.includes("effective throughput"))).toBe(true);
    const rows = trafficRows(fileOpen, slicing);
    expect(rows.length).toBeGreaterThan(100);
    expect(TRAFFIC_COLUMNS.map((column) => column.value(rows[rows.length - 1]))[0]).toBe("Remote slicing - preloaded");
    expect(texts).not.toContain("<b>a)</b>");
    expect(annotationTexts(trafficFigure(fileOpen, slicing, narrow))).toContain("<b>a)</b>");
  });

  it("stands the legend beside the panels where there is room, and under them where there is not", () => {
    const fileOpen = [fileOpenTraffic(dataset, "backend")];
    const slicing = slicingTraffic(dataset, true);
    const beside = trafficFigure(fileOpen, slicing, wide).layout;
    expect(beside.legend).toMatchObject({ orientation: "v", xanchor: "left", y: 0.5, yanchor: "middle" });
    expect((beside.margin as { r: number }).r).toBeGreaterThan(150);
    const under = trafficFigure(fileOpen, slicing, narrow).layout;
    expect(under.legend).toMatchObject({ orientation: "h", y: 0, yanchor: "top" });
    expect((under.margin as { r: number }).r).toBe(0);
  });

  it("marks panels without data, and a metric that is not bytes draws no throughput lines", () => {
    const blank = trafficFigure([fileOpenTraffic(empty, "backend")], slicingTraffic(empty, false), wide);
    expect(annotationTexts(blank).filter((text) => text === "No data")).toHaveLength(4);
    const packets = "total_transfer_in_number_of_packets";
    const spec = trafficFigure(
      [fileOpenTraffic(dataset, "backend", packets)],
      slicingTraffic(dataset, false, packets),
      wide,
    );
    expect(annotationTexts(spec).some((text) => text.endsWith("MB/s"))).toBe(false);
    expect(trafficRows([fileOpenTraffic(dataset, "backend")], slicingTraffic(dataset, false))[0].panel).toBe(
      "Remote File Opening",
    );
  });

  it("names a panel whose slicing moved no traffic at all", () => {
    const slicing = slicingTraffic(dataset, true);
    const onlyZero = { ...slicing, panels: [{ ...slicing.panels[0], points: [] }] };
    expect(annotationTexts(trafficFigure([], onlyZero, wide))).toContain("No traffic measured");
  });
});

describe("versions", () => {
  it("draws one point plot per modality and preload state, with intervals", () => {
    const figure = performanceAcrossVersions(dataset, "time_remote_slicing");
    const spec = versionsFigure(figure, "Software environment", wide);
    expect(annotationTexts(spec)).toHaveLength(6);
    expect(spec.data.every((trace) => (trace.error_y as { array: number[] }).array.length > 0)).toBe(true);
    expect(legendNames(spec)).toHaveLength(10);
    const rows = versionsRows(figure);
    expect(VERSIONS_COLUMNS.map((column) => column.value(rows[0]))).toHaveLength(VERSIONS_COLUMNS.length);
  });

  it("slants group labels too long for a narrow panel", () => {
    const environments = versionsFigure(performanceAcrossVersions(dataset, "time_remote_file_reading"), "x", {
      ...narrow,
      width: 200,
    });
    expect((environments.layout.xaxis as { tickangle: number }).tickangle).toBe(-35);
    const versions = versionsFigure(
      performanceAcrossVersions(dataset, "time_remote_file_reading", "pkg-h5py"),
      "h5py version",
      wide,
    );
    expect((versions.layout.xaxis as { tickangle: number }).tickangle).toBe(0);
  });
});

describe("incremental", () => {
  const panels = incrementalSlicing(dataset);

  it("draws linear and log panels with bands and crosses", () => {
    const linear = incrementalFigure(panels, "linear", wide);
    expect(linear.data.some((trace) => trace.fill === "tonexty")).toBe(true);
    expect(legendNames(linear)).toContain("HDF5 download + local");
    expect((linear.layout.xaxis3 as { title: { text: string } }).title.text).toBe("Number of TimeSeries read");
    const log = incrementalFigure(panels, "log", narrow);
    expect((log.layout.yaxis as { type: string; title: { text: string } }).title.text).toBe(
      "Cumulative time (s, log scale)",
    );
    expect(annotationTexts(log)).toContain("<b>a)</b>");
    const rows = incrementalRows(panels);
    expect(INCREMENTAL_COLUMNS.map((column) => column.value(rows[0]))).toHaveLength(INCREMENTAL_COLUMNS.length);
  });

  it("leaves values a logarithmic axis cannot show out of the line", () => {
    const zero = panels.map((panel) => ({
      ...panel,
      curves: panel.curves.map((curve) => ({
        ...curve,
        points: curve.points.map((point, at) => (at === 0 ? { ...point, median: 0, min: 0 } : point)),
      })),
    }));
    const spec = incrementalFigure(zero, "log", wide);
    expect(spec.data.some((trace) => (trace.y as (number | null)[])[0] === null)).toBe(true);
  });
});
