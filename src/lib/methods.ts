// The access methods the figures compare: their order, display labels and styles, as
// nwb-benchmarks' `_visualization.py` defines them. Colors are named by token (declared in
// src/style.css, light and dark) rather than carried as values, so a figure follows the theme.

export const DEFAULT_BENCHMARK_LABELS: [string, string][] = [
  ["hdf5 h5py remfile no cache", "HDF5 remfile"],
  ["hdf5 h5py remfile with cache", "HDF5 remfile cache"],
  ["hdf5 h5py fsspec https no cache", "HDF5 fsspec HTTPS"],
  ["hdf5 h5py fsspec https with cache", "HDF5 fsspec HTTPS cache"],
  ["hdf5 h5py fsspec s3 no cache", "HDF5 fsspec S3"],
  ["hdf5 h5py fsspec s3 with cache", "HDF5 fsspec S3 cache"],
  ["hdf5 h5py ros3", "HDF5 ROS3"],
  ["lindi h5py", "LINDI"],
  ["zarr s3", "Zarr"],
  ["zarr s3 force no consolidated", "Zarr unconsol."],
];

/** `method.replace("h5py", "pynwb").replace("zarr", "zarr pynwb")`: the PyNWB form of a method. */
export function toPynwbMethod(method: string): string {
  return method.replaceAll("h5py", "pynwb").replaceAll("zarr", "zarr pynwb");
}

/** Backend (h5py and zarr-python) file opening, in the figures' fixed order. */
export const FILE_OPEN_ORDER = DEFAULT_BENCHMARK_LABELS.map(([method]) => method);
/** PyNWB file reading and slicing, in the same order. */
export const PYNWB_READ_ORDER = FILE_OPEN_ORDER.map(toPynwbMethod);

const LABELS = new Map<string, string>([
  ...DEFAULT_BENCHMARK_LABELS,
  ...DEFAULT_BENCHMARK_LABELS.map(([method, label]): [string, string] => [toPynwbMethod(method), label]),
]);

export function methodLabel(method: string): string {
  return LABELS.get(method) ?? method;
}

/** The token each backend method's color is declared under; its PyNWB form shares it. */
const COLOR_TOKENS: Record<string, string> = {
  "hdf5 h5py remfile no cache": "--method-remfile",
  "hdf5 h5py remfile with cache": "--method-remfile-cache",
  "hdf5 h5py fsspec https no cache": "--method-fsspec-https",
  "hdf5 h5py fsspec https with cache": "--method-fsspec-https-cache",
  "hdf5 h5py fsspec s3 no cache": "--method-fsspec-s3",
  "hdf5 h5py fsspec s3 with cache": "--method-fsspec-s3-cache",
  "hdf5 h5py ros3": "--method-ros3",
  "lindi h5py": "--method-lindi",
  "zarr s3": "--method-zarr",
  "zarr s3 force no consolidated": "--method-zarr-unconsolidated",
};
for (const [method, token] of Object.entries(COLOR_TOKENS)) COLOR_TOKENS[toPynwbMethod(method)] = token;

/** Methods outside the fixed palette take one of these, by a hash of their name, as the Python
 * code takes a fallback hue by `zlib.crc32`, so a method keeps its color whatever else is shown. */
export const FALLBACK_COLOR_TOKENS = [
  "--method-other-1",
  "--method-other-2",
  "--method-other-3",
  "--method-other-4",
  "--method-other-5",
  "--method-other-6",
];

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

/** `zlib.crc32` of a string's UTF-8 bytes. */
export function crc32(text: string): number {
  let crc = 0xffffffff;
  for (const byte of new TextEncoder().encode(text)) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

export function methodColorToken(method: string): string {
  return COLOR_TOKENS[method] ?? FALLBACK_COLOR_TOKENS[crc32(method) % FALLBACK_COLOR_TOKENS.length];
}

/** `var(--token)` for a method's color, ready for a `stroke` or `fill`. */
export function methodColor(method: string): string {
  return `var(${methodColorToken(method)})`;
}

export type LineStyle = "solid" | "dashdot" | "dashed";
export type MarkerShape = "circle" | "square" | "triangle";

/** Variants of the same method are told apart by line style and marker as well as color. */
export function methodLineStyle(method: string): LineStyle {
  return method === "zarr s3 force no consolidated" || method === toPynwbMethod("zarr s3 force no consolidated")
    ? "dashdot"
    : "solid";
}

export function methodMarker(method: string): MarkerShape {
  return methodLineStyle(method) === "dashdot" ? "square" : "circle";
}

/** The marker each modality is drawn with where markers tell modalities apart. */
export const MODALITY_MARKERS: Record<string, MarkerShape> = {
  Ecephys: "circle",
  Ophys: "square",
  Icephys: "triangle",
};

/** The color of a download + local read curve, by file format. */
export function downloadColor(formatFamily: string): string {
  if (formatFamily === "hdf5") return "var(--download-hdf5)";
  if (formatFamily === "zarr") return "var(--download-zarr)";
  return "var(--download-other)";
}

export const FORMAT_FAMILY_LABELS: Record<string, string> = { hdf5: "HDF5", zarr: "Zarr" };

/** Methods in the figures' fixed order first, then any others alphabetically. */
export function orderMethods(present: Iterable<string>, order: readonly string[] = PYNWB_READ_ORDER): string[] {
  const set = new Set(present);
  return [...order.filter((method) => set.has(method)), ...[...set].filter((method) => !order.includes(method)).sort()];
}

export const NETWORK_METRIC_LABELS: Record<string, string> = {
  amount_downloaded_in_bytes: "Downloaded bytes",
  amount_downloaded_in_number_of_packets: "Downloaded packets",
  amount_uploaded_in_bytes: "Uploaded bytes",
  amount_uploaded_in_number_of_packets: "Uploaded packets",
  mean_time_per_web_packet: "Mean time per web packet (s)",
  network_total_time_in_seconds: "Network total time (s)",
  total_traffic_in_number_of_web_packets: "Total web packets",
  total_transfer_in_bytes: "Total transfer bytes",
  total_transfer_in_number_of_packets: "Total transfer packets",
  total_transfer_time_in_seconds: "Total transfer time (s)",
};

export function isByteMetric(metric: string): boolean {
  return metric.endsWith("_in_bytes");
}
