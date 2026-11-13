import { describe, expect, it } from "vitest";
import { isPyDict, parseParameterCase, parsePyLiteral } from "../../src/lib/pyLiteral";

describe("parsePyLiteral", () => {
  it.each([
    ["None", null],
    ["True", true],
    ["False", false],
    ["42", 42],
    ["-3.5e2", -350],
    ["1_000", 1000],
    [".5", 0.5],
    ["'it\\'s'", "it's"],
    ['"double \\"quoted\\""', 'double "quoted"'],
    ["'tab\\tnew\\nline'", "tab\tnew\nline"],
    ["'\\x41\\u00e9'", "Aé"],
    ["'unknown \\q escape'", "unknown \\q escape"],
    ["[]", []],
    ["()", []],
    ["(1,)", [1]],
    ["(1)", 1],
    ["[1, 'a', None]", [1, "a", null]],
    ["{}", {}],
  ])("reads %s", (text, expected) => {
    expect(parsePyLiteral(text)).toEqual(expected);
  });

  it("keeps slice(...) calls as their source text, as nwb-benchmarks quotes them", () => {
    expect(parsePyLiteral("{'slice_range': (slice(0, 40, None), slice(0, 796, None))}")).toEqual({
      slice_range: ["slice(0, 40, None)", "slice(0, 796, None)"],
    });
  });

  it("reads nan and inf", () => {
    expect(parsePyLiteral("nan")).toBeNaN();
    expect(parsePyLiteral("inf")).toBe(Number.POSITIVE_INFINITY);
  });

  it.each([
    ["{'a': 1", 'expected "," or "}"'],
    ["[1 2]", 'expected "," or "]"'],
    ["'open", "unterminated string"],
    ["slice(0, 1", "unterminated slice"],
    ["object()", 'unknown name "object"'],
    ["@", "unexpected character"],
    ["1 2", "unexpected trailing text"],
    ["-", "bad number"],
    ["'\\x4'", "bad escape"],
    ["{(1, 2): 3}", "unsupported dict key"],
    ["{'a' 1}", 'expected ":"'],
  ])("refuses %s (%s)", (text, reason) => {
    expect(() => parsePyLiteral(text)).toThrow(reason);
  });
});

describe("parseParameterCase", () => {
  it("returns a dict case as it is", () => {
    expect(parseParameterCase("{'name': 'EcephysTestCase', 'https_url': 'https://x'}")).toEqual({
      name: "EcephysTestCase",
      https_url: "https://x",
    });
  });

  it("reads the positional tuples results before format 3.0.0 used, each parameter a literal of its own", () => {
    expect(parseParameterCase("(\"'https://x'\",)")).toEqual({ https_url: "https://x" });
    expect(
      parseParameterCase(
        "(\"'https://x'\", \"'ElectricalSeriesAp'\", '(slice(0, 30000, None), slice(0, 384, None))', 'extra')",
      ),
    ).toEqual({
      https_url: "https://x",
      object_name: "ElectricalSeriesAp",
      slice_range: ["slice(0, 30000, None)", "slice(0, 384, None)"],
    });
    expect(parseParameterCase('("\'unterminated",)')).toEqual({ https_url: "unterminated" });
    expect(parseParameterCase("(1,)")).toEqual({ https_url: 1 });
    // A bare string indexes to its first character, as it does in Python.
    expect(parseParameterCase("'https://x'")).toEqual({ https_url: "h" });
    expect(parseParameterCase("1")).toEqual({ https_url: null });
  });
});

describe("isPyDict", () => {
  it("tells dicts from lists and scalars", () => {
    expect(isPyDict({})).toBe(true);
    expect(isPyDict([])).toBe(false);
    expect(isPyDict(null)).toBe(false);
    expect(isPyDict("a")).toBe(false);
  });
});
