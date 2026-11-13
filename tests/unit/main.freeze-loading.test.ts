// @vitest-environment jsdom
// Boots under `?test&freeze_loading`: the loading card holds part-way through a download.
import { beforeAll, describe, expect, it } from "vitest";
import { bootMain, el } from "./helpers/mainHarness";

beforeAll(async () => {
  await bootMain("?test&freeze_loading");
});

describe("main.ts boot with ?test&freeze_loading", () => {
  it("holds the loading card at a fixed progress", () => {
    expect(el("load-card").hidden).toBe(false);
    expect(el("dashboard").hidden).toBe(true);
    expect(el("load-status").textContent).toBe("Downloading the latest results… 793 KB of 1.9 MB");
    expect(el("load-progress-fill").style.width).toBe("41%");
    expect(el("load-error").hidden).toBe(true);
  });
});
