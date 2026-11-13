import { describe, expect, it } from "vitest";
import {
  formatCompact,
  formatDecimalBytes,
  formatG,
  formatMetric,
  formatSeconds,
  formatTick,
} from "../../src/lib/format";

describe("formatG, Python's '.3g'", () => {
  it.each([
    [0.0715, "0.0715"],
    [382.4, "382"],
    [5.4712e-5, "5.47e-05"],
    [1074.2, "1.07e+03"],
    [0.721, "0.721"],
    [16, "16"],
    [2.5, "2.5"],
    [0, "0"],
    [-0.00001234, "-1.23e-05"],
    [999.6, "1e+03"],
    [Number.NaN, "nan"],
    [Number.POSITIVE_INFINITY, "inf"],
    [Number.NEGATIVE_INFINITY, "-inf"],
  ])("%s → %s", (value, text) => {
    expect(formatG(value)).toBe(text);
  });

  it("takes a precision", () => {
    expect(formatG(1234.4, 4)).toBe("1234");
    expect(formatG(2e10, 1)).toBe("2e+10");
  });
});

describe("axis and value formats", () => {
  it.each([
    [0, "0"],
    [0.5, "0.5"],
    [10, "10"],
    [1000, "1k"],
    [12_000_000, "12M"],
    [1e18, "1e+03P"],
  ])("formatCompact(%s) → %s", (value, text) => {
    expect(formatCompact(value)).toBe(text);
  });

  it("labels linear ticks plainly below a thousand", () => {
    expect(formatTick(250)).toBe("250");
    expect(formatTick(15000)).toBe("15k");
  });

  it("formats seconds, bytes and metrics", () => {
    expect(formatSeconds(1.234)).toBe("1.23 s");
    expect(formatSeconds(Number.NaN)).toBe("–");
    expect(formatDecimalBytes(5_400_000)).toBe("5.4 MB");
    expect(formatDecimalBytes(Number.NaN)).toBe("–");
    expect(formatMetric("total_transfer_in_bytes", 2000)).toBe("2 kB");
    expect(formatMetric("total_transfer_time_in_seconds", 2)).toBe("2 s");
    expect(formatMetric("mean_time_per_web_packet", 0.002)).toBe("0.002 s");
    expect(formatMetric("total_transfer_in_number_of_packets", 12345)).toBe("1.235e+04");
    expect(formatMetric("total_transfer_in_number_of_packets", Number.NaN)).toBe("–");
  });
});
