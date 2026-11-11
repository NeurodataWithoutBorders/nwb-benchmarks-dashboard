// The dashboard once results are loaded: the data summary, the filters, and the five figure cards,
// each recomputed from the filtered data whenever the filters or its own controls change.

import { h } from "@brain-bbqs/ui";
import { RESULTS_REPOSITORY } from "../lib/bundle";
import type { Column } from "../lib/csv";
import { latestRunDate, type Database } from "../lib/database";
import { extrapolations } from "../lib/figures/extrapolation";
import { incrementalSlicing } from "../lib/figures/incremental";
import { methodRankings } from "../lib/figures/rankings";
import { DEFAULT_NETWORK_METRIC, fileOpenTraffic, slicingTraffic } from "../lib/figures/traffic";
import { VERSION_AXES, performanceAcrossVersions, type VersionsBenchmark } from "../lib/figures/versions";
import {
  MANUSCRIPT_FIGURE_SELECTIONS,
  MANUSCRIPT_SELECTIONS,
  applyFilters,
  cloneState,
  defaultState,
  isManuscriptSearch,
  manuscriptSearch,
  stateFromSearch,
  stateToSearch,
  type Dataset,
  type FigureId,
  type FilterState,
  type ManuscriptSelection,
} from "../lib/filters";
import { NETWORK_METRIC_LABELS } from "../lib/methods";
import { createTooltip, renderLegend, setNote, type LegendEntry, type Tooltip } from "./charts/chrome";
import type { AppElements, FigureCardElements } from "./elements";
import { figureSvg } from "./export";
import { initFilters } from "./filters";
import { EXTRAPOLATION_COLUMNS, extrapolationLegend, renderExtrapolation, uncrossed } from "./figures/extrapolation";
import {
  INCREMENTAL_COLUMNS,
  incrementalLegend,
  incrementalRows,
  renderIncremental,
  type TimeAxis,
} from "./figures/incremental";
import { RANKINGS_COLUMNS, rankingsRows, renderRankings, type HeatmapScale } from "./figures/rankings";
import { TRAFFIC_COLUMNS, renderTraffic, trafficLegend, trafficRows } from "./figures/traffic";
import { VERSIONS_COLUMNS, renderVersions, versionsLegend, versionsRows } from "./figures/versions";
import { downloadCsv, downloadText, fillTable } from "./table";

/** "1 machine", "34 machines". */
function count(n: number, noun: string): string {
  return `${n.toLocaleString("en-US")} ${noun}${n === 1 ? "" : "s"}`;
}

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

const PRELOAD_OPTIONS: [string, string][] = [
  ["false", "Not preloaded"],
  ["true", "Preloaded"],
];

/** Writes the current figure's data into its card's table and download buttons. */
function wireOutputs<T>(card: FigureCardElements, name: string, columns: Column<T>[], rows: T[], title: string): void {
  fillTable(card.table, columns, rows);
  card.csvBtn.disabled = rows.length === 0;
  card.csvBtn.onclick = () => downloadCsv(`${name}.csv`, columns, rows);
  card.svgBtn.disabled = rows.length === 0;
  card.svgBtn.onclick = () => downloadText(`${name}.svg`, figureSvg(card.figure, card.legend, title), "image/svg+xml");
}

function finish<T>(
  card: FigureCardElements,
  name: string,
  title: string,
  legend: LegendEntry[],
  columns: Column<T>[],
  rows: T[],
): void {
  renderLegend(card.legend, rows.length ? legend : []);
  wireOutputs(card, name, columns, rows, title);
}

export interface Dashboard {
  /** Shows a newly loaded database: the manuscript view at `?manuscript`, else the URL's filters, else
   * every result. */
  show: (db: Database, source: string) => void;
}

export function createDashboard(
  els: AppElements,
  location: { search: string; hash: string; pathname: string },
): Dashboard {
  const tooltip: Tooltip = createTooltip(els.tooltip);
  let db: Database | null = null;
  let state: FilterState = defaultState();
  let dataset: Dataset | null = null;
  /** In the manuscript view each figure draws from its own selection (MANUSCRIPT_FIGURE_SELECTIONS). */
  let manuscript: Map<ManuscriptSelection, Dataset> | null = null;

  fillSelect(
    els.rankings.scale,
    [
      ["paper", "The paper's (0–4 s, 0–200 s, 0–10 s)"],
      ["data", "Fitted to the data"],
    ],
    "paper",
  );
  fillSelect(els.traffic.metric, Object.entries(NETWORK_METRIC_LABELS), DEFAULT_NETWORK_METRIC);
  fillSelect(els.traffic.preload, PRELOAD_OPTIONS, "false");
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
  fillSelect(els.extrapolation.preload, PRELOAD_OPTIONS, "false");
  fillSelect(
    els.incremental.scale,
    [
      ["linear", "Linear"],
      ["log", "Logarithmic"],
    ],
    "linear",
  );

  const filters = initFilters(els.filters, {
    onChange: (next) => setState(next),
    onManuscript: () => showManuscript(),
  });

  function renderRankingsCard(data: Dataset): void {
    const card = els.rankings;
    const panels = methodRankings(data);
    const rows = rankingsRows(panels);
    setNote(card.note, rows.length ? null : "No remote file-opening or slicing results match the filters.");
    renderRankings(card.figure, rows.length ? panels : [], els.rankings.scale.value as HeatmapScale, tooltip);
    finish(card, "method-rankings", "Which method is fastest?", [], RANKINGS_COLUMNS, rows);
  }

  function renderTrafficCard(data: Dataset): void {
    const card = els.traffic;
    const metric = card.metric.value;
    const fileOpen = [fileOpenTraffic(data, "backend", metric), fileOpenTraffic(data, "pynwb", metric)];
    const slicing = slicingTraffic(data, card.preload.value === "true", metric);
    const rows = trafficRows(fileOpen, slicing);
    setNote(card.note, rows.length ? null : "No pairs of network-tracking and timing results match the filters.");
    if (rows.length) renderTraffic(card.figure, fileOpen, slicing, tooltip);
    else card.figure.replaceChildren();
    finish(
      card,
      "network-traffic-vs-runtime",
      "What makes some methods faster?",
      trafficLegend(fileOpen, slicing),
      TRAFFIC_COLUMNS,
      rows,
    );
  }

  function renderVersionsCard(data: Dataset): void {
    const card = els.versions;
    const axis = VERSION_AXES.find((candidate) => candidate.id === card.axis.value) ?? VERSION_AXES[0];
    const figure = performanceAcrossVersions(data, card.benchmark.value as VersionsBenchmark, axis.id);
    const rows = versionsRows(figure);
    let note: string | null = null;
    if (rows.length === 0) note = "No PyNWB timing results match the filters.";
    else if (figure.groups.length < 2) {
      note = `The selection holds a single ${axis.id === "environment" ? "software environment" : axis.label}: select more in the filters to compare them.`;
    }
    setNote(card.note, note);
    if (rows.length) renderVersions(card.figure, figure, axis.label, tooltip);
    else card.figure.replaceChildren();
    finish(
      card,
      "performance-across-versions",
      "How does performance change across versions?",
      versionsLegend(figure),
      VERSIONS_COLUMNS,
      rows,
    );
  }

  function renderExtrapolationCard(data: Dataset): void {
    const card = els.extrapolation;
    const preloaded = card.preload.value === "true";
    const fits = extrapolations(data);
    const missing = uncrossed(fits, preloaded);
    let note: string | null = null;
    if (fits.length === 0)
      note =
        "Comparing needs remote and local slicing, local file opening and download results; the filters leave none.";
    else if (missing.length) {
      const list = missing.join(", ");
      note = `No crossover in the positive quadrant, so not drawn: ${list}${list.endsWith(".") ? "" : "."}`;
    }
    setNote(card.note, note);
    if (fits.length) renderExtrapolation(card.figure, fits, preloaded, tooltip);
    else card.figure.replaceChildren();
    finish(
      card,
      "download-vs-streaming-extrapolation",
      "When is downloading first faster than streaming?",
      extrapolationLegend(fits, preloaded),
      EXTRAPOLATION_COLUMNS,
      fits.filter((fit) => fit.isPreloaded === preloaded),
    );
  }

  function renderIncrementalCard(data: Dataset): void {
    const card = els.incremental;
    const panels = incrementalSlicing(data);
    const rows = incrementalRows(panels);
    setNote(
      card.note,
      rows.length
        ? null
        : "No incremental slicing results match the filters. The benchmark first ran in the 2026-10-07 environment.",
    );
    if (rows.length) renderIncremental(card.figure, panels, card.scale.value as TimeAxis, tooltip);
    else card.figure.replaceChildren();
    finish(
      card,
      "incremental-slicing",
      "Streaming a whole file, slice by slice",
      incrementalLegend(panels),
      INCREMENTAL_COLUMNS,
      rows,
    );
  }

  const renderers: [FigureCardElements, (data: Dataset) => void, FigureId][] = [
    [els.rankings, renderRankingsCard, "rankings"],
    [els.traffic, renderTrafficCard, "traffic"],
    [els.versions, renderVersionsCard, "versions"],
    [els.extrapolation, renderExtrapolationCard, "extrapolation"],
    [els.incremental, renderIncrementalCard, "incremental"],
  ];

  function renderFigure(card: FigureCardElements, render: (data: Dataset) => void, figure: FigureId): void {
    const data = manuscript?.get(MANUSCRIPT_FIGURE_SELECTIONS[figure]) ?? dataset;
    if (!data) return;
    try {
      render(data);
    } catch (error) {
      console.error(error);
      card.figure.replaceChildren();
      setNote(card.note, `This figure could not be drawn: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  function renderAll(): void {
    if (!db || !dataset) return;
    filters.render(db, state, dataset, manuscript !== null);
    for (const renderer of renderers) renderFigure(...renderer);
  }

  function navigate(search: string): void {
    history.replaceState(null, "", `${location.pathname}${search}${location.hash}`);
    tooltip.hide();
    renderAll();
  }

  /** Any change to the filters leaves the manuscript view for the edited selection. */
  function setState(next: FilterState): void {
    if (!db) return;
    manuscript = null;
    state = next;
    dataset = applyFilters(db, state);
    navigate(stateToSearch(state, location.search));
  }

  /** The manuscript's figures, each from its own selection and with the paper's figure settings. */
  function showManuscript(): void {
    if (!db) return;
    const loaded = db;
    manuscript = new Map(
      Object.entries(MANUSCRIPT_SELECTIONS).map(([name, selection]) => [
        name as ManuscriptSelection,
        applyFilters(loaded, selection),
      ]),
    );
    // The filters show the reference selection, the one most figures use, to edit from.
    state = cloneState(MANUSCRIPT_SELECTIONS.reference);
    dataset = manuscript.get("reference") ?? null;
    els.rankings.scale.value = "paper";
    els.traffic.metric.value = DEFAULT_NETWORK_METRIC;
    els.traffic.preload.value = "false";
    els.versions.benchmark.value = "time_remote_file_reading";
    els.versions.axis.value = "environment";
    els.extrapolation.preload.value = "false";
    els.incremental.scale.value = "linear";
    navigate(manuscriptSearch(location.search));
  }

  for (const renderer of renderers) {
    for (const control of renderer[0].card.querySelectorAll("select"))
      control.addEventListener("change", () => renderFigure(...renderer));
  }

  // Re-draws a figure when its width changes, so its text stays at its real size.
  const widths = new Map<Element, number>();
  if (typeof ResizeObserver !== "undefined") {
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const width = Math.round(entry.contentRect.width);
        const previous = widths.get(entry.target);
        widths.set(entry.target, width);
        if (previous === undefined || previous === width) continue;
        const match = renderers.find(([card]) => card.figure === entry.target);
        if (match) renderFigure(...match);
      }
    });
    for (const [card] of renderers) observer.observe(card.figure);
  }

  return {
    show(loaded, source) {
      db = loaded;
      const latest = latestRunDate(loaded.runs);
      const skipped = loaded.skipped.outdated
        ? ` ${loaded.skipped.outdated.toLocaleString("en-US")} results files in formats older than the figures read are left out.`
        : "";
      els.dataSummary.textContent =
        `${count(loaded.runs.length, "results file")} from ${count(loaded.machines.size, "machine")} and ${count(loaded.environments.size, "software environment")}` +
        `${latest ? `, the latest from ${latest}` : ""}, ${source}.${skipped}`;
      if (isManuscriptSearch(location.search)) showManuscript();
      else setState(stateFromSearch(location.search) ?? defaultState());
    },
  };
}

export const PUBLISHED_SOURCE = `published by ${RESULTS_REPOSITORY}`;
