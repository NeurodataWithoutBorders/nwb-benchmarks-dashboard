// Where the results come from: the bundle nwb-benchmarks-results publishes on its `dist` branch
// (every JSON file of the repository, keyed by path, minified and gzipped), fetched straight from
// GitHub, or a copy of it the reader drops in.

import type { Bundle } from "./database";

export const RESULTS_REPOSITORY = "NeurodataWithoutBorders/nwb-benchmarks-results";
export const RESULTS_BUNDLE_URL = `https://raw.githubusercontent.com/${RESULTS_REPOSITORY}/dist/bundle.json.gz`;

export interface LoadProgress {
  received: number;
  /** Null when the server does not say how large the bundle is. */
  total: number | null;
}

export class BundleError extends Error {
  override name = "BundleError";
}

/** Downloads the bundle's bytes, reporting progress as they arrive. */
export async function fetchBundleBytes(
  url: string,
  { signal, onProgress }: { signal?: AbortSignal; onProgress?: (progress: LoadProgress) => void } = {},
): Promise<Uint8Array> {
  const response = await fetch(url, { signal });
  if (!response.ok)
    throw new BundleError(`The results server answered ${response.status} ${response.statusText}.`.trim());
  const length = Number(response.headers.get("content-length"));
  const total = Number.isFinite(length) && length > 0 ? length : null;
  if (!response.body) return new Uint8Array(await response.arrayBuffer());
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let received = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    received += value.byteLength;
    onProgress?.({ received, total });
  }
  const bytes = new Uint8Array(received);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

function isGzip(bytes: Uint8Array): boolean {
  return bytes.length > 2 && bytes[0] === 0x1f && bytes[1] === 0x8b;
}

async function gunzip(bytes: Uint8Array): Promise<string> {
  const body = new Response(bytes as BlobPart).body as ReadableStream<BufferSource>;
  return new Response(body.pipeThrough(new DecompressionStream("gzip"))).text();
}

/** Checks that a parsed value is a results bundle: an object of repository paths to JSON files. */
export function asBundle(value: unknown): Bundle {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new BundleError("That is not a results bundle: expected one object keyed by file path.");
  }
  const keys = Object.keys(value);
  if (!keys.some((key) => key.startsWith("results/"))) {
    throw new BundleError("That is not a results bundle: it holds no results/ files.");
  }
  return value as Bundle;
}

/** Reads a bundle from its bytes, gzipped (as published) or plain JSON. */
export async function decodeBundle(bytes: Uint8Array): Promise<Bundle> {
  let text: string;
  try {
    text = isGzip(bytes) ? await gunzip(bytes) : new TextDecoder().decode(bytes);
  } catch {
    throw new BundleError("The bundle could not be decompressed.");
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new BundleError("The bundle is not valid JSON.");
  }
  return asBundle(parsed);
}
