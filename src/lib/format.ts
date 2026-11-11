// Number formatting the figures share.

/** Python's `format(value, ".<precision>g")`: the way the paper's heatmap annotates its cells. */
export function formatG(value: number, precision = 3): string {
  if (!Number.isFinite(value)) return Number.isNaN(value) ? "nan" : value > 0 ? "inf" : "-inf";
  if (value === 0) return "0";
  const exponent = Math.floor(Math.log10(Math.abs(Number(value.toPrecision(precision)))));
  if (exponent < -4 || exponent >= precision) {
    const [mantissa, power] = value.toExponential(precision - 1).split("e");
    const trimmed = mantissa.includes(".") ? mantissa.replace(/\.?0+$/, "") : mantissa;
    const sign = power.startsWith("-") ? "-" : "+";
    return `${trimmed}e${sign}${power.replace(/^[-+]/, "").padStart(2, "0")}`;
  }
  const fixed = value.toFixed(Math.max(0, precision - 1 - exponent));
  return fixed.includes(".") ? fixed.replace(/\.?0+$/, "") : fixed;
}

const SI_PREFIXES = ["", "k", "M", "G", "T", "P"];

/** A compact axis label for a value spanning many orders of magnitude: 1, 10, 100, 1k, 10M... */
export function formatCompact(value: number): string {
  if (value === 0) return "0";
  const magnitude = Math.abs(value);
  if (magnitude < 1) return formatG(value, 2);
  const index = Math.min(SI_PREFIXES.length - 1, Math.floor(Math.log10(magnitude) / 3));
  const scaled = value / 1000 ** index;
  return `${formatG(scaled, 3)}${SI_PREFIXES[index]}`;
}

/** A linear axis's tick label: plain below a thousand, compact (1.5k, 20k) above. */
export function formatTick(value: number): string {
  return Math.abs(value) >= 1000 ? formatCompact(value) : formatG(value, 3);
}

/** Seconds, with as many digits as the magnitude needs. */
export function formatSeconds(value: number): string {
  return Number.isFinite(value) ? `${formatG(value, 3)} s` : "–";
}

/** A byte count in decimal units (1 MB = 10⁶ bytes, as the throughput lines use). */
export function formatDecimalBytes(value: number): string {
  if (!Number.isFinite(value)) return "–";
  const units = ["B", "kB", "MB", "GB", "TB"];
  let scaled = value;
  let unit = 0;
  while (Math.abs(scaled) >= 1000 && unit < units.length - 1) {
    scaled /= 1000;
    unit++;
  }
  return `${formatG(scaled, 3)} ${units[unit]}`;
}

/** A metric value, as bytes when the metric counts bytes and as a plain number otherwise. */
export function formatMetric(metric: string, value: number): string {
  if (metric.endsWith("_in_bytes")) return formatDecimalBytes(value);
  if (metric.endsWith("_in_seconds") || metric === "mean_time_per_web_packet") return formatSeconds(value);
  return Number.isFinite(value) ? formatG(value, 4) : "–";
}
