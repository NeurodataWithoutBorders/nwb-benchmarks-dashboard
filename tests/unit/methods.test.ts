import { describe, expect, it } from "vitest";
import {
  FALLBACK_COLOR_TOKENS,
  FILE_OPEN_ORDER,
  PYNWB_READ_ORDER,
  crc32,
  downloadColor,
  isByteMetric,
  methodColor,
  methodColorToken,
  methodLabel,
  methodLineStyle,
  methodMarker,
  orderMethods,
  toPynwbMethod,
} from "../../src/lib/methods";

describe("methods", () => {
  it("orders the PyNWB methods like their backend forms", () => {
    expect(PYNWB_READ_ORDER).toHaveLength(FILE_OPEN_ORDER.length);
    expect(toPynwbMethod("zarr s3 force no consolidated")).toBe("zarr pynwb s3 force no consolidated");
    expect(toPynwbMethod("hdf5 h5py ros3")).toBe("hdf5 pynwb ros3");
  });

  it("labels both forms alike and leaves others as they are", () => {
    expect(methodLabel("hdf5 h5py fsspec s3 with cache")).toBe("HDF5 fsspec S3 cache");
    expect(methodLabel("hdf5 pynwb fsspec s3 with cache")).toBe("HDF5 fsspec S3 cache");
    expect(methodLabel("something new")).toBe("something new");
  });

  it("colors by token, with a stable fallback for unknown methods", () => {
    expect(methodColorToken("lindi pynwb")).toBe("--method-lindi");
    expect(methodColor("zarr s3")).toBe("var(--method-zarr)");
    expect(FALLBACK_COLOR_TOKENS).toContain(methodColorToken("something new"));
    expect(methodColorToken("something new")).toBe(methodColorToken("something new"));
  });

  it("computes zlib's crc32", () => {
    expect(crc32("")).toBe(0);
    expect(crc32("hello")).toBe(0x3610a686);
  });

  it("styles the unconsolidated Zarr variant apart", () => {
    expect(methodLineStyle("zarr pynwb s3 force no consolidated")).toBe("dashdot");
    expect(methodMarker("zarr s3 force no consolidated")).toBe("square");
    expect(methodLineStyle("zarr s3")).toBe("solid");
    expect(methodMarker("zarr s3")).toBe("circle");
  });

  it("colors download curves by format", () => {
    expect(downloadColor("hdf5")).toBe("var(--download-hdf5)");
    expect(downloadColor("zarr")).toBe("var(--download-zarr)");
    expect(downloadColor("lindi")).toBe("var(--download-other)");
  });

  it("orders methods: the fixed order, then the rest alphabetically", () => {
    expect(orderMethods(["b", "lindi pynwb", "a", "hdf5 pynwb ros3"])).toEqual([
      "hdf5 pynwb ros3",
      "lindi pynwb",
      "a",
      "b",
    ]);
  });

  it("knows which metrics count bytes", () => {
    expect(isByteMetric("total_transfer_in_bytes")).toBe(true);
    expect(isByteMetric("total_transfer_in_number_of_packets")).toBe(false);
  });
});
