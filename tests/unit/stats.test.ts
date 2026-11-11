import { describe, expect, it } from "vitest";
import {
  bootstrapMeanInterval,
  groupBy,
  linearFit,
  mean,
  median,
  percentile,
  seededRandom,
  std,
  summarize,
} from "../../src/lib/stats";

describe("summary statistics, with pandas' conventions", () => {
  it("skips missing values", () => {
    expect(mean([1, Number.NaN, 3])).toBe(2);
    expect(median([3, Number.NaN, 1, 2])).toBe(2);
    expect(median([1, 2, 3, 4])).toBe(2.5);
    expect(std([2, 4, 4, 4, 5, 5, 7, 9])).toBeCloseTo(2.138, 3);
  });

  it("is NaN where undefined", () => {
    expect(mean([])).toBeNaN();
    expect(median([Number.NaN])).toBeNaN();
    expect(std([1])).toBeNaN();
    const empty = summarize([]);
    expect(empty.n).toBe(0);
    expect(empty.min).toBeNaN();
    expect(empty.max).toBeNaN();
  });

  it("summarizes", () => {
    expect(summarize([1, 2, 3])).toEqual({ n: 3, mean: 2, median: 2, std: 1, min: 1, max: 3 });
  });
});

describe("linearFit", () => {
  it("fits a least-squares line", () => {
    const fit = linearFit([0, 1, 2, 3], [1, 3, 5, 7]);
    expect(fit?.slope).toBeCloseTo(2);
    expect(fit?.intercept).toBeCloseTo(1);
  });

  it("skips non-finite points and refuses degenerate input", () => {
    expect(linearFit([0, 1, Number.NaN], [0, 1, 5])?.slope).toBeCloseTo(1);
    expect(linearFit([1], [1])).toBe(null);
    expect(linearFit([2, 2, 2], [1, 2, 3])).toBe(null);
  });
});

describe("bootstrapMeanInterval", () => {
  it("brackets the mean, the same way every time", () => {
    const values = [1, 2, 3, 4, 5, 6, 7, 8];
    const interval = bootstrapMeanInterval(values) as [number, number];
    expect(interval[0]).toBeLessThan(4.5);
    expect(interval[1]).toBeGreaterThan(4.5);
    expect(bootstrapMeanInterval(values)).toEqual(interval);
  });

  it("has no interval below two values", () => {
    expect(bootstrapMeanInterval([1])).toBe(null);
  });
});

describe("helpers", () => {
  it("draws the same sequence from the same seed", () => {
    const a = seededRandom(7);
    const b = seededRandom(7);
    expect([a(), a(), a()]).toEqual([b(), b(), b()]);
  });

  it("interpolates percentiles as numpy does", () => {
    expect(percentile([1, 2, 3, 4], 50)).toBe(2.5);
    expect(percentile([], 50)).toBeNaN();
  });

  it("groups by a composite key in first-seen order", () => {
    const groups = groupBy([1, 2, 3, 4], (value) => [value % 2] as const);
    expect([...groups.values()].map((group) => group.items)).toEqual([
      [1, 3],
      [2, 4],
    ]);
  });
});
