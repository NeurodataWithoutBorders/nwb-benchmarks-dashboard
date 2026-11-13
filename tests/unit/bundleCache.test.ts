import { describe, expect, it } from "vitest";
import { BUNDLE_CACHE, digestOf, readStoredBundle, storeBundle } from "../../src/lib/bundleCache";
import { fakeCacheStorage } from "./helpers/cacheStorage";

const URL = "https://example.org/bundle.json.gz";
const bytes = new TextEncoder().encode("abc");
const ABC_SHA256 = "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad";

describe("digestOf", () => {
  it("is the bytes' SHA-256 in hex", async () => {
    expect(await digestOf(bytes)).toBe(ABC_SHA256);
  });
});

describe("storeBundle and readStoredBundle", () => {
  it("keep the bytes with their digest and when they were stored", async () => {
    const storage = fakeCacheStorage();
    const now = new Date("2026-11-13T10:00:00Z");
    expect(await storeBundle(storage, URL, bytes, now)).toBe(ABC_SHA256);
    expect([...storage.stored.keys()]).toEqual([BUNDLE_CACHE]);
    const stored = await readStoredBundle(storage, URL);
    expect(stored).toEqual({ bytes, digest: ABC_SHA256, storedAt: "2026-11-13T10:00:00.000Z" });
  });

  it("replace an older copy", async () => {
    const storage = fakeCacheStorage();
    await storeBundle(storage, URL, new TextEncoder().encode("older"));
    await storeBundle(storage, URL, bytes);
    expect((await readStoredBundle(storage, URL))?.digest).toBe(ABC_SHA256);
  });

  it("read nothing where nothing was stored, or where the browser keeps no Cache Storage", async () => {
    expect(await readStoredBundle(fakeCacheStorage(), URL)).toBeNull();
    expect(await readStoredBundle(undefined, URL)).toBeNull();
    expect(await storeBundle(undefined, URL, bytes)).toBe(ABC_SHA256);
  });

  it("work out what a copy stored without its headers lacks", async () => {
    const storage = fakeCacheStorage();
    await (await storage.open(BUNDLE_CACHE)).put(URL, new Response(bytes as BlobPart));
    expect(await readStoredBundle(storage, URL)).toEqual({ bytes, digest: ABC_SHA256, storedAt: "" });
  });
});
