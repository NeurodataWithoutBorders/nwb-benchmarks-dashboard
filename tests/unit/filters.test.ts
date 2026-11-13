import { describe, expect, it } from "vitest";
import { ENVIRONMENT_TIMEPOINTS, EXCLUDED_SAMPLES, LBL_MAC_MACHINE_IDS } from "../../src/lib/curation";
import { readDatabase } from "../../src/lib/database";
import {
  ALL_DATA,
  FACETS,
  FACET_BY_KEY,
  MANUSCRIPT_DESCRIPTION,
  MANUSCRIPT_FIGURE_SELECTIONS,
  MANUSCRIPT_SELECTIONS,
  applyFilters,
  datasetTotals,
  isManuscriptSearch,
  manuscriptSearch,
  normalize,
  queryFromSearch,
  querySearch,
} from "../../src/lib/filters";
import { buildSearchIndex } from "../../src/lib/search";
import { readParityBundle } from "./helpers/parity";

const db = readDatabase(readParityBundle());

/** A facet's values over every run, as the search index lists them. */
function facetValues(database: typeof db, key: string): { id: string; label: string }[] {
  return buildSearchIndex(database).get(key) ?? [];
}

describe("the manuscript's selections", () => {
  it("takes each manuscript figure from the Python pipeline's selection", () => {
    expect(MANUSCRIPT_SELECTIONS.reference).toEqual({
      from: "2025-11-01",
      to: null,
      applyExclusions: true,
      selected: { machine: LBL_MAC_MACHINE_IDS, environment: [ENVIRONMENT_TIMEPOINTS["2026-10-07"]] },
      text: [],
    });
    expect(MANUSCRIPT_SELECTIONS.timepoints.selected.environment).toEqual(Object.values(ENVIRONMENT_TIMEPOINTS));
    expect(MANUSCRIPT_FIGURE_SELECTIONS).toEqual({
      rankings: "reference",
      traffic: "reference",
      versions: "timepoints",
      incremental: "timepoints",
    });
    expect(MANUSCRIPT_DESCRIPTION).toContain("the 2026-10-07 environment for the method rankings and network traffic");
    expect(MANUSCRIPT_DESCRIPTION).not.toMatch(/Figure/);
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
    expect(datasetTotals(dropped).excluded).toBe(excluded.length);
    expect(datasetTotals(kept).excluded).toBe(0);
  });

  it("matches free text against every facet of a run, labels and raw values both", () => {
    const byLabel = applyFilters(db, { ...ALL_DATA, text: ["darwin"] });
    expect(byLabel.runs.length).toBeGreaterThan(0);
    const byId = applyFilters(db, { ...ALL_DATA, text: [LBL_MAC_MACHINE_IDS[1].slice(0, 12)] });
    expect(byId.runs.every((run) => run.machineId === LBL_MAC_MACHINE_IDS[1])).toBe(true);
    expect(applyFilters(db, { ...ALL_DATA, text: ["darwin", "nowhere"] }).runs).toHaveLength(0);
    expect(normalize("  Rübel  Lab ")).toBe("rubel lab");
  });

  it("ranks slice sizes within each modality, over the selection", () => {
    const dataset = applyFilters(db, ALL_DATA);
    const slicing = dataset.rows("time_remote_slicing");
    expect(new Set(slicing.map((row) => row.sliceNumber))).toEqual(new Set([1, 2, 3, 4, 5]));
    expect(dataset.rows("time_remote_slicing")).toBe(slicing);
    expect(dataset.rows("time_remote_file_reading").every((row) => row.sliceNumber === null)).toBe(true);
  });

  it("totals a selection", () => {
    const dataset = applyFilters(db, { ...ALL_DATA, selected: { machine: ["nobody"] } });
    expect(datasetTotals(dataset)).toEqual({
      runs: 0,
      machines: 0,
      environments: 0,
      benchmarks: 0,
      cases: 0,
      excluded: 0,
    });
    const everything = datasetTotals(applyFilters(db, ALL_DATA));
    expect(everything.runs).toBe(db.runs.length);
    expect(everything.benchmarks).toBeGreaterThan(10);
    expect(everything.cases).toBeGreaterThan(everything.benchmarks);
  });
});

describe("facets", () => {
  it("are keyed as the search names them", () => {
    expect(FACETS.map((facet) => facet.key)).toEqual(
      expect.arrayContaining(["machine", "os", "environment", "pynwb", "format"]),
    );
    expect(FACET_BY_KEY.get("hdmf-zarr")?.label).toBe("hdmf-zarr version");
  });

  it("label every value", () => {
    expect(facetValues(db, "commit")[0].label).toHaveLength(7);
    expect(facetValues(db, "python").map((value) => value.id)).toContain("3.11.7");
    expect(facetValues(db, "os").map((value) => value.label)).toContain("Darwin");
    expect(facetValues(db, "environment").map((value) => value.label)).toContain("2024-06-30 (9e22511)");
  });

  it("order versions numerically, unknown last", () => {
    const python = FACET_BY_KEY.get("python");
    const sorted = ["unknown", "3.13.16", "3.9.1", "3.11.7"].sort((a, b) => python?.compare(a, b, db) ?? 0);
    expect(sorted).toEqual(["3.9.1", "3.11.7", "3.13.16", "unknown"]);
    expect(python?.compare("unknown", "unknown", db)).toBe(0);
    const environment = FACET_BY_KEY.get("environment");
    const environments = [ENVIRONMENT_TIMEPOINTS["2026-10-07"], "e833ef39", ENVIRONMENT_TIMEPOINTS["2024-06-30"]];
    expect(environments.sort((a, b) => environment?.compare(a, b, db) ?? 0)[0]).toBe(
      ENVIRONMENT_TIMEPOINTS["2024-06-30"],
    );
    const machine = FACET_BY_KEY.get("machine");
    expect(machine?.compare(LBL_MAC_MACHINE_IDS[0], LBL_MAC_MACHINE_IDS[0], db)).toBe(0);
  });

  it("describe runs whose machine or environment file is missing as unknown", () => {
    const bare = readDatabase({
      "results/r.json": {
        database_version: "4.0.0",
        timestamp: "2026-01-01-00-00-00",
        environment_id: "e",
        machine_id: "m",
        results: {},
      },
    });
    expect(facetValues(bare, "os")[0].id).toBe("unknown");
    expect(facetValues(bare, "h5py")[0].id).toBe("unknown");
    expect(facetValues(bare, "python")[0].id).toBe("unknown");
    expect(facetValues(bare, "commit")[0].label).toBe("unknown");
  });
});

describe("the URL", () => {
  it("holds the search as ?q=, leaving other params alone", () => {
    const search = querySearch(' machine:"LBNL Mac" pynwb:3 ', "?test&mock_data&q=old");
    expect(search).toBe("?test&mock_data&q=machine%3A%22LBNL+Mac%22+pynwb%3A3");
    expect(queryFromSearch(search)).toBe('machine:"LBNL Mac" pynwb:3');
    expect(querySearch("", "?q=old")).toBe("");
    expect(queryFromSearch("?test")).toBe("");
  });

  it("has a manuscript form in place of the search, which a search leaves", () => {
    expect(manuscriptSearch("?test&q=machine%3Aa")).toBe("?test&manuscript");
    expect(isManuscriptSearch("?test&manuscript")).toBe(true);
    expect(isManuscriptSearch("?test")).toBe(false);
    expect(querySearch("machine:a", "?manuscript")).toBe("?q=machine%3Aa");
  });
});
