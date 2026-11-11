import { describe, expect, it } from "vitest";
import { ENVIRONMENT_TIMEPOINTS, EXCLUDED_SAMPLES, LBL_MAC_MACHINE_IDS } from "../../src/lib/curation";
import { readDatabase } from "../../src/lib/database";
import {
  ALL_DATA,
  FACETS,
  MANUSCRIPT_DESCRIPTION,
  MANUSCRIPT_FIGURE_SELECTIONS,
  MANUSCRIPT_SELECTIONS,
  applyFilters,
  cloneState,
  defaultState,
  describeDataset,
  facetOptions,
  isManuscriptSearch,
  manuscriptSearch,
  sameState,
  stateFromSearch,
  stateToSearch,
  type FilterState,
} from "../../src/lib/filters";
import { readParityBundle } from "./helpers/parity";

const db = readDatabase(readParityBundle());

describe("the starting selection and the manuscript's", () => {
  it("starts from every result, as a copy", () => {
    const state = defaultState();
    expect(state).toEqual(ALL_DATA);
    state.selected.machine = ["x"];
    expect(ALL_DATA.selected).toEqual({});
    const manuscript = cloneState(MANUSCRIPT_SELECTIONS.reference);
    manuscript.selected.machine.push("x");
    expect(MANUSCRIPT_SELECTIONS.reference.selected.machine).toEqual(LBL_MAC_MACHINE_IDS);
  });

  it("takes each manuscript figure from the Python pipeline's selection", () => {
    expect(MANUSCRIPT_SELECTIONS.reference).toEqual({
      from: "2025-11-01",
      to: null,
      applyExclusions: true,
      selected: { machine: LBL_MAC_MACHINE_IDS, environment: [ENVIRONMENT_TIMEPOINTS["2025-09-01"]] },
    });
    expect(MANUSCRIPT_SELECTIONS.timepoints.selected.environment).toEqual(Object.values(ENVIRONMENT_TIMEPOINTS));
    expect(MANUSCRIPT_FIGURE_SELECTIONS).toEqual({
      rankings: "reference",
      traffic: "reference",
      extrapolation: "reference",
      versions: "timepoints",
      incremental: "timepoints",
    });
    expect(MANUSCRIPT_DESCRIPTION).toContain("the 2025-09-01 environment for Figures 3, 4a and 5");
  });

  it("compares states regardless of order", () => {
    const a: FilterState = { ...ALL_DATA, selected: { machine: ["b", "a"] } };
    const b: FilterState = { ...ALL_DATA, selected: { machine: ["a", "b"] } };
    expect(sameState(a, b)).toBe(true);
    expect(sameState(a, ALL_DATA)).toBe(false);
  });
});

describe("applyFilters", () => {
  it("keeps every readable run with no filter", () => {
    const dataset = applyFilters(db, ALL_DATA);
    expect(dataset.runs).toHaveLength(db.runs.length);
    expect(dataset.samples.some((sample) => sample.type === "track_incremental_slicing")).toBe(true);
  });

  it("narrows by facet and date, inclusively", () => {
    const dataset = applyFilters(db, {
      ...ALL_DATA,
      from: "2026-10-30",
      to: "2026-10-30",
      selected: { machine: LBL_MAC_MACHINE_IDS },
    });
    expect(dataset.runs.length).toBeGreaterThan(0);
    for (const run of dataset.runs) {
      expect(run.timestamp.startsWith("2026-10-30")).toBe(true);
      expect(LBL_MAC_MACHINE_IDS).toContain(run.machineId);
    }
  });

  it("drops the curated samples unless asked not to", () => {
    const excluded = EXCLUDED_SAMPLES.filter((sample) => db.runs.some((run) => run.timestamp === sample.timestamp));
    expect(excluded.length).toBeGreaterThan(0);
    const kept = applyFilters(db, { ...ALL_DATA, applyExclusions: false });
    const dropped = applyFilters(db, ALL_DATA);
    expect(dropped.excluded).toBe(excluded.length);
    expect(kept.samples.length - dropped.samples.length).toBe(excluded.length);
    expect(describeDataset(dropped)).toContain("curated exclusions applied");
    expect(describeDataset(kept)).not.toContain("curated");
  });

  it("ranks slice sizes within each modality, over the selection", () => {
    const dataset = applyFilters(db, ALL_DATA);
    const slicing = dataset.rows("time_remote_slicing");
    expect(new Set(slicing.map((row) => row.sliceNumber))).toEqual(new Set([1, 2, 3, 4, 5]));
    expect(dataset.rows("time_remote_slicing")).toBe(slicing);
    expect(dataset.rows("time_remote_file_reading").every((row) => row.sliceNumber === null)).toBe(true);
  });

  it("describes a selection", () => {
    const dataset = applyFilters(db, { ...ALL_DATA, selected: { machine: ["nobody"] } });
    expect(describeDataset(dataset)).toBe("0 results files · 0 machines · 0 environments");
    expect(dataset.environmentIds()).toEqual([]);
  });
});

describe("facetOptions", () => {
  it("counts each value against the other filters", () => {
    const state: FilterState = {
      ...ALL_DATA,
      selected: { machine: [LBL_MAC_MACHINE_IDS[1]], "pkg-h5py": ["missing"] },
    };
    const options = facetOptions(db, state);
    expect([...options.keys()]).toEqual(FACETS.map((facet) => facet.key));
    const machines = options.get("machine") ?? [];
    expect(machines.find((option) => option.value === LBL_MAC_MACHINE_IDS[1])?.selected).toBe(true);
    expect(machines.find((option) => option.value !== LBL_MAC_MACHINE_IDS[1])?.selected).toBe(false);
    // A value the state names but the data lacks still shows, at zero.
    expect(options.get("pkg-h5py")?.find((option) => option.value === "missing")?.count).toBe(0);
    const environments = (options.get("environment") ?? []).map((option) => option.label);
    expect(environments[0]).toMatch(/^2024-06-30/);
  });

  it("labels every facet's values", () => {
    const options = facetOptions(db, ALL_DATA);
    expect(options.get("commit")?.[0].label).toHaveLength(7);
    expect(options.get("python")?.map((option) => option.value)).toContain("3.11.7");
    expect(options.get("system")?.map((option) => option.label)).toContain("Darwin");
  });

  it("orders versions numerically, unknown last", () => {
    const python = FACETS.find((facet) => facet.key === "python");
    const sorted = ["unknown", "3.13.16", "3.9.1", "3.11.7"].sort((a, b) => python?.compare(a, b, db) ?? 0);
    expect(sorted).toEqual(["3.9.1", "3.11.7", "3.13.16", "unknown"]);
    expect(python?.compare("unknown", "unknown", db)).toBe(0);
  });

  it("describes runs whose machine or environment file is missing as unknown", () => {
    const bare = readDatabase({
      "results/r.json": {
        database_version: "4.0.0",
        timestamp: "2026-01-01-00-00-00",
        environment_id: "e",
        machine_id: "m",
        results: {},
      },
    });
    const options = facetOptions(bare, ALL_DATA);
    expect(options.get("system")?.[0].value).toBe("unknown");
    expect(options.get("pkg-h5py")?.[0].value).toBe("unknown");
    expect(options.get("python")?.[0].value).toBe("unknown");
    expect(options.get("commit")?.[0].label).toBe("unknown");
  });
});

describe("the URL form of a state", () => {
  it("round-trips, leaving other params alone", () => {
    const state: FilterState = {
      from: "2025-11-01",
      to: "2026-01-31",
      applyExclusions: false,
      selected: { machine: ["a", "b"], "pkg-h5py": ["3.14.0"] },
    };
    const search = stateToSearch(state, "?test&mock_data&machine=old");
    expect(search).toBe(
      "?test&mock_data&from=2025-11-01&to=2026-01-31&exclusions=off&machine=a&machine=b&pkg-h5py=3.14.0",
    );
    expect(stateFromSearch(search)).toEqual(state);
  });

  it("has a manuscript form in place of the filters", () => {
    expect(manuscriptSearch("?test&machine=a&from=2025-01-01")).toBe("?test&manuscript");
    expect(isManuscriptSearch("?test&manuscript")).toBe(true);
    expect(isManuscriptSearch("?test")).toBe(false);
    expect(stateFromSearch("?manuscript")).toBe(null);
    expect(stateToSearch({ ...ALL_DATA, selected: { machine: ["a"] } }, "?manuscript")).toBe("?machine=a");
  });

  it("is empty for the default of everything, and null when the URL names no filter", () => {
    expect(stateToSearch(ALL_DATA, "")).toBe("");
    expect(stateFromSearch("?test&mock_data")).toBe(null);
    expect(stateFromSearch("?from=yesterday&machine=")).toEqual({ ...ALL_DATA, from: null });
  });
});
