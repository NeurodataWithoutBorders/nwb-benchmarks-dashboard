// The last downloaded results bundle, kept in the browser's Cache Storage so a return visit can draw
// the dashboard at once and only then check for newer results. raw.githubusercontent.com neither
// exposes the bundle's ETag to scripts nor answers the preflight a script's own If-None-Match would
// need, so the check is the browser's: a `no-cache` fetch revalidates its HTTP-cached copy against the
// ETag (an unchanged bundle costs a 304), and the bytes that come back are compared by digest.

/** Where the bundle is kept, by the URL it was downloaded from. */
export const BUNDLE_CACHE = "nwb-benchmarks-dashboard-results";

const DIGEST_HEADER = "x-bundle-digest";
const STORED_AT_HEADER = "x-bundle-stored-at";

export interface StoredBundle {
  bytes: Uint8Array;
  digest: string;
  /** When it was stored, as an ISO timestamp. */
  storedAt: string;
}

/** The bytes' SHA-256, in hex. */
export async function digestOf(bytes: Uint8Array): Promise<string> {
  const hash = await crypto.subtle.digest("SHA-256", bytes as BufferSource);
  return [...new Uint8Array(hash)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

/** The stored bundle for `url`, or null when there is none or the browser keeps no Cache Storage. */
export async function readStoredBundle(storage: CacheStorage | undefined, url: string): Promise<StoredBundle | null> {
  if (!storage) return null;
  const response = await (await storage.open(BUNDLE_CACHE)).match(url);
  if (!response) return null;
  const bytes = new Uint8Array(await response.arrayBuffer());
  return {
    bytes,
    digest: response.headers.get(DIGEST_HEADER) ?? (await digestOf(bytes)),
    storedAt: response.headers.get(STORED_AT_HEADER) ?? "",
  };
}

/** Keeps `bytes` as the bundle for `url`, replacing any older copy, and returns their digest. */
export async function storeBundle(
  storage: CacheStorage | undefined,
  url: string,
  bytes: Uint8Array,
  now: Date = new Date(),
): Promise<string> {
  const digest = await digestOf(bytes);
  if (storage) {
    const headers = { [DIGEST_HEADER]: digest, [STORED_AT_HEADER]: now.toISOString() };
    await (await storage.open(BUNDLE_CACHE)).put(url, new Response(bytes as BlobPart, { headers }));
  }
  return digest;
}
