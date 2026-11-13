// The search box, after CodyCBakerPhD/website's record search: a combobox that suggests filters and
// their values as you type, picked with the mouse or the arrow keys and Enter. The query language
// lives in src/lib/search.ts; this is only the box and its dropdown.

import { h } from "@brain-bbqs/ui";
import {
  applySuggestion,
  formatTerm,
  suggestionGroups,
  termAtCaret,
  type SearchIndex,
  type Suggestion,
} from "../lib/search";
import type { AppElements } from "./elements";

type SearchElements = AppElements["search"];

/** How long typing has to pause before the figures follow it. */
export const QUERY_DELAY_MS = 250;

export interface SearchView {
  /** The values the search suggests, once results are loaded. */
  setIndex: (index: SearchIndex) => void;
  /** Shows a search without reporting it as typed: on load, or when the manuscript view clears it. */
  setQuery: (query: string) => void;
  setStatus: (text: string) => void;
}

export function initSearch(els: SearchElements, onQuery: (query: string) => void): SearchView {
  const { form, input, list, status } = els;
  let index: SearchIndex = new Map();
  let suggestions: Suggestion[] = [];
  let active = -1;
  let timer: number | undefined;

  function report(): void {
    window.clearTimeout(timer);
    onQuery(input.value);
  }

  function reportSoon(): void {
    window.clearTimeout(timer);
    timer = window.setTimeout(report, QUERY_DELAY_MS);
  }

  function highlight(position: number): void {
    active = position;
    list.querySelectorAll<HTMLElement>("[role=option]").forEach((option, at) => {
      option.setAttribute("aria-selected", String(at === position));
      if (at === position) option.scrollIntoView({ block: "nearest" });
    });
    if (position >= 0) input.setAttribute("aria-activedescendant", `${list.id}-${position}`);
    else input.removeAttribute("aria-activedescendant");
  }

  function closeSuggestions(): void {
    list.hidden = true;
    list.replaceChildren();
    suggestions = [];
    input.setAttribute("aria-expanded", "false");
    highlight(-1);
  }

  function choose(position: number): void {
    const suggestion = suggestions.at(position);
    if (!suggestion) return;
    const next = applySuggestion(input.value, input.selectionStart ?? input.value.length, suggestion);
    input.value = next.query;
    input.setSelectionRange(next.caret, next.caret);
    report();
    if (suggestion.complete) closeSuggestions();
    else openSuggestions();
  }

  function option(suggestion: Suggestion, position: number): HTMLLIElement {
    const item = h("li", suggestion.complete ? "search-option" : "search-option search-option-filter");
    item.id = `${list.id}-${position}`;
    item.setAttribute("role", "option");
    item.setAttribute("aria-selected", "false");
    const term = h("span", "search-option-term");
    term.append(
      h("span", "search-option-key", `${suggestion.key}:`),
      h("span", "search-option-value", suggestion.text.slice(suggestion.key.length + 1)),
    );
    const hint = h("span", suggestion.complete ? "search-option-count" : "search-option-hint", suggestion.hint);
    item.append(term, hint);
    item.addEventListener("click", () => choose(position));
    item.addEventListener("mousemove", () => {
      if (active !== position) highlight(position);
    });
    return item;
  }

  function tip(): string {
    const example = [...index.entries()]
      .flatMap(([key, values]) => values.map((value) => formatTerm(key, value.label)))
      .find((term) => term.includes('"'));
    return (
      "Different keys must all match; repeat a key to allow any of its values. " +
      `Quote values with spaces${example ? `, as in ${example}` : ""}.`
    );
  }

  function openSuggestions(): void {
    const term = termAtCaret(input.value, input.selectionStart ?? input.value.length);
    const groups = suggestionGroups(term, index);
    suggestions = groups.flatMap((group) => group.suggestions);
    if (suggestions.length === 0) {
      closeSuggestions();
      return;
    }
    const rows: HTMLLIElement[] = [];
    let position = 0;
    for (const group of groups) {
      const label = h("li", "search-group-label", group.label);
      label.setAttribute("role", "presentation");
      rows.push(label);
      for (const suggestion of group.suggestions) rows.push(option(suggestion, position++));
    }
    if (term.key === null && !term.value) {
      const hint = h("li", "search-tip", tip());
      hint.setAttribute("role", "presentation");
      rows.push(hint);
    }
    list.replaceChildren(...rows);
    list.hidden = false;
    input.setAttribute("aria-expanded", "true");
    highlight(-1);
  }

  input.addEventListener("input", () => {
    reportSoon();
    openSuggestions();
  });
  input.addEventListener("focus", openSuggestions);
  input.addEventListener("click", openSuggestions);
  input.addEventListener("blur", closeSuggestions);
  // Keeps focus in the input when the list (an option, or its scroll bar) is pressed, so it stays open.
  list.addEventListener("mousedown", (event) => event.preventDefault());
  input.addEventListener("keyup", (event) => {
    // The caret may have moved to another term.
    if (["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key) && !list.hidden) openSuggestions();
  });
  input.addEventListener("keydown", (event) => {
    const open = !list.hidden;
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      if (!open) {
        openSuggestions();
        return;
      }
      const count = suggestions.length;
      highlight(event.key === "ArrowDown" ? (active + 1) % count : active <= 0 ? count - 1 : active - 1);
    } else if (event.key === "Enter" && open && active >= 0) {
      event.preventDefault();
      choose(active);
    } else if (event.key === "Escape") {
      if (open) {
        event.preventDefault();
        closeSuggestions();
      } else if (input.value) {
        event.preventDefault();
        input.value = "";
        report();
      }
    }
  });
  // The figures follow the typing, so submitting (pressing Enter) applies it at once and puts the keyboard away.
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    closeSuggestions();
    report();
    input.blur();
  });

  return {
    setIndex(next) {
      index = next;
    },
    setQuery(query) {
      window.clearTimeout(timer);
      input.value = query;
    },
    setStatus(text) {
      status.textContent = text;
    },
  };
}
