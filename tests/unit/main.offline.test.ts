// @vitest-environment jsdom
// Boots for real with no network: the fetch fails and the card says the server was unreachable.
// A bundle holding results in an older format then loads, and the summary says how many it left out.
import { beforeAll, describe, expect, it, vi } from "vitest";
import { synthesizeMockBundle } from "../../src/lib/mockBundle";
import { bootMain, dashboardShown, el, pickFile } from "./helpers/mainHarness";

let calls: { url: string }[] = [];

beforeAll(async () => {
  const booted = await bootMain();
  calls = booted.fetch?.calls ?? [];
  await vi.waitFor(() => expect(el("load-error").hidden).toBe(false));
});

describe("main.ts boot offline", () => {
  it("tried the published bundle and explains the failure", () => {
    expect(calls[0].url).toContain("nwb-benchmarks-results/dist/bundle.json.gz");
    expect(el("load-error").textContent).toBe(
      "The results server could not be reached. Check the connection and try again.",
    );
  });

  it("loads a plain-JSON bundle, counting the files it left out", async () => {
    const bundle = { ...synthesizeMockBundle(), "results/old.json": { database_version: "2.0.0" } };
    pickFile(new File([JSON.stringify(bundle)], "bundle.json", { type: "application/json" }));
    await dashboardShown();
    expect(el("data-summary").textContent).toContain(
      "1 results files in formats older than the figures read are left out.",
    );
  });
});
