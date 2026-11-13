import { defineConfig } from "vitest/config";
import { createVitestConfig } from "@brain-bbqs/config/vitest";

export default defineConfig(
  createVitestConfig({
    rootDir: new URL("..", import.meta.url),
    // Pure-logic suites run under node; a suite that needs a DOM opts in with a
    // `// @vitest-environment jsdom` docblock on its first line.
    environment: "node",
    // Ratchet thresholds: set just below the current measured coverage so any regression fails
    // locally (and in CI) before the Codecov upload. Raise these as coverage improves; they are
    // not a target, only a floor.
    thresholds: {
      statements: 99.3,
      branches: 93.5,
      functions: 99.9,
      lines: 99.9,
    },
    overrides: {
      test: {
        // Plotly cannot draw in jsdom; every suite gets a recording stand-in for it.
        setupFiles: ["tests/unit/helpers/plotlyMock.ts"],
        // Vitest 5 clears mocks before each test by default. The boot suites here import the app
        // once in `beforeAll` and assert on what it did across multiple `it` blocks, so restore the
        // pre-v5 behavior of leaving mocks alone between tests.
        clearMocks: false,
      },
    },
  }),
);
