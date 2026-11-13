// @vitest-environment jsdom
// Boots under `?test&load_error`: the download fails, and the card says why and offers a retry.
import { beforeAll, describe, expect, it, vi } from "vitest";
import { INJECTED_LOAD_ERROR } from "../../src/lib/testInjection";
import { bootMain, el } from "./helpers/mainHarness";

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
    expect(el("load-error").hidden).toBe(true);
    await vi.waitFor(() => expect(el("load-error").hidden).toBe(false));
    expect(el("dashboard").hidden).toBe(true);
  });
});
