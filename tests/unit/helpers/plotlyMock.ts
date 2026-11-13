// Plotly cannot draw in jsdom (it measures text and needs a real layout), so every unit suite gets
// this stand-in for it, registered as a setup file in configs/vitest.config.ts. It records what it
// was asked to draw, so a suite can check a figure's spec (see lastPlot) rather than its pixels,
// which the Chromatic snapshots cover.
import { vi } from "vitest";

vi.mock("plotly.js-cartesian-dist-min", () => ({
  default: {
    react: vi.fn(() => Promise.resolve()),
    purge: vi.fn(),
    downloadImage: vi.fn(() => Promise.resolve("")),
    Icons: { camera: { width: 1000, height: 1000, path: "M0 0" } },
  },
}));
