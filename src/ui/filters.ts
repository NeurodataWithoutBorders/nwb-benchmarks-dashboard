// The filters card: every result or the manuscript view, the date range, the curated exclusions,
// and one checklist per facet of run metadata, each value counted against the other filters.

import { button, h } from "@brain-bbqs/ui";
import { EXCLUDED_SAMPLES } from "../lib/curation";
import type { Database } from "../lib/database";
import {
  ALL_DATA,
  FACETS,
  MANUSCRIPT_DESCRIPTION,
  cloneState,
  describeDataset,
  facetOptions,
  sameState,
  type Dataset,
  type FacetOption,
  type FilterState,
} from "../lib/filters";
import type { AppElements } from "./elements";

type FilterElements = AppElements["filters"];

/** The state with one facet narrowed to `values`, or opened up again when that is every value. */
export function withFacet(state: FilterState, key: string, values: string[], all: string[]): FilterState {
  const selected = { ...state.selected };
  if (all.every((value) => values.includes(value))) delete selected[key];
  else selected[key] = values;
  return { ...state, selected };
}

function facetSummary(options: FacetOption[]): string {
  const selected = options.filter((option) => option.selected).length;
  return selected === options.length ? `all ${options.length}` : `${selected} of ${options.length}`;
}

export interface FiltersView {
  render: (db: Database, state: FilterState, dataset: Dataset, manuscript: boolean) => void;
}

export interface FiltersHandlers {
  onChange: (state: FilterState) => void;
  /** Asks for the manuscript view, whose figures each take their own selection. */
  onManuscript: () => void;
}

/** The facets shown up front; the rest (package versions and the like) sit behind "More". */
const PRIMARY_FACETS = ["machine", "system", "cpu", "environment", "python"];

export function initFilters(els: FilterElements, { onChange, onManuscript }: FiltersHandlers): FiltersView {
  const openFacets = new Set<string>();
  let moreOpen = false;
  let current: FilterState | null = null;

  els.from.addEventListener("change", () => {
    if (current) onChange({ ...current, from: els.from.value || null });
  });
  els.to.addEventListener("change", () => {
    if (current) onChange({ ...current, to: els.to.value || null });
  });
  els.exclusions.addEventListener("change", () => {
    if (current) onChange({ ...current, applyExclusions: els.exclusions.checked });
  });
  els.exclusionsLabel.textContent = `Leave out the ${EXCLUDED_SAMPLES.length} curated outlier samples`;

  function renderPresets(state: FilterState, manuscript: boolean): void {
    const all = button("small preset-button", "All results");
    all.title = "Every machine, environment and date in the results.";
    all.setAttribute("aria-pressed", String(!manuscript && sameState(state, ALL_DATA)));
    all.addEventListener("click", () => onChange(cloneState(ALL_DATA)));
    const paper = button("small preset-button", "Manuscript figures");
    paper.title = MANUSCRIPT_DESCRIPTION;
    paper.setAttribute("aria-pressed", String(manuscript));
    paper.addEventListener("click", onManuscript);
    els.presetButtons.replaceChildren(all, paper);
  }

  function renderFacet(state: FilterState, key: string, label: string, options: FacetOption[]): HTMLDetailsElement {
    const details = h("details", "facet");
    details.dataset.facet = key;
    details.open = openFacets.has(key);
    details.addEventListener("toggle", () => {
      if (details.open) openFacets.add(key);
      else openFacets.delete(key);
    });
    const summary = h("summary");
    summary.append(h("span", "facet-label", label), h("span", "facet-count", facetSummary(options)));
    details.append(summary);
    const all = options.map((option) => option.value);
    const list = h("ul", "facet-options");
    for (const option of options) {
      const item = h("li", option.count === 0 ? "facet-option empty" : "facet-option");
      const row = h("label");
      const box = h("input");
      box.type = "checkbox";
      box.checked = option.selected;
      box.addEventListener("change", () => {
        const chosen = options
          .filter((other) => (other.value === option.value ? box.checked : other.selected))
          .map((other) => other.value);
        onChange(withFacet(state, key, chosen, all));
      });
      row.append(box, h("span", "facet-value", option.label), h("span", "facet-option-count", option.count));
      const only = button("facet-only", "only");
      only.title = `Show only ${option.label}`;
      only.addEventListener("click", () => onChange(withFacet(state, key, [option.value], all)));
      item.append(row, only);
      list.append(item);
    }
    details.append(list);
    if (key in state.selected) {
      const reset = button("small facet-all", "Select all");
      reset.addEventListener("click", () => onChange(withFacet(state, key, all, all)));
      details.append(reset);
    }
    return details;
  }

  return {
    render(db, state, dataset, manuscript) {
      current = state;
      renderPresets(state, manuscript);
      const dates = db.runs.map((run) => run.timestamp.slice(0, 10));
      if (dates.length) {
        els.from.min = els.to.min = dates[0];
        els.from.max = els.to.max = dates[dates.length - 1];
      }
      els.from.value = state.from ?? "";
      els.to.value = state.to ?? "";
      els.exclusions.checked = state.applyExclusions;
      const options = facetOptions(db, state);
      const facetElement = (facet: (typeof FACETS)[number]): HTMLDetailsElement =>
        renderFacet(state, facet.key, facet.label, options.get(facet.key) ?? []);
      const more = h("details", "facet-more");
      more.open =
        moreOpen || FACETS.some((facet) => !PRIMARY_FACETS.includes(facet.key) && facet.key in state.selected);
      more.addEventListener("toggle", () => {
        moreOpen = more.open;
      });
      const secondary = FACETS.filter((facet) => !PRIMARY_FACETS.includes(facet.key));
      const narrowed = secondary.filter((facet) => facet.key in state.selected).length;
      more.append(
        h(
          "summary",
          null,
          `Package versions, suite commit and results format${narrowed ? ` (${narrowed} narrowed)` : ""}`,
        ),
      );
      const moreList = h("div", "facet-list");
      moreList.append(...secondary.map(facetElement));
      more.append(moreList);
      els.facetList.replaceChildren(
        ...FACETS.filter((facet) => PRIMARY_FACETS.includes(facet.key)).map(facetElement),
        more,
      );
      els.summary.textContent = manuscript ? MANUSCRIPT_DESCRIPTION : describeDataset(dataset);
    },
  };
}
