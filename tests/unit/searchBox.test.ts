// @vitest-environment jsdom
// The search box against hand-built elements: suggestions as you type, picking one with the
// keyboard or the mouse, and when the typed search is handed on.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readDatabase } from "../../src/lib/database";
import { buildSearchIndex } from "../../src/lib/search";
import { QUERY_DELAY_MS, initSearch, type SearchView } from "../../src/ui/search";
import { readParityBundle } from "./helpers/parity";

const index = buildSearchIndex(readDatabase(readParityBundle()));

let form: HTMLFormElement;
let input: HTMLInputElement;
let list: HTMLUListElement;
let onQuery: ReturnType<typeof vi.fn<(query: string) => void>>;
let view: SearchView;

beforeEach(() => {
  vi.useFakeTimers();
  form = document.createElement("form");
  input = document.createElement("input");
  list = document.createElement("ul");
  list.id = "suggestions";
  list.hidden = true;
  form.append(input, list);
  document.body.replaceChildren(form);
  Element.prototype.scrollIntoView = vi.fn();
  onQuery = vi.fn<(query: string) => void>();
  view = initSearch({ form, input, list }, onQuery);
  view.setIndex(index);
});

afterEach(() => {
  vi.useRealTimers();
});

function type(text: string): void {
  input.value = text;
  input.setSelectionRange(text.length, text.length);
  input.dispatchEvent(new Event("input"));
}

function key(name: string): KeyboardEvent {
  const event = new KeyboardEvent("keydown", { key: name, cancelable: true });
  input.dispatchEvent(event);
  return event;
}

function options(): string[] {
  return [...list.querySelectorAll("[role=option]")].map((option) => option.textContent ?? "");
}

describe("the search box", () => {
  it("lists the filters and a tip with examples from the data when focused", () => {
    expect(input.placeholder).toMatch(/^Search every record/);
    input.dispatchEvent(new Event("focus"));
    expect(list.hidden).toBe(false);
    expect(input.getAttribute("aria-expanded")).toBe("true");
    expect(list.querySelector(".search-group-label")?.textContent).toBe("Filters");
    expect(options()[0]).toBe("machine:Machine");
    const tip = list.querySelector(".search-tip")?.textContent ?? "";
    expect(tip).toContain("environment:");
    expect(tip).toContain("exclusions:off");
    expect(tip).toContain("a repeated key allows any of its values");
  });

  it("keeps the tip, and any notes, open where there is nothing to suggest", () => {
    view.setNotes(['No machine matches "nobody".'], false);
    type("zzzzzzzz:x");
    expect(list.hidden).toBe(false);
    expect(options()).toEqual([]);
    expect(list.querySelector(".search-note")?.textContent).toBe('No machine matches "nobody".');
    expect(key("ArrowDown").defaultPrevented).toBe(true);
    expect(list.querySelector("[aria-selected=true]")).toBeNull();
    view.setNotes(["The manuscript's selections."], true);
    expect(input.placeholder).toMatch(/^Showing the manuscript's figures/);
    expect(list.querySelector(".search-note")?.textContent).toBe("The manuscript's selections.");
  });

  it("hands the search on once typing pauses", () => {
    type("environment:2026");
    expect(onQuery).not.toHaveBeenCalled();
    expect(options()[0]).toContain("2026-10-07 (42bfe71)");
    vi.advanceTimersByTime(QUERY_DELAY_MS);
    expect(onQuery).toHaveBeenCalledWith("environment:2026");
  });

  it("picks a suggestion with the arrow keys and Enter, at once", () => {
    type("o");
    expect(key("ArrowDown").defaultPrevented).toBe(true);
    expect(list.querySelector("[aria-selected=true]")?.textContent).toContain("os:");
    expect(input.getAttribute("aria-activedescendant")).toBe("suggestions-0");
    key("Enter");
    // A filter's key stays open for its value.
    expect(input.value).toBe("os:");
    expect(list.hidden).toBe(false);
    key("ArrowUp");
    key("Enter");
    expect(input.value).toMatch(/^os:\S+ $/);
    expect(list.hidden).toBe(true);
    expect(onQuery).toHaveBeenLastCalledWith(input.value);
  });

  it("picks a suggestion with the mouse, and keeps focus while it is pressed", () => {
    type("os:");
    const option = list.querySelector<HTMLElement>("[role=option]") as HTMLElement;
    option.dispatchEvent(new Event("mousemove"));
    expect(option.getAttribute("aria-selected")).toBe("true");
    option.dispatchEvent(new Event("mousemove"));
    const press = new MouseEvent("mousedown", { cancelable: true });
    list.dispatchEvent(press);
    expect(press.defaultPrevented).toBe(true);
    option.click();
    expect(input.value).toBe("os:Darwin ");
  });

  it("opens with the arrow keys, follows the caret, and closes or clears with Escape", () => {
    input.value = "os:";
    key("ArrowDown");
    expect(list.hidden).toBe(false);
    input.setSelectionRange(0, 0);
    input.dispatchEvent(new KeyboardEvent("keyup", { key: "Home" }));
    expect(list.hidden).toBe(false);
    expect(key("Escape").defaultPrevented).toBe(true);
    expect(list.hidden).toBe(true);
    key("Escape");
    expect(input.value).toBe("");
    expect(onQuery).toHaveBeenLastCalledWith("");
    expect(key("Escape").defaultPrevented).toBe(false);
    key("Tab");
    input.dispatchEvent(new Event("blur"));
    expect(list.hidden).toBe(true);
  });

  it("applies the search on submit, and shows what it is told without handing it on", () => {
    type("pynwb:3");
    form.dispatchEvent(new Event("submit", { cancelable: true }));
    expect(onQuery).toHaveBeenCalledWith("pynwb:3");
    expect(list.hidden).toBe(true);
    onQuery.mockClear();
    type("os:");
    view.setQuery("from the URL");
    vi.advanceTimersByTime(QUERY_DELAY_MS);
    expect(onQuery).not.toHaveBeenCalled();
    expect(input.value).toBe("from the URL");
  });
});
