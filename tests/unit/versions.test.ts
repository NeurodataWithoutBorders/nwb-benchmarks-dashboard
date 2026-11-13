import { describe, expect, it } from "vitest";
import { compareVersions, isAtLeast, numericVersion } from "../../src/lib/versions";

describe("compareVersions", () => {
  it.each([
    ["1.0.0", "1.0.0", 0],
    ["1.0", "1.0.0", 0],
    ["3.10.0", "3.9.1", 1],
    ["2025.7.0", "2026.9.0", -1],
    ["v1.2", "1.3", -1],
  ])("orders %s against %s", (a, b, sign) => {
    expect(Math.sign(compareVersions(a, b))).toBe(sign);
  });

  it("puts unreadable versions after readable ones, and orders them as text", () => {
    expect(compareVersions("unknown", "1.0")).toBeGreaterThan(0);
    expect(compareVersions("1.0", "unknown")).toBeLessThan(0);
    expect(Math.sign(compareVersions("alpha", "beta"))).toBe(-1);
  });
});

describe("isAtLeast", () => {
  it.each([
    ["3.0.0", true],
    ["4.0.0", true],
    ["2.2.0", false],
    [null, false],
    [undefined, false],
    ["dev", false],
  ])("%s against 3.0.0 is %s", (version, expected) => {
    expect(isAtLeast(version, "3.0.0")).toBe(expected);
  });
});

describe("numericVersion", () => {
  it("keeps the leading release number, as the analysis does", () => {
    expect(numericVersion("3.14.0 (py311h1234)")).toBe("3.14.0");
    expect(numericVersion("2.7.1.dev3+g9f92f234")).toBe("2.7.1.");
    expect(numericVersion("dev")).toBe(null);
    expect(numericVersion(undefined)).toBe(null);
    expect(numericVersion(null)).toBe(null);
  });
});
