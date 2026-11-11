// Each figure, drawn by its real renderer from the synthesized bundle `?test&mock_data` loads, in
// both themes. The panels fall back to their fixed default width outside a laid-out page, so every
// snapshot comes out alike.
import { readDatabase } from "../src/lib/database";
import { ALL_DATA, applyFilters } from "../src/lib/filters";
import { extrapolations } from "../src/lib/figures/extrapolation";
import { incrementalSlicing } from "../src/lib/figures/incremental";
import { methodRankings } from "../src/lib/figures/rankings";
import { fileOpenTraffic, slicingTraffic } from "../src/lib/figures/traffic";
import { performanceAcrossVersions } from "../src/lib/figures/versions";
import { synthesizeMockBundle } from "../src/lib/mockBundle";
import { createTooltip, renderLegend, type LegendEntry } from "../src/ui/charts/chrome";
import { extrapolationLegend, renderExtrapolation } from "../src/ui/figures/extrapolation";
import { incrementalLegend, renderIncremental } from "../src/ui/figures/incremental";
import { renderRankings } from "../src/ui/figures/rankings";
import { renderTraffic, trafficLegend } from "../src/ui/figures/traffic";
import { renderVersions, versionsLegend } from "../src/ui/figures/versions";
import { withTheme } from "./utils";

const dataset = applyFilters(readDatabase(synthesizeMockBundle()), ALL_DATA);
const tooltip = createTooltip(document.createElement("div"));

function figureCard(draw: (target: HTMLDivElement) => LegendEntry[]): HTMLElement {
  const card = document.createElement("section");
  card.className = "card figure-card";
  card.style.maxWidth = "1100px";
  card.style.margin = "1.5rem auto";
  const target = document.createElement("div");
  target.className = "figure-panels";
  const legend = document.createElement("ul");
  legend.className = "chart-legend";
  card.append(target, legend);
  renderLegend(legend, draw(target));
  return card;
}

const FIGURES: Record<string, () => HTMLElement> = {
  Rankings: () =>
    figureCard((target) => {
      renderRankings(target, methodRankings(dataset), "paper", tooltip);
      return [];
    }),
  Traffic: () =>
    figureCard((target) => {
      const fileOpen = [fileOpenTraffic(dataset, "backend"), fileOpenTraffic(dataset, "pynwb")];
      const slicing = slicingTraffic(dataset, true);
      renderTraffic(target, fileOpen, slicing, tooltip);
      return trafficLegend(fileOpen, slicing);
    }),
  Versions: () =>
    figureCard((target) => {
      const figure = performanceAcrossVersions(dataset, "time_remote_file_reading");
      renderVersions(target, figure, "Software environment", tooltip);
      return versionsLegend(figure);
    }),
  Extrapolation: () =>
    figureCard((target) => {
      const fits = extrapolations(dataset);
      renderExtrapolation(target, fits, false, tooltip);
      return extrapolationLegend(fits, false);
    }),
  Incremental: () =>
    figureCard((target) => {
      const panels = incrementalSlicing(dataset);
      renderIncremental(target, panels, "log", tooltip);
      return incrementalLegend(panels);
    }),
};

export default {
  title: "Components/Figures",
};

export const RankingsLight = { name: "Method rankings (light)", render: () => withTheme("light", FIGURES.Rankings) };
export const RankingsDark = { name: "Method rankings (dark)", render: () => withTheme("dark", FIGURES.Rankings) };
export const TrafficLight = { name: "Traffic vs runtime (light)", render: () => withTheme("light", FIGURES.Traffic) };
export const TrafficDark = { name: "Traffic vs runtime (dark)", render: () => withTheme("dark", FIGURES.Traffic) };
export const VersionsLight = { name: "Across versions (light)", render: () => withTheme("light", FIGURES.Versions) };
export const VersionsDark = { name: "Across versions (dark)", render: () => withTheme("dark", FIGURES.Versions) };
export const ExtrapolationLight = {
  name: "Download vs streaming (light)",
  render: () => withTheme("light", FIGURES.Extrapolation),
};
export const ExtrapolationDark = {
  name: "Download vs streaming (dark)",
  render: () => withTheme("dark", FIGURES.Extrapolation),
};
export const IncrementalLight = {
  name: "Incremental slicing (light)",
  render: () => withTheme("light", FIGURES.Incremental),
};
export const IncrementalDark = {
  name: "Incremental slicing (dark)",
  render: () => withTheme("dark", FIGURES.Incremental),
};
