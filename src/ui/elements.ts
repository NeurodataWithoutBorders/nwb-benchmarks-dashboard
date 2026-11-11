// Typed lookups for the static skeleton markup in index.html. Every id the app touches is
// registered here, so a renamed or dropped element fails on import (and in the boot smoke test)
// rather than as a null dereference somewhere down the page.
import { getShellElements, getWhatsNewElements, required } from "@brain-bbqs/ui";

/** The shell's theme toggle and version stamp, looked up by @brain-bbqs/ui (no account menu here). */
export function getShell() {
  return getShellElements({ themeToggle: "theme-toggle" });
}

/** The parts every figure card has, by the card's id prefix. */
function figureCard(prefix: string) {
  return {
    card: required<HTMLElement>(`${prefix}-card`),
    note: required<HTMLParagraphElement>(`${prefix}-note`),
    figure: required<HTMLDivElement>(`${prefix}-figure`),
    legend: required<HTMLUListElement>(`${prefix}-legend`),
    table: required<HTMLDetailsElement>(`${prefix}-table`),
    csvBtn: required<HTMLButtonElement>(`${prefix}-csv-btn`),
    svgBtn: required<HTMLButtonElement>(`${prefix}-svg-btn`),
  };
}

export type FigureCardElements = ReturnType<typeof figureCard>;

export function getElements() {
  return {
    loadCard: required<HTMLElement>("load-card"),
    loadStatus: required<HTMLParagraphElement>("load-status"),
    loadProgress: required<HTMLDivElement>("load-progress"),
    loadProgressFill: required<HTMLDivElement>("load-progress-fill"),
    loadError: required<HTMLParagraphElement>("load-error"),
    retryLoadBtn: required<HTMLButtonElement>("retry-load-btn"),
    dropzone: required<HTMLDivElement>("dropzone"),
    dropzoneReject: required<HTMLParagraphElement>("dropzone-reject"),
    browseFileBtn: required<HTMLButtonElement>("browse-file-btn"),
    fileInput: required<HTMLInputElement>("file-input"),

    dashboard: required<HTMLDivElement>("dashboard"),
    dataSummary: required<HTMLParagraphElement>("data-summary"),
    changeSourceBtn: required<HTMLButtonElement>("change-source-btn"),

    filters: {
      presetButtons: required<HTMLDivElement>("preset-buttons"),
      from: required<HTMLInputElement>("filter-from"),
      to: required<HTMLInputElement>("filter-to"),
      exclusions: required<HTMLInputElement>("filter-exclusions"),
      exclusionsLabel: required<HTMLSpanElement>("filter-exclusions-label"),
      facetList: required<HTMLDivElement>("facet-list"),
      summary: required<HTMLParagraphElement>("filter-summary"),
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
    extrapolation: {
      ...figureCard("extrapolation"),
      preload: required<HTMLSelectElement>("extrapolation-preload"),
    },
    incremental: {
      ...figureCard("incremental"),
      scale: required<HTMLSelectElement>("incremental-scale"),
    },
    tooltip: required<HTMLDivElement>("chart-tooltip"),

    whatsNew: getWhatsNewElements(),
  };
}

export type AppElements = ReturnType<typeof getElements>;
