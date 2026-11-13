import { defineConfig } from "vite";
import { createViteConfig, prePaintPlugin } from "@brain-bbqs/config/vite";
// With the extension: Vite's native config loader (its future default) refuses extensionless
// imports between config files.
import { THEME_KEY } from "../src/lib/settings.ts";

export default defineConfig(
  createViteConfig({
    rootDir: new URL("..", import.meta.url),
    overrides: {
      plugins: [prePaintPlugin({ themeKey: THEME_KEY })],
      build: {
        // Plotly, the figures' one runtime dependency, is most of the page's script (about 1.4 MB,
        // 0.5 MB gzipped): it gets a chunk of its own, which a browser keeps cached across releases.
        chunkSizeWarningLimit: 1500,
        rolldownOptions: { output: { codeSplitting: { groups: [{ name: "plotly", test: /plotly\.js/ }] } } },
      },
    },
  }),
);
