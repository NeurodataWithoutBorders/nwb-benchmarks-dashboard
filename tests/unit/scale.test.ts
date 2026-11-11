import { describe, expect, it } from "vitest";
import { extent, linearScale, logScale, niceDomain, niceTicks } from "../../src/lib/scale";

describe("niceTicks", () => {
  it("picks round steps", () => {
    expect(niceTicks(0, 10, 5)).toEqual([0, 2, 4, 6, 8, 10]);
    expect(niceTicks(0, 1, 4)).toEqual([0, 0.25, 0.5, 0.75, 1]);
    expect(niceTicks(3, 3)).toEqual([3]);
    expect(niceTicks(Number.NaN, 1)).toEqual([]);
  });

  it("extends a domain to its ticks", () => {
    expect(niceDomain(0.3, 9.2, 5)).toEqual([0, 10]);
    expect(niceDomain(0, 0)).toEqual([0, 1]);
    expect(niceDomain(5, 5)).toEqual([0, 5.5]);
  });
});

describe("linearScale", () => {
  it("maps the domain onto the range", () => {
    const scale = linearScale([0, 10], [100, 0]);
    expect(scale(0)).toBe(100);
    expect(scale(5)).toBe(50);
    expect(scale.log).toBe(false);
    expect(scale.ticks.length).toBeGreaterThan(2);
  });
});

describe("logScale", () => {
  it("maps decades evenly and labels each decade", () => {
    const scale = logScale([1, 1000], [0, 300]);
    expect(scale(10)).toBeCloseTo(100);
    expect(scale.ticks).toEqual([1, 10, 100, 1000]);
    expect(scale.minorTicks).toContain(20);
    expect(scale.log).toBe(true);
  });

  it("thins its labels over many decades", () => {
    expect(logScale([1e-6, 1e9], [0, 300]).ticks.length).toBeLessThanOrEqual(8);
  });

  it("labels 1, 2 and 5 multiples within one decade", () => {
    expect(logScale([1.5, 8], [0, 100]).ticks).toEqual([2, 5]);
  });
});

describe("extent", () => {
  it("pads the finite values", () => {
    expect(extent([0, 10])).toEqual([-0.5, 10.5]);
    expect(extent([2, 2])?.map((value) => Number(value.toFixed(2)))).toEqual([1.78, 2.22]);
    expect(extent([0, 0])).toEqual([-1.1, 1.1]);
    expect(extent([Number.NaN])).toBe(null);
  });

  it("keeps a log extent positive", () => {
    expect(extent([0, 10, 100], { log: true, pad: 0 })).toEqual([10, 100]);
    expect(extent([10, 10], { log: true })).toEqual([5, 20]);
  });
});
