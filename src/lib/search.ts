// The search's query language, after CodyCBakerPhD/website's record search: free text plus
// key:value filters such as machine:"LBNL Mac" or pynwb:3.1, with suggestions for both. Repeating a
// key allows any of its values (a run has one machine, so requiring all of them would match
// nothing); different keys must all match. Nothing here touches the DOM.

import { EXCLUDED_SAMPLES } from "./curation";
import type { Database } from "./database";
import { ALL_DATA, FACETS, FACET_BY_KEY, normalize, type FacetDefinition, type FilterState } from "./filters";

/** One term of a search, and where it sits in the search's text. */
export interface Term {
  start: number;
  end: number;
  /** The filter's key, lowercased, or null for free text. */
  key: string | null;
  value: string;
}

/** Splits a search into terms at whitespace outside double quotes. Quotes keep a phrase or value together. */
export function parseTerms(query: string): Term[] {
  const terms: Term[] = [];
  let position = 0;
  while (position < query.length) {
    if (/\s/.test(query[position])) {
      position++;
      continue;
    }
    const start = position;
    let quoted = false;
    while (position < query.length && (quoted || !/\s/.test(query[position]))) {
      quoted = query[position] === '"' ? !quoted : quoted;
      position++;
    }
    const raw = query.slice(start, position);
    // A term opening with a quote is literal text, even if it holds a colon.
    const filter = /^([a-z][\w-]*):(.*)$/is.exec(raw);
    terms.push({
      start,
      end: position,
      key: filter ? filter[1].toLowerCase() : null,
      value: (filter ? filter[2] : raw).replace(/"/g, ""),
    });
  }
  return terms;
}

export function formatTerm(key: string, value: string): string {
  return `${key}:${/[\s"]/.test(value) ? `"${value.replace(/"/g, "")}"` : value}`;
}

function editDistance(a: string, b: string): number {
  let previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i++) {
    const current = [i];
    for (let j = 1; j <= b.length; j++) {
      current[j] = Math.min(previous[j] + 1, current[j - 1] + 1, previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    previous = current;
  }
  return previous[b.length];
}

/** The known key a mistyped one most likely meant, if any is close. */
export function closestKey(key: string, keys: readonly string[]): string | undefined {
  const ranked = keys
    .map((known) => ({ known, distance: editDistance(key, known) }))
    .sort((a, b) => a.distance - b.distance);
  return ranked.length > 0 && ranked[0].distance <= 2 ? ranked[0].known : undefined;
}

export type FilterKind = "facet" | "date" | "exclusions";

export interface SearchFilter {
  key: string;
  description: string;
  kind: FilterKind;
}

export const DATE_KEY = "date";
export const EXCLUSIONS_KEY = "exclusions";

/** Every key the search knows, in the order the suggestions list them. */
export const SEARCH_FILTERS: readonly SearchFilter[] = [
  ...FACETS.map((facet): SearchFilter => ({ key: facet.key, description: facet.label, kind: "facet" })),
  { key: DATE_KEY, description: "Date of the results, or a range such as date:>=2025-11", kind: "date" },
  {
    key: EXCLUSIONS_KEY,
    description: `The ${EXCLUDED_SAMPLES.length} curated outlier samples: off to keep them`,
    kind: "exclusions",
  },
];

const FILTER_BY_KEY = new Map(SEARCH_FILTERS.map((filter) => [filter.key, filter]));

export interface SearchValue {
  /** The facet value itself, such as a machine's ID. */
  id: string;
  /** What the reader types and sees, such as "LBNL Mac (87fee77)". */
  label: string;
  /** How many results files have it. */
  count: number;
}

/** Each key's values in a database, most common first, so the search can match and suggest them. */
export type SearchIndex = Map<string, SearchValue[]>;

export function buildSearchIndex(db: Database): SearchIndex {
  const index: SearchIndex = new Map();
  for (const facet of FACETS) {
    const counts = new Map<string, number>();
    for (const run of db.runs) {
      const value = facet.valueOf(run, db);
      counts.set(value, (counts.get(value) ?? 0) + 1);
    }
    index.set(
      facet.key,
      [...counts.entries()]
        .map(([id, count]) => ({ id, label: facet.labelOf(id, db), count }))
        .sort((a, b) => b.count - a.count || facet.compare(a.id, b.id, db)),
    );
  }
  const months = new Map<string, number>();
  for (const run of db.runs) months.set(run.timestamp.slice(0, 7), (months.get(run.timestamp.slice(0, 7)) ?? 0) + 1);
  index.set(
    DATE_KEY,
    [...months.entries()]
      .sort(([a], [b]) => b.localeCompare(a))
      .map(([month, count]) => ({ id: month, label: month, count })),
  );
  index.set(EXCLUSIONS_KEY, [
    { id: "on", label: "on", count: EXCLUDED_SAMPLES.length },
    { id: "off", label: "off", count: 0 },
  ]);
  return index;
}

/** Whether a typed value picks a facet value: by its label, or by the start of its ID. */
export function valueMatches(typed: string, value: SearchValue): boolean {
  const wanted = normalize(typed);
  return normalize(value.label).includes(wanted) || normalize(value.id).startsWith(wanted);
}

const ISO_DAY = 86_400_000;

function dayString(time: number): string {
  return new Date(time).toISOString().slice(0, 10);
}

/** The first and last day a `YYYY`, `YYYY-MM` or `YYYY-MM-DD` covers. */
export function dateSpan(date: string): [string, string] {
  const parts = date.split("-").map(Number);
  if (parts.length === 3) return [date, date];
  if (parts.length === 2) {
    const [year, month] = parts;
    return [dayString(Date.UTC(year, month - 1, 1)), dayString(Date.UTC(year, month, 1) - ISO_DAY)];
  }
  return [`${date}-01-01`, `${date}-12-31`];
}

/** The from and to a date: value such as 2025-11, >=2025-11-01 or <2026 stands for, or null if it is not one. */
export function dateRange(value: string): { from: string | null; to: string | null } | null {
  const match = /^(>=|<=|>|<|=)?(\d{4}(?:-(?:0[1-9]|1[0-2])(?:-(?:0[1-9]|[12]\d|3[01]))?)?)$/.exec(
    value.replace(/\s/g, ""),
  );
  if (!match) return null;
  const [, comparison = "=", date] = match;
  const [first, last] = dateSpan(date);
  switch (comparison) {
    case ">":
      return { from: dayString(Date.parse(last) + ISO_DAY), to: null };
    case ">=":
      return { from: first, to: null };
    case "<":
      return { from: null, to: dayString(Date.parse(first) - ISO_DAY) };
    case "<=":
      return { from: null, to: last };
    default:
      return { from: first, to: last };
  }
}

export interface CompiledQuery {
  state: FilterState;
  /** What could not be used as typed, for the search's status line. */
  problems: string[];
  /** Whether any term narrows the selection at all. */
  narrowed: boolean;
}

function narrowFacet(facet: FacetDefinition, values: string[], index: SearchIndex, problems: Set<string>): string[] {
  const options = index.get(facet.key) ?? [];
  const chosen = new Set<string>();
  for (const value of values) {
    const matches = options.filter((option) => valueMatches(value, option));
    if (matches.length === 0) problems.add(`No ${facet.label.toLowerCase()} matches "${value}".`);
    for (const match of matches) chosen.add(match.id);
  }
  return [...chosen];
}

function narrowDates(state: FilterState, value: string, problems: Set<string>): void {
  const range = dateRange(value);
  if (!range) {
    problems.add("Write dates like date:2025-11, or date:>=2025-11-01 for a range.");
    return;
  }
  if (range.from !== null && (state.from === null || range.from > state.from)) state.from = range.from;
  if (range.to !== null && (state.to === null || range.to < state.to)) state.to = range.to;
}

function setExclusions(state: FilterState, value: string, problems: Set<string>): void {
  const setting = normalize(value);
  if (setting === "on" || setting === "off") state.applyExclusions = setting === "on";
  else problems.add("Write exclusions:off to keep the curated outlier samples, or exclusions:on to leave them out.");
}

function unknownKey(key: string, value: string): string {
  const suggestion = closestKey(key, [...FILTER_BY_KEY.keys()]);
  return `There is no ${key}: filter${value ? ", so it was searched as text" : ""}.${suggestion ? ` Did you mean ${suggestion}:?` : ""}`;
}

/** Adds one term to the state, or to the facet values it collects for narrowFacet. */
function applyTerm(term: Term, state: FilterState, facetValues: Map<string, string[]>, problems: Set<string>): void {
  const value = term.value.trim();
  const filter = term.key === null ? undefined : FILTER_BY_KEY.get(term.key);
  if (term.key !== null && !filter) problems.add(unknownKey(term.key, value));
  // A key typed with no value yet narrows nothing.
  if (!value) return;
  if (!filter) state.text.push(normalize(term.key === null ? value : `${term.key}:${value}`));
  else if (filter.kind === "date") narrowDates(state, value, problems);
  else if (filter.kind === "exclusions") setExclusions(state, value, problems);
  else facetValues.set(filter.key, [...(facetValues.get(filter.key) ?? []), value]);
}

/** The filter state a search stands for. */
export function compileQuery(query: string, index: SearchIndex): CompiledQuery {
  const state: FilterState = { ...ALL_DATA, selected: {}, text: [] };
  const problems = new Set<string>();
  const facetValues = new Map<string, string[]>();
  for (const term of parseTerms(query)) applyTerm(term, state, facetValues, problems);
  for (const [key, values] of facetValues) {
    state.selected[key] = narrowFacet(FACET_BY_KEY.get(key) as FacetDefinition, values, index, problems);
  }
  const narrowed =
    state.from !== null || state.to !== null || !state.applyExclusions || facetValues.size > 0 || state.text.length > 0;
  return { state, problems: [...problems], narrowed };
}

// ----------------------------------------------------------------------------------------------
// Suggestions: the filters and values a term being typed could become.
// ----------------------------------------------------------------------------------------------

export interface Suggestion {
  /** The term that replaces the one being typed. */
  text: string;
  key: string;
  value: string;
  /** Description of a filter, or how many results files have a value. */
  hint: string;
  count?: number;
  /** Whether the term is complete, rather than a filter's key awaiting its value. */
  complete: boolean;
}

export interface SuggestionGroup {
  label: string;
  suggestions: Suggestion[];
}

export const MAX_VALUE_SUGGESTIONS = 8;

/** The term the caret is in, or an empty one where a new term would start. */
export function termAtCaret(query: string, caret: number): Term {
  return (
    parseTerms(query).find((term) => term.start <= caret && caret <= term.end) ?? {
      start: caret,
      end: caret,
      key: null,
      value: "",
    }
  );
}

function valueSuggestions(filter: SearchFilter, typed: string, index: SearchIndex): Suggestion[] {
  return (index.get(filter.key) ?? [])
    .filter((value) => !typed || valueMatches(typed, value))
    .slice(0, MAX_VALUE_SUGGESTIONS)
    .map((value) => ({
      text: formatTerm(filter.key, value.label),
      key: filter.key,
      value: value.label,
      hint: filter.kind === "exclusions" ? (value.id === "on" ? "left out" : "kept") : String(value.count),
      count: value.count,
      complete: true,
    }));
}

function filterSuggestion(filter: SearchFilter): Suggestion {
  return { text: `${filter.key}:`, key: filter.key, value: "", hint: filter.description, complete: false };
}

export function suggestionGroups(term: Term, index: SearchIndex): SuggestionGroup[] {
  if (term.key !== null) {
    const filter = FILTER_BY_KEY.get(term.key);
    if (filter) return [{ label: filter.description, suggestions: valueSuggestions(filter, term.value, index) }];
    const suggestion = closestKey(term.key, [...FILTER_BY_KEY.keys()]);
    return suggestion
      ? [{ label: "Did you mean", suggestions: [filterSuggestion(FILTER_BY_KEY.get(suggestion) as SearchFilter)] }]
      : [];
  }
  const typed = normalize(term.value);
  const groups: SuggestionGroup[] = [
    {
      label: "Filters",
      suggestions: SEARCH_FILTERS.filter((filter) => filter.key.startsWith(typed)).map(filterSuggestion),
    },
  ];
  if (typed.length >= 2) {
    const values = SEARCH_FILTERS.filter((filter) => filter.kind === "facet")
      .flatMap((filter) => valueSuggestions(filter, typed, index))
      .sort((a, b) => (b.count ?? 0) - (a.count ?? 0))
      .slice(0, MAX_VALUE_SUGGESTIONS);
    groups.unshift({ label: "Matching values", suggestions: values });
  }
  return groups.filter((group) => group.suggestions.length > 0);
}

/** The search with the term at the caret replaced by a suggestion, and where the caret goes. */
export function applySuggestion(
  query: string,
  caret: number,
  suggestion: Suggestion,
): { query: string; caret: number } {
  const term = termAtCaret(query, caret);
  const before = query.slice(0, term.start);
  const after = query.slice(term.end);
  const inserted = suggestion.complete ? `${suggestion.text} ` : suggestion.text;
  return {
    query: before + inserted + (suggestion.complete ? after.trimStart() : after),
    caret: before.length + inserted.length,
  };
}
