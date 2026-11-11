// Edge cases of the figure computations; their numbers are checked against the Python code in
// parity.test.ts.
import { describe, expect, it } from "vitest";
import { readDatabase } from "../../src/lib/database";
import { ALL_DATA, applyFilters } from "../../src/lib/filters";
import { extrapolations } from "../../src/lib/figures/extrapolation";
import { firstCrossover, incrementalOverview, incrementalSlicing } from "../../src/lib/figures/incremental";
import { methodRankings } from "../../src/lib/figures/rankings";
import { fileOpenTraffic, slicingTraffic } from "../../src/lib/figures/traffic";
import { performanceAcrossVersions } from "../../src/lib/figures/versions";
import { synthesizeMockBundle } from "../../src/lib/mockBundle";

const db = readDatabase(synthesizeMockBundle());
const everything = applyFilters(db, ALL_DATA);
const nothing = applyFilters(db, { ...ALL_DATA, selected: { machine: ["nobody"] } });

describe("with nothing selected", () => {
  it("every figure is empty rather than broken", () => {
    expect(methodRankings(nothing).every((panel) => panel.fastest.every((row) => row === null))).toBe(true);
    expect(fileOpenTraffic(nothing, "backend").points).toEqual([]);
    expect(slicingTraffic(nothing, false).panels.every((panel) => panel.points.length === 0)).toBe(true);
    expect(performanceAcrossVersions(nothing, "time_remote_slicing").panels).toEqual([]);
    expect(extrapolations(nothing)).toEqual([]);
    expect(incrementalSlicing(nothing)).toEqual([]);
  });
});

describe("performanceAcrossVersions", () => {
  it("splits slicing by preload state", () => {
    const figure = performanceAcrossVersions(everything, "time_remote_slicing");
    expect(new Set(figure.panels.map((panel) => panel.preloaded))).toEqual(new Set([false, true]));
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
    expect(performanceAcrossVersions(bare, "time_remote_file_reading").groups[0].label).toMatch(/^unknown environment/);
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
