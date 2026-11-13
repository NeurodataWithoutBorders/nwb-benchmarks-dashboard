// @vitest-environment jsdom
// Boots for real with no network: the fetch fails and the card says the server was unreachable.
// Once the server answers, a retry loads a bundle that holds a record in an older format too.
import { routeFetch } from "@brain-bbqs/test-utils/vitest";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { RESULTS_BUNDLE_URL } from "../../src/lib/bundle";
import { synthesizeMockBundle } from "../../src/lib/mockBundle";
import { bootMain, dashboardShown, el } from "./helpers/mainHarness";

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

  it("loads a plain-JSON bundle on a retry, older formats and all", async () => {
    const bundle = {
      ...synthesizeMockBundle(),
      "results/timestamp-2024-02-17-00-59-37_machine-old_environment-old_results.json": {
        database_version: "2.0.0",
        results: { "time_remote_file_reading.X.time_read": { "(\"'https://x'\",)": [1] } },
      },
    };
    vi.stubGlobal(
      "fetch",
      routeFetch([{ match: RESULTS_BUNDLE_URL, respond: () => new Response(JSON.stringify(bundle)) }]),
    );
    el("retry-load-btn").click();
    await dashboardShown();
    expect(el("summary-note").hidden).toBe(true);
    expect(el("summary-totals").textContent).toMatch(/Machines2/);
  });
});
