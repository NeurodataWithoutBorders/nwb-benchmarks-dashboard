// Every figure's numbers against what nwb-benchmarks' own Python figure code computes from the same
// data (tests/fixtures/parity-expected.json, written by tests/parity/generate_expected.py).
import { describe, expect, it } from "vitest";
import { benchmarkNameParts, modalityOf, scalingValueOf } from "../../src/lib/benchmarkNames";
import { LBL_MAC_MACHINE_IDS, PAPER_EXCLUDE_OLDER } from "../../src/lib/curation";
import { readDatabase } from "../../src/lib/database";
import { MANUSCRIPT_SELECTIONS, applyFilters, type FilterState } from "../../src/lib/filters";
import { incrementalOverview, incrementalSlicing } from "../../src/lib/figures/incremental";
import { methodRankings } from "../../src/lib/figures/rankings";
import { fileOpenTraffic, slicingTraffic, type TrafficPoint } from "../../src/lib/figures/traffic";
import { performanceAcrossVersions, type VersionsBenchmark } from "../../src/lib/figures/versions";
import { methodLabel } from "../../src/lib/methods";
import type { Summary } from "../../src/lib/stats";
import { close, readExpected, readParityBundle, type ExpectedRow } from "./helpers/parity";

const expected = readExpected();
const db = readDatabase(readParityBundle());

function paperState(environmentIds: string[]): FilterState {
  return {
    from: PAPER_EXCLUDE_OLDER,
    to: null,
    applyExclusions: true,
    selected: { machine: LBL_MAC_MACHINE_IDS, environment: environmentIds },
  };
}

function expectSummary(actual: Summary, row: ExpectedRow, prefix = ""): void {
  for (const stat of ["mean", "median", "std", "min", "max"] as const) {
    const key = `${prefix}${stat}`;
    if (!(key in row)) continue;
    expect(close(actual[stat], row[key]), `${key}: ${actual[stat]} vs ${String(row[key])}`).toBe(true);
  }
  expect(actual.n).toBe(row[`${prefix}n`]);
}

describe("benchmark name derivation, for every name in the published results", () => {
  it.each(expected.derived_names.benchmarks.map((row) => [row.benchmark_name as string, row]))("%s", (name, row) => {
    const parts = benchmarkNameParts(name);
    expect({
      type: parts.type,
      test: parts.test,
      operation: parts.operation,
      label: parts.label,
      clean: parts.clean,
      isPreloaded: parts.isPreloaded,
      isLocal: parts.isLocal,
    }).toEqual({
      type: row.benchmark_name_type,
      test: row.benchmark_name_test,
      operation: row.benchmark_name_operation,
      label: row.benchmark_name_label,
      clean: row.benchmark_name_clean,
      isPreloaded: row.is_preloaded,
      isLocal: row.is_local,
    });
  });

  it("reads every parameter case's modality and slice size the same way", () => {
    for (const row of expected.derived_names.modalities) {
      expect(modalityOf(row.parameter_case_name as string)).toBe(row.modality);
    }
    for (const row of expected.derived_names.scaling) {
      const sliceRange = row.first_slice === null ? undefined : [row.first_slice as string];
      expect(scalingValueOf(sliceRange ? { slice_range: sliceRange } : {})).toBe(row.scaling_value);
    }
  });
});

describe("the manuscript view", () => {
  it("selects what the Python pipeline selects for its reference environment", () => {
    expect(MANUSCRIPT_SELECTIONS.reference).toEqual(paperState([expected.contexts["2025-09-01"].environment_id]));
  });
});

describe.each(Object.entries(expected.contexts))("the %s environment", (_label, context) => {
  const dataset = applyFilters(db, paperState([context.environment_id]));

  it("matches Figure 3's heatmap cells", () => {
    const panels = methodRankings(dataset);
    for (const panel of panels) {
      const rows = context.heatmap[panel.id];
      const filled = panel.cells.flat().filter((cell) => cell !== null).length;
      expect(filled).toBe(rows.length);
      for (const row of rows) {
        const cell =
          panel.cells[panel.methods.indexOf(row.benchmark_name_clean as string)][
            panel.modalities.indexOf(row.modality as never)
          ];
        expect(cell, `${panel.id} ${String(row.benchmark_name_clean)} ${String(row.modality)}`).not.toBeNull();
        expectSummary(cell as Summary, row);
      }
    }
  });

  function expectTraffic(points: TrafficPoint[], rows: ExpectedRow[]): void {
    expect(points.length).toBe(rows.length);
    for (const row of rows) {
      const point = points.find(
        (candidate) =>
          candidate.method === row.benchmark_name_clean &&
          candidate.modality === row.modality &&
          (row.slice_number === undefined || candidate.sliceNumber === row.slice_number),
      );
      expect(point, JSON.stringify(row)).toBeDefined();
      expectSummary((point as TrafficPoint).runtime, row, "runtime_");
      expectSummary((point as TrafficPoint).network, row, "network_");
    }
  }

  it("matches Figure 5a and 5b's file-open traffic and runtime", () => {
    expectTraffic(fileOpenTraffic(dataset, "backend").points, context.file_open_network.backend);
    expectTraffic(fileOpenTraffic(dataset, "pynwb").points, context.file_open_network.pynwb);
  });

  it.each([
    [false, "not_preloaded"],
    [true, "preloaded"],
  ] as const)("matches Figure 5c to 5e's slicing trajectories (preloaded: %s)", (preloaded, key) => {
    const traffic = slicingTraffic(dataset, preloaded);
    const points = traffic.panels.flatMap((panel) => [...panel.points, ...panel.zeroTraffic]);
    expectTraffic(points, context.slicing_network[key]);
  });

  it("matches the incremental slicing curves and overview", () => {
    const panels = incrementalSlicing(dataset);
    const overview = incrementalOverview(panels);
    expect(overview.length).toBe(context.incremental_overview.length);
    const rounded = (actual: number, value: unknown): boolean =>
      value === null ? Number.isNaN(actual) : Math.abs(actual - (value as number)) <= 0.0005 + 1e-9;
    for (const row of context.incremental_overview) {
      const line = overview.find((candidate) => candidate.modality === row.modality && candidate.label === row.method);
      expect(line, JSON.stringify(row)).toBeDefined();
      if (!line) continue;
      expect(line.method).toBe(row.benchmark_name_clean);
      expect(line.accessMode).toBe(row.access_mode);
      expect(line.formatFamily).toBe(row.format);
      expect(line.runs).toBe(row.n_runs);
      expect(line.slices).toBe(row.n_slices);
      expect(line.crossover).toBe(row.crossover_slice_index);
      expect(rounded(line.downloadTime, row.download_time_s)).toBe(true);
      expect(rounded(line.openTime, row.open_time_s)).toBe(true);
      expect(rounded(line.meanTimePerSlice, row.mean_time_per_slice_s)).toBe(true);
      expect(rounded(line.totalTime, row.total_time_s)).toBe(true);
    }
    for (const panel of panels) {
      const table = context.incremental_curves[panel.modality];
      for (const curve of panel.curves) {
        for (const point of curve.points) {
          const row = table.find((candidate) => candidate.slice_index === point.sliceIndex) as ExpectedRow;
          expect(rounded(point.median, row[`${curve.label} (s)`])).toBe(true);
          if (`${curve.label} min (s)` in row) {
            expect(rounded(point.min, row[`${curve.label} min (s)`])).toBe(true);
            expect(rounded(point.max, row[`${curve.label} max (s)`])).toBe(true);
          }
        }
      }
    }
  });
});

describe.each(Object.entries(expected.performance_over_time))("Figure 4b, %s", (benchmark, rows) => {
  it("matches every environment's mean, per method and modality", () => {
    const dataset = applyFilters(db, MANUSCRIPT_SELECTIONS.timepoints);
    const figure = performanceAcrossVersions(dataset, benchmark as VersionsBenchmark);
    const points = figure.panels.flatMap((panel) =>
      panel.series.flatMap((series) =>
        series.points.map((point) => ({
          modality: panel.modality,
          preloaded: panel.preloaded,
          method: series.method,
          timepoint: figure.groups.find((group) => group.key === point.group)?.label,
          summary: point.summary,
        })),
      ),
    );
    expect(points.length).toBe(rows.length);
    for (const row of rows) {
      const point = points.find(
        (candidate) =>
          candidate.modality === row.modality &&
          candidate.method === row.benchmark_name_clean &&
          candidate.timepoint === row.environment_timepoint &&
          (row.is_preloaded === undefined || candidate.preloaded === row.is_preloaded),
      );
      expect(point, JSON.stringify(row)).toBeDefined();
      expectSummary(point?.summary as Summary, row);
    }
    expect(figure.methods.map(methodLabel).length).toBeGreaterThan(0);
  });
});
