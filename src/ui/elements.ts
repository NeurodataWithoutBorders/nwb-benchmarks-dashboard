// Typed lookups for the static skeleton markup in index.html. Every id the app touches is
// registered here, so a renamed or dropped element fails on import (and in the boot smoke test)
// rather than as a null dereference somewhere down the page.
import { getShellElements, required } from "@brain-bbqs/ui";

/** The shell's theme toggle and version stamp, looked up by @brain-bbqs/ui (no account menu here). */
export function getShell() {
  return getShellElements({ themeToggle: "theme-toggle" });
}

/** The parts every figure card has, by the card's id prefix. */
function figureCard(prefix: string) {
  return {
    card: required<HTMLElement>(`${prefix}-card`),
    note: required<HTMLParagraphElement>(`${prefix}-note`),
    viewPlot: required<HTMLInputElement>(`${prefix}-view-plot`),
    viewTable: required<HTMLInputElement>(`${prefix}-view-table`),
    settingsBtn: required<HTMLButtonElement>(`${prefix}-settings-btn`),
    settings: required<HTMLDivElement>(`${prefix}-settings`),
    plot: required<HTMLDivElement>(`${prefix}-plot`),
    tableView: required<HTMLDivElement>(`${prefix}-table-view`),
    table: required<HTMLDivElement>(`${prefix}-table`),
    csvBtn: required<HTMLButtonElement>(`${prefix}-csv-btn`),
  };
}

export type FigureCardElements = ReturnType<typeof figureCard>;

export function getElements() {
  return {
    manuscriptToggle: required<HTMLButtonElement>("manuscript-toggle"),
    manuscriptTooltipText: required<HTMLSpanElement>("manuscript-tooltip-text"),

    loadCard: required<HTMLElement>("load-card"),
    loadStatus: required<HTMLParagraphElement>("load-status"),
    loadProgress: required<HTMLDivElement>("load-progress"),
    loadProgressFill: required<HTMLDivElement>("load-progress-fill"),
    loadError: required<HTMLParagraphElement>("load-error"),
    retryLoadBtn: required<HTMLButtonElement>("retry-load-btn"),

    dashboard: required<HTMLDivElement>("dashboard"),
    summary: {
      totals: required<HTMLTableElement>("summary-totals"),
      note: required<HTMLParagraphElement>("summary-note"),
      updated: required<HTMLParagraphElement>("summary-updated"),
      refreshBtn: required<HTMLButtonElement>("refresh-btn"),
    },
    search: {
      form: required<HTMLFormElement>("search-form"),
      input: required<HTMLInputElement>("search-input"),
      list: required<HTMLUListElement>("search-suggestions"),
    },

    rankings: {
      ...figureCard("rankings"),
      scale: required<HTMLSelectElement>("rankings-scale"),
    },
    traffic: {
      ...figureCard("traffic"),
      metric: required<HTMLSelectElement>("traffic-metric"),
      preload: required<HTMLSelectElement>("traffic-preload"),
    },
    versions: {
      ...figureCard("versions"),
      benchmark: required<HTMLSelectElement>("versions-benchmark"),
      axis: required<HTMLSelectElement>("versions-axis"),
    },
    incremental: {
      ...figureCard("incremental"),
      scale: required<HTMLSelectElement>("incremental-scale"),
    },
  };
}

export type AppElements = ReturnType<typeof getElements>;
