// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createTooltip,
  emptyPanel,
  onHover,
  panelSlots,
  renderLegend,
  setNote,
  slotWidth,
} from "../../src/ui/charts/chrome";
import {
  annotation,
  band,
  createPanel,
  cross,
  errorBar,
  hitTarget,
  line,
  marker,
  throughputLines,
} from "../../src/ui/charts/svg";

afterEach(() => {
  document.body.replaceChildren();
});

describe("createPanel", () => {
  it("draws a log-log panel with its ticks, titles and clip", () => {
    const panel = createPanel({
      width: 400,
      height: 300,
      title: "Ecephys",
      x: { log: true, domain: [1e3, 1e9], label: "Bytes", format: String },
      y: { log: true, domain: [0.1, 100], label: "Runtime (s)", format: String },
    });
    expect(panel.svg.getAttribute("viewBox")).toBe("0 0 400 300");
    expect(panel.svg.getAttribute("aria-label")).toBe("Ecephys");
    expect(panel.svg.querySelector(".panel-title")?.textContent).toBe("Ecephys");
    expect(panel.svg.querySelectorAll("text.tick").length).toBe(panel.x.ticks.length + panel.y.ticks.length);
    expect(panel.svg.querySelector("clipPath rect")).not.toBeNull();
    expect(panel.x(1e3)).toBe(panel.inner.left);
  });

  it("takes given ticks for a categorical axis, and a margin", () => {
    const panel = createPanel({
      width: 300,
      height: 200,
      title: "t",
      x: { domain: [-0.5, 1.5], label: "x", ticks: [0, 1], format: (value) => ["a", "b"][value] },
      y: { domain: [0, 10], label: "y", format: String },
      margin: { bottom: 80 },
      description: "described",
    });
    expect([...panel.svg.querySelectorAll("text.tick")].slice(0, 2).map((text) => text.textContent)).toEqual([
      "a",
      "b",
    ]);
    expect(panel.inner.bottom).toBe(120);
    expect(panel.svg.getAttribute("aria-label")).toBe("described");
  });
});

describe("marks", () => {
  it("draws lines with their dash patterns, skipping missing points", () => {
    expect(
      line(
        [
          [0, 0],
          [1, Number.NaN],
          [2, 2],
        ],
        "red",
      ).getAttribute("d"),
    ).toBe("M0.00,0.00L2.00,2.00");
    expect(line([[0, 0]], "red", "dashed").getAttribute("stroke-dasharray")).toBe("7 4");
    expect(line([[0, 0]], "red", "dashdot").getAttribute("stroke-dasharray")).toBe("8 3 2 3");
    expect(line([[0, 0]], "red").hasAttribute("stroke-dasharray")).toBe(false);
  });

  it("draws every marker shape and the other marks", () => {
    expect(marker("circle", 1, 1, "red").tagName).toBe("circle");
    expect(marker("square", 1, 1, "red").tagName).toBe("rect");
    expect(marker("triangle", 1, 1, "red").tagName).toBe("polygon");
    expect(
      band(
        [
          [0, 1],
          [1, 1],
        ],
        [
          [0, 0],
          [1, 0],
        ],
        "red",
      ).getAttribute("d"),
    ).toMatch(/Z$/);
    expect(cross(5, 5, "red").getAttribute("d")).toContain("M0,0L10,10");
    expect(errorBar(5, 1, 9, "red").getAttribute("d")).toContain("M5,1L5,9");
    expect(hitTarget(1, 2).getAttribute("r")).toBe("12");
    expect(annotation(1, 2, "5").textContent).toBe("5");
  });

  it("labels throughput lines where they leave the plot", () => {
    const panel = createPanel({
      width: 400,
      height: 300,
      title: "t",
      x: { log: true, domain: [1e6, 1e9], label: "x", format: String },
      y: { log: true, domain: [0.1, 1000], label: "y", format: String },
    });
    throughputLines(panel, [0.0001, 1, 10]);
    const labels = [...panel.overlay.querySelectorAll(".guide-label")].map((text) => text.textContent);
    expect(labels).toEqual(["1 MB/s", "10 MB/s"]);
    expect(panel.plot.querySelectorAll("path").length).toBe(3);
  });
});

describe("chrome", () => {
  it("lays out panel slots and measures them", () => {
    const target = document.createElement("div");
    const slots = panelSlots(target, 3, 300);
    expect(slots).toHaveLength(3);
    expect(target.style.getPropertyValue("--panel-min")).toBe("300px");
    expect(slotWidth(slots[0])).toBe(460);
    Object.defineProperty(slots[1], "clientWidth", { value: 333.7 });
    expect(slotWidth(slots[1])).toBe(333);
  });

  it("fills a legend, hiding it when empty", () => {
    const list = document.createElement("ul");
    renderLegend(
      list,
      [
        { label: "A", color: "red", marker: "square" },
        { label: "B", color: "blue", lineStyle: null },
      ],
      "Methods",
    );
    expect([...list.querySelectorAll("li")].map((item) => item.textContent)).toEqual(["Methods", "A", "B"]);
    expect(list.querySelectorAll("li")[2].querySelector("path")).toBeNull();
    renderLegend(list, []);
    expect(list.hidden).toBe(true);
  });

  it("shows a tooltip near the pointer, through textContent", () => {
    const element = document.createElement("div");
    document.body.append(element);
    const tooltip = createTooltip(element);
    const target = document.createElement("div");
    onHover(target, tooltip, "<b>title</b>", () => [
      { label: "mean", value: "1 s", color: "red" },
      { label: "n", value: "3" },
    ]);
    target.dispatchEvent(Object.assign(new Event("pointermove"), { clientX: 10, clientY: 20 }));
    expect(element.hidden).toBe(false);
    expect(element.querySelector(".chart-tooltip-title")?.textContent).toBe("<b>title</b>");
    expect(element.querySelectorAll(".chart-tooltip-row")).toHaveLength(2);
    expect(element.style.left).toBe("24px");
    target.dispatchEvent(new Event("pointerleave"));
    expect(element.hidden).toBe(true);
  });

  it("keeps a tooltip inside the window", () => {
    const element = document.createElement("div");
    document.body.append(element);
    vi.spyOn(element, "getBoundingClientRect").mockReturnValue({ width: 200, height: 100 } as DOMRect);
    createTooltip(element).show({ clientX: window.innerWidth - 10, clientY: window.innerHeight - 10 }, "t", []);
    expect(element.style.left).toBe(`${window.innerWidth - 10 - 14 - 200}px`);
  });

  it("shows and hides notes and empty panels", () => {
    const note = document.createElement("p");
    setNote(note, "Careful");
    expect(note.hidden).toBe(false);
    setNote(note, null);
    expect(note.hidden).toBe(true);
    const slot = document.createElement("div");
    emptyPanel(slot, "Ophys");
    expect(slot.textContent).toBe("OphysNo data");
  });
});
