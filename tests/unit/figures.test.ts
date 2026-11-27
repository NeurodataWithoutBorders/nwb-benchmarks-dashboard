// Edge cases of the figure computations; their numbers are checked against the Python code in
// parity.test.ts.
import { describe, expect, it } from "vitest";
import { readDatabase } from "../../src/lib/database";
import { ALL_DATA, applyFilters } from "../../src/lib/filters";
import { firstCrossover, incrementalOverview, incrementalSlicing } from "../../src/lib/figures/incremental";
import { methodRankings } from "../../src/lib/figures/rankings";
import { fileOpenTraffic, slicingTraffic } from "../../src/lib/figures/traffic";
import { performanceAcrossVersions } from "../../src/lib/figures/versions";
import { PYNWB_READ_ORDER } from "../../src/lib/methods";
import { MOCK_ENVIRONMENT_IDS, synthesizeMockBundle } from "../../src/lib/mockBundle";

const db = readDatabase(synthesizeMockBundle());
const everything = applyFilters(db, ALL_DATA);
const nothing = applyFilters(db, { ...ALL_DATA, selected: { machine: ["nobody"] } });

describe("with nothing selected", () => {
  it("every figure is empty rather than broken", () => {
    expect(methodRankings(nothing).every((panel) => panel.fastest.every((row) => row === null))).toBe(true);
    expect(fileOpenTraffic(nothing, "backend").points).toEqual([]);
    expect(slicingTraffic(nothing, false).panels.every((panel) => panel.points.length === 0)).toBe(true);
    expect(performanceAcrossVersions(nothing, "time_remote_slicing").panels).toEqual([]);
    expect(incrementalSlicing(nothing)).toEqual([]);
  });
});

describe("performanceAcrossVersions", () => {
  it("splits slicing by preload state", () => {
    const figure = performanceAcrossVersions(everything, "time_remote_slicing");
    expect(new Set(figure.panels.map((panel) => panel.preloaded))).toEqual(new Set([false, true]));
  });

  it("plots slicing at the largest slice only", () => {
    const figure = performanceAcrossVersions(everything, "time_remote_slicing");
    const points = figure.panels.flatMap((panel) => panel.series.flatMap((series) => series.points));
    // Two rounds per environment, each with one result per slice size.
    expect(new Set(points.map((point) => point.summary.n))).toEqual(new Set([2]));
  });

  it("groups by a package's version instead of the environment", () => {
    const figure = performanceAcrossVersions(everything, "time_remote_file_reading", "pkg-h5py");
    expect(figure.groups.map((group) => group.label)).toEqual(["3.14.0", "3.16.0"]);
    const python = performanceAcrossVersions(everything, "time_remote_file_reading", "python");
    expect(python.groups.map((group) => group.label)).toEqual(["3.11.7", "3.13.5"]);
    const absent = performanceAcrossVersions(everything, "time_remote_file_reading", "pkg-boto3");
    expect(absent.groups.map((group) => group.label)).toEqual(["not installed"]);
  });

  it("labels an environment without a file", () => {
    const bundle = synthesizeMockBundle();
    for (const key of Object.keys(bundle)) if (key.startsWith("environments/")) delete bundle[key];
    const bare = applyFilters(readDatabase(bundle), ALL_DATA);
    expect(performanceAcrossVersions(bare, "time_remote_file_reading", "pkg-h5py").groups[0].label).toBe("unknown");
    expect(performanceAcrossVersions(bare, "time_remote_file_reading").groups[0].label).toMatch(
      /^2026-01-\d\d \(test-a-\)$/,
    );
  });
});

describe("the change from each group to the next", () => {
  const timeName = (method: string): string =>
    `time_remote_file_reading.HDF5PyNWBFileReadBenchmark.time_read_${method.replaceAll(" ", "_")}`;

  it("compares every method, the largest change first, with the network traffic beside it", () => {
    const { changes } = performanceAcrossVersions(everything, "time_remote_file_reading");
    expect(changes).toHaveLength(PYNWB_READ_ORDER.length * 3);
    expect(changes.every((change) => change.from === MOCK_ENVIRONMENT_IDS[0])).toBe(true);
    const sizes = changes.map((change) => Math.abs(Math.log2(change.foldChange)));
    expect(sizes).toEqual([...sizes].sort((a, b) => b - a));
    // The mock's fsspec S3 methods regress threefold in its second environment.
    expect(changes.slice(0, 6).every((change) => change.method.includes("fsspec s3"))).toBe(true);
    expect(changes[0].foldChange).toBeCloseTo(3, 0);
    expect(changes[0].percentChange).toBeCloseTo(100 * (changes[0].foldChange - 1), 6);
    expect(changes[0].after.network.amount_downloaded_in_bytes).toBeGreaterThan(0);
    expect(changes[0].networkPercentChange.amount_downloaded_in_bytes).not.toBeNull();
  });

  it("says nothing of a change in traffic where the earlier side measured none", () => {
    const { changes } = performanceAcrossVersions(everything, "time_remote_slicing");
    const cached = changes.find((change) => change.preloaded && change.method === "hdf5 pynwb remfile with cache");
    expect(cached?.before.network.amount_downloaded_in_bytes).toBe(0);
    expect(cached?.networkPercentChange.amount_downloaded_in_bytes).toBeNull();
  });

  it("skips a method missing from one side, and lists cached reads last, unmeasurable ones at the end", () => {
    const bundle = synthesizeMockBundle();
    for (const [key, file] of Object.entries(bundle)) {
      if (!key.startsWith("results/")) continue;
      const { environment_id: environmentId, results } = file as {
        environment_id: string;
        results: Record<string, Record<string, number[]>>;
      };
      if (environmentId === MOCK_ENVIRONMENT_IDS[1]) delete results[timeName("hdf5 pynwb remfile no cache")];
      for (const values of Object.values(results[timeName("hdf5 pynwb remfile with cache")] ?? {})) values.fill(0.001);
      for (const values of Object.values(results[timeName("hdf5 pynwb ros3")] ?? {})) values.fill(0);
    }
    const { changes } = performanceAcrossVersions(
      applyFilters(readDatabase(bundle), ALL_DATA),
      "time_remote_file_reading",
    );
    expect(changes.some((change) => change.method === "hdf5 pynwb remfile no cache")).toBe(false);
    const last = changes.slice(-6).map((change) => [change.method, change.cached]);
    // ROS3's zero runtimes are under 10 ms too, and their fold change (0 / 0) is no size at all.
    expect(last).toEqual([
      ...Array.from({ length: 3 }, () => ["hdf5 pynwb remfile with cache", true]),
      ...Array.from({ length: 3 }, () => ["hdf5 pynwb ros3", true]),
    ]);
    expect(changes.slice(-3).every((change) => Number.isNaN(change.foldChange))).toBe(true);
  });
});

describe("incremental slicing", () => {
  it("finds the first slice where streaming is slower", () => {
    expect(firstCrossover([1, 2, 5], [3, 3, 3])).toBe(2);
    expect(firstCrossover([1, 2], [3, 3, 3])).toBe(null);
  });

  it("summarizes each curve", () => {
    const overview = incrementalOverview(incrementalSlicing(everything));
    const local = overview.find((row) => row.accessMode === "local");
    expect(local?.downloadTime).toBeGreaterThan(0);
    expect(local?.slices).toBe(39);
    expect(overview.find((row) => row.label === "LINDI")?.downloadTime).toBeGreaterThan(0);
  });
});
