import { gzipSync } from "node:zlib";
import { jsonResponse, routeFetch } from "@brain-bbqs/test-utils/vitest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BundleError, RESULTS_BUNDLE_URL, asBundle, decodeBundle, fetchBundleBytes } from "../../src/lib/bundle";

const BUNDLE = { "results/a.json": { timestamp: "x" } };
const encode = (value: unknown): Uint8Array => new TextEncoder().encode(JSON.stringify(value));

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("decodeBundle", () => {
  it("reads gzipped and plain bundles", async () => {
    expect(await decodeBundle(new Uint8Array(gzipSync(JSON.stringify(BUNDLE))))).toEqual(BUNDLE);
    expect(await decodeBundle(encode(BUNDLE))).toEqual(BUNDLE);
  });

  it.each([
    [new Uint8Array([0x1f, 0x8b, 0, 1, 2, 3]), "could not be decompressed"],
    [new TextEncoder().encode("{not json"), "not valid JSON"],
    [encode([1, 2]), "expected one object"],
    [encode({ "machines/m.json": {} }), "no results/ files"],
  ])("refuses what is not a bundle (%#)", async (bytes, message) => {
    await expect(decodeBundle(bytes)).rejects.toThrow(message);
  });

  it("names its errors", () => {
    expect(() => asBundle(null)).toThrow(BundleError);
  });
});

describe("fetchBundleBytes", () => {
  it("collects the body and reports progress against its length", async () => {
    const bytes = encode(BUNDLE);
    vi.stubGlobal(
      "fetch",
      routeFetch([
        {
          match: RESULTS_BUNDLE_URL,
          respond: () => new Response(bytes as BlobPart, { headers: { "content-length": String(bytes.length) } }),
        },
      ]),
    );
    const progress = vi.fn();
    expect(await fetchBundleBytes(RESULTS_BUNDLE_URL, { onProgress: progress })).toEqual(bytes);
    expect(progress).toHaveBeenLastCalledWith({ received: bytes.length, total: bytes.length });
  });

  it("reports an unknown total, and reads a body-less response", async () => {
    vi.stubGlobal("fetch", routeFetch([{ match: "with-body", respond: () => new Response("abc") }]));
    const progress = vi.fn();
    await fetchBundleBytes("https://x.invalid/with-body", { onProgress: progress });
    expect(progress).toHaveBeenCalledWith({ received: 3, total: null });

    const bodyless = {
      ok: true,
      headers: new Headers(),
      body: null,
      arrayBuffer: () => Promise.resolve(new Uint8Array([1, 2]).buffer),
    };
    vi.stubGlobal("fetch", () => Promise.resolve(bodyless));
    expect(await fetchBundleBytes("https://x.invalid/")).toEqual(new Uint8Array([1, 2]));
  });

  it("fails on an error status", async () => {
    vi.stubGlobal("fetch", routeFetch([{ match: "missing", respond: jsonResponse({}, 404) }]));
    await expect(fetchBundleBytes("https://x.invalid/missing")).rejects.toThrow("answered 404");
  });
});
