// @vitest-environment jsdom
// Boots under `?test&load_error`: the download fails, the card says why and offers a retry, and a
// bundle dropped in instead loads in its place.
import { beforeAll, describe, expect, it, vi } from "vitest";
import { INJECTED_LOAD_ERROR } from "../../src/lib/testInjection";
import { bootMain, bundleFile, dashboardShown, el, pickFile } from "./helpers/mainHarness";

beforeAll(async () => {
  await bootMain("?test&load_error");
  await vi.waitFor(() => expect(el("load-error").hidden).toBe(false));
});

describe("main.ts boot with ?test&load_error", () => {
  it("says the results could not be loaded, and why", () => {
    expect(el("load-status").textContent).toBe("The results could not be loaded.");
    expect(el("load-error").textContent).toBe(INJECTED_LOAD_ERROR);
    expect(el("retry-load-btn").hidden).toBe(false);
    expect(el("load-progress").hidden).toBe(true);
  });

  it("fails the same way on a retry", async () => {
    el("retry-load-btn").click();
    await vi.waitFor(() => expect(el("load-error").hidden).toBe(false));
  });

  it("refuses a dropped file that is not a bundle", async () => {
    pickFile(new File(["not json"], "notes.txt", { type: "text/plain" }));
    await vi.waitFor(() => expect(el("load-error").textContent).toBe("The bundle is not valid JSON."));
  });

  it("loads a dropped bundle", async () => {
    pickFile(bundleFile());
    await dashboardShown();
    expect(el("data-summary").textContent).toContain("from bundle.json.gz");
  });
});
