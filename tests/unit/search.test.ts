import { describe, expect, it } from "vitest";
import { EXCLUDED_SAMPLES, ENVIRONMENT_TIMEPOINTS } from "../../src/lib/curation";
import { readDatabase } from "../../src/lib/database";
import { applyFilters } from "../../src/lib/filters";
import { synthesizeMockBundle } from "../../src/lib/mockBundle";
import {
  MAX_VALUE_SUGGESTIONS,
  SEARCH_FILTERS,
  applySuggestion,
  buildSearchIndex,
  closestKey,
  compileQuery,
  dateRange,
  dateSpan,
  formatTerm,
  parseTerms,
  suggestionGroups,
  termAtCaret,
  valueMatches,
} from "../../src/lib/search";
import { readParityBundle } from "./helpers/parity";

const db = readDatabase(readParityBundle());
const index = buildSearchIndex(db);

describe("terms", () => {
  it("splits a search at whitespace outside quotes, into filters and free text", () => {
    expect(parseTerms('  machine:"LBNL Mac"  hdf5 Date:>=2025 "a:b"')).toEqual([
      { start: 2, end: 20, key: "machine", value: "LBNL Mac" },
      { start: 22, end: 26, key: null, value: "hdf5" },
      { start: 27, end: 38, key: "date", value: ">=2025" },
      { start: 39, end: 44, key: null, value: "a:b" },
    ]);
  });

  it.each([
    ["machine", "LBNL Mac", 'machine:"LBNL Mac"'],
    ["pynwb", "3.1.3", "pynwb:3.1.3"],
    ["machine", 'say "hi"', 'machine:"say hi"'],
  ])("writes %s:%s as %s", (key, value, term) => {
    expect(formatTerm(key, value)).toBe(term);
  });

  it("names the key a mistyped one most likely meant", () => {
    expect(closestKey("pythn", ["machine", "python"])).toBe("python");
    expect(closestKey("zzzzzzzz", ["machine"])).toBeUndefined();
    expect(closestKey("x", [])).toBeUndefined();
  });

  it("finds the term at the caret, or an empty one between terms", () => {
    expect(termAtCaret("machine:a pyt", 12)).toMatchObject({ key: null, value: "pyt" });
    expect(termAtCaret("machine:a ", 10)).toEqual({ start: 10, end: 10, key: null, value: "" });
  });
});

describe("dates", () => {
  it.each([
    ["2025", ["2025-01-01", "2025-12-31"]],
    ["2024-02", ["2024-02-01", "2024-02-29"]],
    ["2025-11-03", ["2025-11-03", "2025-11-03"]],
  ])("reads %s as the days it covers", (date, span) => {
    expect(dateSpan(date)).toEqual(span);
  });

  it.each([
    ["2025-11", { from: "2025-11-01", to: "2025-11-30" }],
    [">=2025-11", { from: "2025-11-01", to: null }],
    [">2025-11", { from: "2025-12-01", to: null }],
    ["<=2025", { from: null, to: "2025-12-31" }],
    ["< 2025", { from: null, to: "2024-12-31" }],
    ["=2025-01-02", { from: "2025-01-02", to: "2025-01-02" }],
    ["2025-13", null],
    ["soon", null],
  ])("reads date:%s", (value, range) => {
    expect(dateRange(value)).toEqual(range);
  });
});

describe("the search index", () => {
  it("lists every facet's values with how many results files have them, most common first", () => {
    const environments = index.get("environment") ?? [];
    expect(environments.map((value) => value.count).reduce((sum, count) => sum + count, 0)).toBe(db.runs.length);
    expect(environments[0].count).toBeGreaterThanOrEqual(environments[environments.length - 1].count);
    expect(environments.some((value) => value.label.startsWith("2026-10-07"))).toBe(true);
    expect(index.get("date")?.[0].id).toMatch(/^\d{4}-\d{2}$/);
    expect(index.get("exclusions")?.map((value) => value.id)).toEqual(["on", "off"]);
  });

  it("matches a value by its label or by the start of its ID", () => {
    const value = { id: "42bfe7119727f6ab", label: "2026-10-07 (42bfe71)", count: 1 };
    expect(valueMatches("2026-10", value)).toBe(true);
    expect(valueMatches("42BFE7", value)).toBe(true);
    expect(valueMatches("bfe7", value)).toBe(true);
    expect(valueMatches("9e22", value)).toBe(false);
  });
});

describe("compiling a search", () => {
  it("narrows nothing without terms", () => {
    const compiled = compileQuery("", index);
    expect(compiled.narrowed).toBe(false);
    expect(compiled.problems).toEqual([]);
    expect(applyFilters(db, compiled.state).runs).toHaveLength(db.runs.length);
  });

  it("allows any value of a repeated key, and requires every key", () => {
    const one = compileQuery("environment:2026-10-07", index);
    expect(one.state.selected.environment).toEqual([ENVIRONMENT_TIMEPOINTS["2026-10-07"]]);
    const two = compileQuery("environment:2026-10-07 environment:2025-09-01", index);
    expect(two.state.selected.environment).toHaveLength(2);
    const both = applyFilters(db, compileQuery("environment:2026-10-07 os:nowhere", index).state);
    expect(both.runs).toHaveLength(0);
  });

  it("reports values that match nothing, and keys it does not know", () => {
    expect(compileQuery("machine:nobody", index).problems).toEqual(['No machine matches "nobody".']);
    expect(compileQuery("pynwbb:2026", index).problems).toEqual([
      "There is no pynwbb: filter, so it was searched as text. Did you mean pynwb:?",
    ]);
    expect(compileQuery("bogus:", index).problems).toEqual(["There is no bogus: filter."]);
  });

  it("searches free text across every facet of a run", () => {
    const compiled = compileQuery("42BFE71", index);
    expect(compiled.state.text).toEqual(["42bfe71"]);
    const dataset = applyFilters(db, compiled.state);
    expect(dataset.runs.length).toBeGreaterThan(0);
    expect(new Set(dataset.runs.map((run) => run.environmentId))).toEqual(
      new Set([ENVIRONMENT_TIMEPOINTS["2026-10-07"]]),
    );
    expect(compileQuery("unknown:thing", index).state.text).toEqual(["unknown:thing"]);
  });

  it("narrows the dates, the tightest bound winning", () => {
    const compiled = compileQuery("date:>=2025-11 date:>=2025-12-15 date:<2026-11", index);
    expect(compiled.state.from).toBe("2025-12-15");
    expect(compiled.state.to).toBe("2026-10-31");
    expect(compileQuery("date:<=2026 date:<=2027", index).state.to).toBe("2026-12-31");
    expect(compileQuery("date:soon", index).problems[0]).toContain("Write dates like");
  });

  it("keeps the curated outlier samples on request", () => {
    expect(compileQuery("exclusions:off", index).state.applyExclusions).toBe(false);
    expect(compileQuery("exclusions:on", index).state.applyExclusions).toBe(true);
    expect(compileQuery("exclusions:maybe", index).problems[0]).toContain("exclusions:off");
  });
});

describe("suggestions", () => {
  const term = (query: string) => termAtCaret(query, query.length);

  it("offers every filter on an empty search, and the ones a typed key starts", () => {
    const groups = suggestionGroups(term(""), index);
    expect(groups).toHaveLength(1);
    expect(groups[0].suggestions.map((suggestion) => suggestion.key)).toEqual(
      SEARCH_FILTERS.map((filter) => filter.key),
    );
    expect(suggestionGroups(term("pyt"), index).map((group) => group.label)).toEqual(["Filters"]);
    expect(suggestionGroups(term("2026"), index).map((group) => group.label)).toEqual(["Matching values"]);
  });

  it("offers a filter's values once its key is typed", () => {
    const [group] = suggestionGroups(term("environment:2026"), index);
    expect(group.label).toBe("Software environment");
    expect(group.suggestions[0].text).toBe('environment:"2026-10-07 (42bfe71)"');
    expect(group.suggestions[0].complete).toBe(true);
    const [exclusions] = suggestionGroups(term("exclusions:"), index);
    expect(exclusions.suggestions.map((suggestion) => suggestion.hint)).toEqual(["left out", "kept"]);
    expect(suggestionGroups(term("machine:"), index)[0].suggestions.length).toBeLessThanOrEqual(MAX_VALUE_SUGGESTIONS);
  });

  it("suggests the key a mistyped one meant, or nothing", () => {
    expect(suggestionGroups(term("pynwbb:x"), index)).toEqual([
      { label: "Did you mean", suggestions: [expect.objectContaining({ text: "pynwb:" })] },
    ]);
    expect(suggestionGroups(term("zzzzzzzz:x"), index)).toEqual([]);
  });

  it("replaces the term at the caret with the chosen suggestion", () => {
    const [group] = suggestionGroups(term("date:>=2025 environment:2026"), index);
    expect(applySuggestion("date:>=2025 environment:2026", 28, group.suggestions[0])).toEqual({
      query: 'date:>=2025 environment:"2026-10-07 (42bfe71)" ',
      caret: 47,
    });
    const filter = suggestionGroups(term("envi"), index)[1].suggestions[0];
    expect(applySuggestion("envi  pynwb:3", 4, filter)).toEqual({ query: "environment:  pynwb:3", caret: 12 });
  });
});

it("counts the curated exclusions on the exclusions: filter", () => {
  const mock = buildSearchIndex(readDatabase(synthesizeMockBundle()));
  expect(mock.get("exclusions")?.[0].count).toBe(EXCLUDED_SAMPLES.length);
});
