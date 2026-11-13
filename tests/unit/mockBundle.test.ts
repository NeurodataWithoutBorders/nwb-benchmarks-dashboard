import { describe, expect, it } from "vitest";
import { readDatabase } from "../../src/lib/database";
import { ALL_DATA, applyFilters } from "../../src/lib/filters";
import { incrementalSlicing } from "../../src/lib/figures/incremental";
import { methodRankings } from "../../src/lib/figures/rankings";
import { fileOpenTraffic, slicingTraffic } from "../../src/lib/figures/traffic";
import { performanceAcrossVersions } from "../../src/lib/figures/versions";
import { MOCK_ENVIRONMENT_IDS, MOCK_MACHINE_ID, synthesizeMockBundle } from "../../src/lib/mockBundle";

describe("synthesizeMockBundle", () => {
  const bundle = synthesizeMockBundle();
  const db = readDatabase(bundle);
  const dataset = applyFilters(db, ALL_DATA);

  it("is the same on every call", () => {
    expect(JSON.stringify(synthesizeMockBundle())).toBe(JSON.stringify(bundle));
  });

  it("is recognizably fake", () => {
    expect([...db.machines.keys()]).toEqual([MOCK_MACHINE_ID]);
    expect([...db.environments.keys()]).toEqual(MOCK_ENVIRONMENT_IDS);
    expect(JSON.stringify(bundle)).toContain("test-injection.invalid");
  });

  it("fills every figure", () => {
    expect(methodRankings(dataset).every((panel) => panel.cells.flat().every((cell) => cell !== null))).toBe(true);
    expect(fileOpenTraffic(dataset, "pynwb").points.length).toBe(30);
    expect(slicingTraffic(dataset, true).panels.some((panel) => panel.zeroTraffic.length > 0)).toBe(true);
    expect(performanceAcrossVersions(dataset, "time_remote_file_reading").groups).toHaveLength(2);
    expect(incrementalSlicing(dataset)).toHaveLength(3);
  });
});
