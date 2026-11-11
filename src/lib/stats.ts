// The summary statistics the figures use, with pandas' conventions: missing (NaN) values are
// skipped, the median of an even count is the mean of the middle two, and the standard deviation
// is the sample one (ddof = 1), undefined below two values.

export interface Summary {
  n: number;
  mean: number;
  median: number;
  std: number;
  min: number;
  max: number;
}

function present(values: readonly number[]): number[] {
  return values.filter((value) => !Number.isNaN(value));
}

export function mean(values: readonly number[]): number {
  const kept = present(values);
  if (kept.length === 0) return Number.NaN;
  return kept.reduce((total, value) => total + value, 0) / kept.length;
}

export function median(values: readonly number[]): number {
  const kept = present(values).sort((a, b) => a - b);
  if (kept.length === 0) return Number.NaN;
  const middle = Math.floor(kept.length / 2);
  return kept.length % 2 === 1 ? kept[middle] : (kept[middle - 1] + kept[middle]) / 2;
}

export function std(values: readonly number[]): number {
  const kept = present(values);
  if (kept.length < 2) return Number.NaN;
  const average = mean(kept);
  const squares = kept.reduce((total, value) => total + (value - average) ** 2, 0);
  return Math.sqrt(squares / (kept.length - 1));
}

export function summarize(values: readonly number[]): Summary {
  const kept = present(values);
  return {
    n: kept.length,
    mean: mean(kept),
    median: median(kept),
    std: std(kept),
    min: kept.length ? Math.min(...kept) : Number.NaN,
    max: kept.length ? Math.max(...kept) : Number.NaN,
  };
}

/** Least-squares line through the points, as `numpy.polyfit(x, y, 1)`, or null when undefined. */
export function linearFit(xs: readonly number[], ys: readonly number[]): { slope: number; intercept: number } | null {
  const points = xs.map((x, index) => [x, ys[index]]).filter(([x, y]) => Number.isFinite(x) && Number.isFinite(y));
  if (points.length < 2) return null;
  const meanX = points.reduce((total, [x]) => total + x, 0) / points.length;
  const meanY = points.reduce((total, [, y]) => total + y, 0) / points.length;
  let covariance = 0;
  let variance = 0;
  for (const [x, y] of points) {
    covariance += (x - meanX) * (y - meanY);
    variance += (x - meanX) ** 2;
  }
  if (variance === 0) return null;
  const slope = covariance / variance;
  return { slope, intercept: meanY - slope * meanX };
}

/** A small, seeded generator (mulberry32), so a resampled interval is the same on every render. */
export function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * The 95 % percentile-bootstrap interval of the mean, seaborn's default error bar for a point plot
 * (1000 resamples). Seeded, so unlike seaborn's it does not move between renders.
 */
export function bootstrapMeanInterval(values: readonly number[], resamples = 1000, seed = 0): [number, number] | null {
  const kept = present(values);
  if (kept.length < 2) return null;
  const random = seededRandom(seed);
  const means: number[] = [];
  for (let round = 0; round < resamples; round++) {
    let total = 0;
    for (let draw = 0; draw < kept.length; draw++) total += kept[Math.floor(random() * kept.length)];
    means.push(total / kept.length);
  }
  means.sort((a, b) => a - b);
  return [percentile(means, 2.5), percentile(means, 97.5)];
}

/** numpy's default (linear) percentile of sorted values. */
export function percentile(sorted: readonly number[], q: number): number {
  if (sorted.length === 0) return Number.NaN;
  const position = ((sorted.length - 1) * q) / 100;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (position - lower);
}

/** Items grouped by a composite key, in first-seen order. */
export function groupBy<T, K extends readonly unknown[]>(
  items: Iterable<T>,
  keyOf: (item: T) => K,
): Map<string, { key: K; items: T[] }> {
  const groups = new Map<string, { key: K; items: T[] }>();
  for (const item of items) {
    const key = keyOf(item);
    const id = JSON.stringify(key);
    let group = groups.get(id);
    if (!group) {
      group = { key, items: [] };
      groups.set(id, group);
    }
    group.items.push(item);
  }
  return groups;
}
