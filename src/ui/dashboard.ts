// The dashboard once results are loaded: the summary, the search, and the four figure cards, each
// recomputed from the filtered data whenever the search or its own controls change. The manuscript
// view (`?manuscript`, the header's toggle) instead draws each figure from the selection the
// manuscript does, and any edit to the search leaves it.

import { h } from "@brain-bbqs/ui";
import { RESULTS_REPOSITORY } from "../lib/bundle";
import type { Column } from "../lib/csv";
import { latestRunDate, type Database } from "../lib/database";
import { incrementalSlicing } from "../lib/figures/incremental";
import { methodRankings } from "../lib/figures/rankings";
import { DEFAULT_NETWORK_METRIC, fileOpenTraffic, slicingTraffic } from "../lib/figures/traffic";
import { VERSION_AXES, performanceAcrossVersions, type VersionsBenchmark } from "../lib/figures/versions";
import {
  MANUSCRIPT_DESCRIPTION,
  MANUSCRIPT_FIGURE_SELECTIONS,
  MANUSCRIPT_SELECTIONS,
  applyFilters,
  datasetTotals,
  isManuscriptSearch,
  manuscriptSearch,
  queryFromSearch,
  querySearch,
  type Dataset,
  type FigureId,
  type ManuscriptSelection,
  type Totals,
} from "../lib/filters";
import { NETWORK_METRIC_LABELS } from "../lib/methods";
import { buildSearchIndex, compileQuery, type SearchIndex } from "../lib/search";
import { clearFigure, drawFigure, emptyFigure, type FigureOptions, type FigureSpec } from "./charts/plot";
import { readTheme } from "./charts/theme";
import type { AppElements, FigureCardElements } from "./elements";
import { INCREMENTAL_COLUMNS, incrementalFigure, incrementalRows, type TimeAxis } from "./figures/incremental";
import { RANKINGS_COLUMNS, rankingsFigure, rankingsRows, type HeatmapScale } from "./figures/rankings";
import { TRAFFIC_COLUMNS, trafficFigure, trafficRows } from "./figures/traffic";
import { VERSIONS_COLUMNS, versionsFigure, versionsRows } from "./figures/versions";
import { initSearch } from "./search";
import { initSettings } from "./settings";
import { downloadCsv, fillTable } from "./table";

/** Where the modebar's "View source data on GitHub" button goes. */
export const SOURCE_DATA_URL = `https://github.com/${RESULTS_REPOSITORY}`;

const TOTALS: [keyof Totals, string][] = [
  ["runs", "Records"],
  ["machines", "Machines"],
  ["environments", "Environments"],
  ["benchmarks", "Benchmarks"],
  ["cases", "Test cases"],
];

function fillSelect(select: HTMLSelectElement, options: [string, string][], value: string): void {
  select.replaceChildren(
    ...options.map(([optionValue, label]) => {
      const option = h("option", null, label);
      option.value = optionValue;
      return option;
    }),
  );
  select.value = value;
}

function setNote(note: HTMLElement, text: string | null): void {
  note.hidden = text === null;
  note.textContent = text ?? "";
}

/** The width to lay a card's figure out at, with a fallback where layout is unavailable (tests). */
function figureWidth(card: FigureCardElements): number {
  const width = Math.floor(card.plot.clientWidth || card.card.clientWidth);
  return width > 0 ? width : 900;
}

export interface DashboardOptions {
  /** Downloads the published results again, for the refresh button. */
  refresh: () => Promise<Database>;
}

export interface Dashboard {
  /** Shows a newly loaded database: the manuscript view at `?manuscript`, else the URL's search. */
  show: (db: Database) => void;
  /** Says something about the results under the totals, such as that they could not be checked. */
  note: (text: string) => void;
}

export function createDashboard(
  els: AppElements,
  location: { search: string; hash: string; pathname: string },
  { refresh }: DashboardOptions,
): Dashboard {
  let db: Database | null = null;
  let index: SearchIndex = new Map();
  let dataset: Dataset | null = null;
  /** In the manuscript view each figure draws from its own selection (MANUSCRIPT_FIGURE_SELECTIONS). */
  let manuscript: Map<ManuscriptSelection, Dataset> | null = null;

  fillSelect(
    els.rankings.scale,
    [
      ["paper", "Fixed"],
      ["data", "Fitted to the data"],
    ],
    "paper",
  );
  fillSelect(els.traffic.metric, Object.entries(NETWORK_METRIC_LABELS), DEFAULT_NETWORK_METRIC);
  fillSelect(
    els.traffic.preload,
    [
      ["false", "Not preloaded"],
      ["true", "Preloaded"],
    ],
    "false",
  );
  fillSelect(
    els.versions.benchmark,
    [
      ["time_remote_file_reading", "Remote file opening, PyNWB"],
      ["time_remote_slicing", "Remote slicing, PyNWB"],
    ],
    "time_remote_file_reading",
  );
  fillSelect(
    els.versions.axis,
    VERSION_AXES.map((axis) => [axis.id, axis.label]),
    "environment",
  );
  fillSelect(
    els.incremental.scale,
    [
      ["log", "Logarithmic"],
      ["linear", "Linear"],
    ],
    "log",
  );

  const search = initSearch(els.search, (query) => setQuery(query));
  describeManuscriptToggle();

  /** Draws a card's figure and fills its table, or says why there is nothing to show. */
  function finish<T>(
    card: FigureCardElements,
    name: string,
    columns: Column<T>[],
    rows: T[],
    empty: string,
    build: (options: FigureOptions) => FigureSpec,
  ): void {
    const options: FigureOptions = {
      width: figureWidth(card),
      theme: readTheme(),
      letters: manuscript !== null,
    };
    setNote(card.note, rows.length ? null : empty);
    if (card.viewPlot.checked)
      drawFigure(card.plot, rows.length ? build(options) : emptyFigure(options.theme, empty), name, SOURCE_DATA_URL);
    fillTable(card.table, columns, rows);
    card.csvBtn.disabled = rows.length === 0;
    card.csvBtn.onclick = () => downloadCsv(`${name}.csv`, columns, rows);
  }

  function renderRankingsCard(data: Dataset): void {
    const panels = methodRankings(data);
    const rows = rankingsRows(panels);
    finish(
      els.rankings,
      "method-rankings",
      RANKINGS_COLUMNS,
      rows,
      "No remote file-opening or slicing results match the search.",
      (options) => rankingsFigure(panels, els.rankings.scale.value as HeatmapScale, options),
    );
  }

  function renderTrafficCard(data: Dataset): void {
    const metric = els.traffic.metric.value;
    const fileOpen = [fileOpenTraffic(data, "backend", metric), fileOpenTraffic(data, "pynwb", metric)];
    const slicing = slicingTraffic(data, els.traffic.preload.value === "true", metric);
    finish(
      els.traffic,
      "network-traffic-vs-runtime",
      TRAFFIC_COLUMNS,
      trafficRows(fileOpen, slicing),
      "No pairs of network-tracking and timing results match the search.",
      (options) => trafficFigure(fileOpen, slicing, options),
    );
  }

  function renderVersionsCard(data: Dataset): void {
    const card = els.versions;
    const axis = VERSION_AXES.find((candidate) => candidate.id === card.axis.value) ?? VERSION_AXES[0];
    const figure = performanceAcrossVersions(data, card.benchmark.value as VersionsBenchmark, axis.id);
    const rows = versionsRows(figure);
    finish(
      card,
      "performance-across-versions",
      VERSIONS_COLUMNS,
      rows,
      "No PyNWB timing results match the search.",
      (options) => versionsFigure(figure, axis.label, options),
    );
    if (rows.length && figure.groups.length < 2) {
      setNote(
        card.note,
        `The selection holds a single ${axis.id === "environment" ? "software environment" : axis.label}: widen the search to compare several.`,
      );
    }
  }

  function renderIncrementalCard(data: Dataset): void {
    const panels = incrementalSlicing(data);
    finish(
      els.incremental,
      "incremental-slicing",
      INCREMENTAL_COLUMNS,
      incrementalRows(panels),
      "No incremental slicing results match the search. The benchmark first ran in the 2026-10-07 environment.",
      (options) => incrementalFigure(panels, els.incremental.scale.value as TimeAxis, options),
    );
  }

  const renderers: [FigureCardElements, (data: Dataset) => void, FigureId][] = [
    [els.rankings, renderRankingsCard, "rankings"],
    [els.traffic, renderTrafficCard, "traffic"],
    [els.versions, renderVersionsCard, "versions"],
    [els.incremental, renderIncrementalCard, "incremental"],
  ];

  function renderFigure(card: FigureCardElements, render: (data: Dataset) => void, figure: FigureId): void {
    const data = manuscript?.get(MANUSCRIPT_FIGURE_SELECTIONS[figure]) ?? dataset;
    if (!data) return;
    try {
      render(data);
    } catch (error) {
      console.error(error);
      clearFigure(card.plot);
      setNote(card.note, `This figure could not be drawn: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  function renderSummary(shown: Dataset): void {
    const totals = datasetTotals(shown);
    const row = h("tr");
    els.summary.totals.tBodies[0].replaceChildren(
      ...TOTALS.map(([key, label]) => {
        const item = row.cloneNode() as HTMLTableRowElement;
        item.append(h("th", null, label), h("td", null, totals[key].toLocaleString("en-US")));
        return item;
      }),
    );
  }

  /** The header button's state, and the tooltip that says what it does. */
  function describeManuscriptToggle(): void {
    const on = manuscript !== null;
    els.manuscriptToggle.setAttribute("aria-pressed", String(on));
    els.manuscriptToggle.setAttribute(
      "aria-label",
      on ? "Leave the manuscript's figures for every record" : "Show the manuscript's figures",
    );
    els.manuscriptTooltipText.textContent = on
      ? "Each figure is drawn as the manuscript draws it, panels lettered."
      : "Draws each figure as the NWB Benchmarks manuscript does, panels lettered.";
  }

  function renderAll(): void {
    if (!db || !dataset) return;
    describeManuscriptToggle();
    renderSummary(manuscript?.get("timepoints") ?? dataset);
    for (const renderer of renderers) renderFigure(...renderer);
  }

  function navigate(search: string): void {
    history.replaceState(null, "", `${location.pathname}${search}${location.hash}`);
    renderAll();
  }

  /** Shows the results a search selects, leaving the manuscript view. */
  function setQuery(query: string): void {
    if (!db) return;
    manuscript = null;
    const compiled = compileQuery(query, index);
    dataset = applyFilters(db, compiled.state);
    search.setNotes(compiled.problems, false);
    navigate(querySearch(query, location.search));
  }

  /** The manuscript's figures, each from its own selection and with the manuscript's figure settings. */
  function showManuscript(): void {
    if (!db) return;
    const loaded = db;
    manuscript = new Map(
      Object.entries(MANUSCRIPT_SELECTIONS).map(([name, selection]) => [
        name as ManuscriptSelection,
        applyFilters(loaded, selection),
      ]),
    );
    dataset = manuscript.get("reference") ?? null;
    els.rankings.scale.value = "paper";
    els.traffic.metric.value = DEFAULT_NETWORK_METRIC;
    els.traffic.preload.value = "false";
    els.versions.benchmark.value = "time_remote_file_reading";
    els.versions.axis.value = "environment";
    els.incremental.scale.value = "log";
    search.setQuery("");
    search.setNotes([MANUSCRIPT_DESCRIPTION, "Type a search to leave them for every record."], true);
    navigate(manuscriptSearch(location.search));
  }

  els.manuscriptToggle.addEventListener("click", () => {
    if (manuscript) {
      search.setQuery("");
      setQuery("");
    } else showManuscript();
  });

  for (const renderer of renderers) {
    const [card] = renderer;
    initSettings(card.settingsBtn, card.settings);
    for (const control of card.card.querySelectorAll("select"))
      control.addEventListener("change", () => renderFigure(...renderer));
    const showView = (): void => {
      const table = card.viewTable.checked;
      card.plot.hidden = table;
      card.tableView.hidden = !table;
      if (!table) renderFigure(...renderer);
    };
    card.viewPlot.addEventListener("change", showView);
    card.viewTable.addEventListener("change", showView);
  }

  els.summary.refreshBtn.addEventListener("click", () => {
    const button = els.summary.refreshBtn;
    button.disabled = true;
    button.setAttribute("aria-busy", "true");
    refresh()
      .then((loaded) => {
        setNote(els.summary.note, null);
        show(loaded);
      })
      .catch((error: unknown) => {
        setNote(
          els.summary.note,
          `The results could not be refreshed: ${error instanceof Error ? error.message : String(error)}`,
        );
      })
      .finally(() => {
        button.disabled = false;
        button.removeAttribute("aria-busy");
      });
  });

  // Redraws a figure when its width changes, so its layout follows the card.
  const widths = new Map<Element, number>();
  if (typeof ResizeObserver !== "undefined") {
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const width = Math.round(entry.contentRect.width);
        const previous = widths.get(entry.target);
        widths.set(entry.target, width);
        if (previous === undefined || previous === width || width === 0) continue;
        const match = renderers.find(([card]) => card.plot === entry.target);
        if (match) renderFigure(...match);
      }
    });
    for (const [card] of renderers) observer.observe(card.plot);
  }

  // Plotly draws in literal colors, so the figures are drawn again when the theme changes.
  new MutationObserver(renderAll).observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["data-theme"],
  });
  if ("matchMedia" in window) window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", renderAll);

  function show(loaded: Database): void {
    db = loaded;
    index = buildSearchIndex(loaded);
    search.setIndex(index);
    const latest = latestRunDate(loaded.runs);
    els.summary.updated.textContent = latest ? `Last updated ${latest}` : "";
    if (isManuscriptSearch(location.search)) showManuscript();
    else {
      const query = queryFromSearch(location.search);
      search.setQuery(query);
      setQuery(query);
    }
  }

  return { show, note: (text) => setNote(els.summary.note, text) };
}
