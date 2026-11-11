// The parity fixture: a small slice of the published results bundle, and what nwb-benchmarks' own
// Python figure code computed from it (both written by tests/parity/generate_expected.py).
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { gunzipSync } from "node:zlib";
import type { Bundle } from "../../../src/lib/database";

const fixtures = resolve(__dirname, "../../fixtures");

export function readParityBundle(): Bundle {
  return JSON.parse(gunzipSync(readFileSync(resolve(fixtures, "parity-bundle.json.gz"))).toString("utf-8")) as Bundle;
}

export function readParityBundleBytes(): Uint8Array {
  return new Uint8Array(readFileSync(resolve(fixtures, "parity-bundle.json.gz")));
}

export type ExpectedRow = Record<string, string | number | boolean | null>;

export interface ExpectedContext {
  environment_id: string;
  heatmap: Record<string, ExpectedRow[]>;
  file_open_network: { backend: ExpectedRow[]; pynwb: ExpectedRow[] };
  slicing_network: { not_preloaded: ExpectedRow[]; preloaded: ExpectedRow[] };
  extrapolations: ExpectedRow[];
  incremental_overview: ExpectedRow[];
  incremental_curves: Record<string, ExpectedRow[]>;
}

export interface Expected {
  source: { lbl_mac_machine_ids: string[]; exclude_older: string };
  contexts: Record<string, ExpectedContext>;
  performance_over_time: Record<string, ExpectedRow[]>;
  derived_names: { benchmarks: ExpectedRow[]; modalities: ExpectedRow[]; scaling: ExpectedRow[] };
}

export function readExpected(): Expected {
  return JSON.parse(readFileSync(resolve(fixtures, "parity-expected.json"), "utf-8")) as Expected;
}

/** Equal to within floating-point noise, treating NaN (written as null) as equal to itself. */
export function close(actual: number | null | undefined, expected: unknown, relative = 1e-9): boolean {
  if (expected === null || expected === undefined)
    return actual === null || actual === undefined || Number.isNaN(actual);
  if (typeof expected !== "number" || actual === null || actual === undefined) return false;
  return Math.abs(actual - expected) <= relative * Math.max(1, Math.abs(expected));
}
