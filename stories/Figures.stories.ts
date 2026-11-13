// Each figure, built by its real spec builder from the synthesized bundle `?test&mock_data` loads
// and drawn by Plotly with the app's config, in both themes. The figure is drawn in `play`, once the
// story's card is in the page (Plotly measures what it draws into), at a fixed width so every
// snapshot comes out alike; Chromatic waits for `play` before it takes the snapshot.
import Plotly from "plotly.js-cartesian-dist-min";
import { readDatabase } from "../src/lib/database";
import { ALL_DATA, applyFilters } from "../src/lib/filters";
import { incrementalSlicing } from "../src/lib/figures/incremental";
import { methodRankings } from "../src/lib/figures/rankings";
import { fileOpenTraffic, slicingTraffic } from "../src/lib/figures/traffic";
import { performanceAcrossVersions } from "../src/lib/figures/versions";
import { synthesizeMockBundle } from "../src/lib/mockBundle";
import { plotConfig, type FigureOptions, type FigureSpec } from "../src/ui/charts/plot";
import { readTheme } from "../src/ui/charts/theme";
import { SOURCE_DATA_URL } from "../src/ui/dashboard";
import { incrementalFigure } from "../src/ui/figures/incremental";
import { rankingsFigure } from "../src/ui/figures/rankings";
import { trafficFigure } from "../src/ui/figures/traffic";
import { versionsFigure } from "../src/ui/figures/versions";
import { withTheme } from "./utils";

const dataset = applyFilters(readDatabase(synthesizeMockBundle()), ALL_DATA);
const WIDTH = 1050;

type Build = (options: FigureOptions) => FigureSpec;

const FIGURES: Record<string, Build> = {
  rankings: (options) => rankingsFigure(methodRankings(dataset), "paper", options),
  traffic: (options) =>
    trafficFigure(
      [fileOpenTraffic(dataset, "backend"), fileOpenTraffic(dataset, "pynwb")],
      slicingTraffic(dataset, true),
      options,
    ),
  versions: (options) =>
    versionsFigure(performanceAcrossVersions(dataset, "time_remote_file_reading"), "Software environment", options),
  incremental: (options) => incrementalFigure(incrementalSlicing(dataset), "log", options),
};

function figureCard(): HTMLElement {
  const card = document.createElement("section");
  card.className = "card figure-card";
  card.style.width = `${WIDTH + 50}px`;
  card.style.margin = "1.5rem auto";
  const plot = document.createElement("div");
  plot.className = "figure-plot";
  plot.style.width = `${WIDTH}px`;
  card.append(plot);
  return card;
}

function story(name: string, theme: "light" | "dark", figure: string, letters = false) {
  return {
    name,
    render: () => withTheme(theme, figureCard),
    play: async ({ canvasElement }: { canvasElement: HTMLElement }) => {
      const plot = canvasElement.querySelector<HTMLElement>(".figure-plot") as HTMLElement;
      const spec = FIGURES[figure]({ width: WIDTH, theme: readTheme(), letters });
      await Plotly.react(plot, spec.data as Plotly.Data[], spec.layout, plotConfig(figure, SOURCE_DATA_URL));
    },
  };
}

export default {
  title: "Components/Figures",
};

export const RankingsLight = story("Method rankings (light)", "light", "rankings");
export const RankingsDark = story("Method rankings (dark)", "dark", "rankings");
export const RankingsManuscript = story("Method rankings, lettered (manuscript view)", "light", "rankings", true);
export const TrafficLight = story("Traffic vs runtime (light)", "light", "traffic");
export const TrafficDark = story("Traffic vs runtime (dark)", "dark", "traffic");
export const VersionsLight = story("Across versions (light)", "light", "versions");
export const VersionsDark = story("Across versions (dark)", "dark", "versions");
export const IncrementalLight = story("Incremental slicing (light)", "light", "incremental");
export const IncrementalDark = story("Incremental slicing (dark)", "dark", "incremental");
