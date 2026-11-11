// Linear and logarithmic axes: the mapping from data to pixels, and the ticks to label them with.

export interface Scale {
  (value: number): number;
  domain: [number, number];
  range: [number, number];
  ticks: number[];
  /** Unlabeled ticks between the labeled ones (a log axis's 2-9 multiples). */
  minorTicks: number[];
  log: boolean;
}

/** About `count` evenly spaced, round tick values covering [min, max]. */
export function niceTicks(min: number, max: number, count = 5): number[] {
  if (!Number.isFinite(min) || !Number.isFinite(max)) return [];
  if (min === max) return [min];
  const span = max - min;
  const rough = span / Math.max(1, count);
  const power = 10 ** Math.floor(Math.log10(rough));
  const step = [1, 2, 2.5, 5, 10].map((factor) => factor * power).find((candidate) => candidate >= rough) ?? 10 * power;
  const first = Math.ceil(min / step - 1e-9) * step;
  const ticks: number[] = [];
  for (let value = first; value <= max + step * 1e-9; value += step) ticks.push(Number(value.toPrecision(12)));
  return ticks;
}

/** Extends a range to round tick values, as an axis that starts and ends on a tick. */
export function niceDomain(min: number, max: number, count = 5): [number, number] {
  if (min === max) return min === 0 ? [0, 1] : [Math.min(0, min), Math.max(0, max) * 1.1 || 1];
  const ticks = niceTicks(min, max, count);
  const step = ticks.length > 1 ? ticks[1] - ticks[0] : max - min;
  return [Math.floor(min / step) * step, Math.ceil(max / step) * step];
}

export function linearScale(domain: [number, number], range: [number, number], tickCount = 5): Scale {
  const [d0, d1] = domain;
  const [r0, r1] = range;
  const span = d1 - d0 || 1;
  const scale = ((value: number) => r0 + ((value - d0) / span) * (r1 - r0)) as Scale;
  scale.domain = domain;
  scale.range = range;
  scale.ticks = niceTicks(Math.min(d0, d1), Math.max(d0, d1), tickCount);
  scale.minorTicks = [];
  scale.log = false;
  return scale;
}

export function logScale(domain: [number, number], range: [number, number]): Scale {
  const [d0, d1] = domain.map((value) => Math.log10(value));
  const [r0, r1] = range;
  const span = d1 - d0 || 1;
  const scale = ((value: number) => r0 + ((Math.log10(value) - d0) / span) * (r1 - r0)) as Scale;
  scale.domain = domain;
  scale.range = range;
  const low = Math.floor(Math.min(d0, d1));
  const high = Math.ceil(Math.max(d0, d1));
  const decades: number[] = [];
  for (let power = low; power <= high; power++) decades.push(power);
  const inside = (value: number): boolean => {
    const exponent = Math.log10(value);
    return exponent >= Math.min(d0, d1) - 1e-9 && exponent <= Math.max(d0, d1) + 1e-9;
  };
  // Every decade when there are few; every other (or third) when the axis spans many.
  const stride = Math.max(1, Math.ceil(decades.length / 7));
  scale.ticks = decades
    .filter((power) => power % stride === 0)
    .map((power) => 10 ** power)
    .filter(inside);
  scale.minorTicks = decades
    .flatMap((power) => [2, 3, 4, 5, 6, 7, 8, 9].map((factor) => factor * 10 ** power))
    .filter(inside);
  if (scale.ticks.length < 2) {
    // A range within one decade: label its 1, 2 and 5 multiples instead.
    scale.ticks = decades
      .flatMap((power) => [1, 2, 5].map((factor) => factor * 10 ** power))
      .filter(inside)
      .sort((a, b) => a - b);
  }
  scale.log = true;
  return scale;
}

/** The [min, max] of the finite (and, for a log axis, positive) values, padded by `factor`. */
export function extent(values: readonly number[], { log = false, pad = 0.05 } = {}): [number, number] | null {
  const kept = values.filter((value) => Number.isFinite(value) && (!log || value > 0));
  if (kept.length === 0) return null;
  let min = Math.min(...kept);
  let max = Math.max(...kept);
  if (log) {
    if (min === max) return [min / 2, max * 2];
    const factor = 1 + pad * 10;
    return [min / factor, max * factor];
  }
  if (min === max) {
    min -= Math.abs(min) * 0.1 || 1;
    max += Math.abs(max) * 0.1 || 1;
  }
  const padding = (max - min) * pad;
  return [min - padding, max + padding];
}
