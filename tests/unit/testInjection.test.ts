import { describe, expect, it } from "vitest";
import { FROZEN_PROGRESS, INJECTED_LOAD_ERROR, readTestInjection } from "../../src/lib/testInjection";

describe("readTestInjection", () => {
  it("is null without ?test, however many other params are present", () => {
    expect(readTestInjection("")).toBe(null);
    expect(readTestInjection("?mock_data")).toBe(null);
    expect(readTestInjection("?foo=1&bar")).toBe(null);
  });

  it("is a no-op plan for a bare ?test", () => {
    expect(readTestInjection("?test")).toEqual({ mockData: false, freezeLoading: false, loadError: false });
  });

  it.each([
    ["?test&mock_data", { mockData: true, freezeLoading: false, loadError: false }],
    ["?freeze_loading&test", { mockData: false, freezeLoading: true, loadError: false }],
    ["?test&load_error", { mockData: false, freezeLoading: false, loadError: true }],
  ])("reads %s", (search, plan) => {
    expect(readTestInjection(search)).toEqual(plan);
  });

  it("fakes recognizably", () => {
    expect(FROZEN_PROGRESS.received).toBeLessThan(FROZEN_PROGRESS.total ?? 0);
    expect(INJECTED_LOAD_ERROR).toContain("test injection");
  });
});
