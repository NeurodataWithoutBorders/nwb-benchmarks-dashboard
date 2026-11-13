// An in-memory stand-in for the browser's Cache Storage, which neither node nor jsdom provides:
// enough of `caches.open(name)` with `match` and `put` for src/lib/bundleCache.ts.

export interface FakeCacheStorage extends CacheStorage {
  /** What each cache holds, by cache name and then URL. */
  stored: Map<string, Map<string, Response>>;
}

/** With `refuse`, every `put` fails, as a browser out of storage quota does. */
export function fakeCacheStorage({ refuse = false } = {}): FakeCacheStorage {
  const stored = new Map<string, Map<string, Response>>();
  const open = (name: string): Promise<Cache> => {
    let entries = stored.get(name);
    if (!entries) {
      entries = new Map();
      stored.set(name, entries);
    }
    const held = entries;
    return Promise.resolve({
      match: (request: RequestInfo | URL) => Promise.resolve(held.get(String(request))?.clone()),
      put: (request: RequestInfo | URL, response: Response) => {
        if (refuse) return Promise.reject(new DOMException("Quota exceeded", "QuotaExceededError"));
        held.set(String(request), response);
        return Promise.resolve();
      },
    } as Cache);
  };
  return { stored, open } as unknown as FakeCacheStorage;
}
