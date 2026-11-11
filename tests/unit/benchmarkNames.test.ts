// Every real benchmark name is checked against the Python reader in parity.test.ts; these pin the
// individual steps.
import { describe, expect, it } from "vitest";
import {
  benchmarkNameParts,
  cleanBenchmarkNameTest,
  modalityOf,
  scalingValueOf,
  splitCamelCase,
} from "../../src/lib/benchmarkNames";

describe("name steps", () => {
  it.each([
    ["HDF5H5pyFileRead", "HDF5 H5py File Read"],
    ["HDF5PyNWBS3Thing", "HDF5 PyNWB S3 Thing"],
    ["HDF5PyNWBROS3Preloaded", "HDF5 PyNWB ROS3 Preloaded"],
  ])("splits %s", (text, split) => {
    expect(splitCamelCase(text)).toBe(split);
  });

  it("drops the benchmark kind before splitting", () => {
    expect(cleanBenchmarkNameTest("ZarrPyNWBS3ContinuousSliceBenchmark")).toBe("zarr pynwb s3");
  });

  it("caches each name's parts", () => {
    const name = "time_remote_slicing.LindiLocalJSONPreloadedContinuousSliceBenchmark.time_slice";
    expect(benchmarkNameParts(name)).toBe(benchmarkNameParts(name));
    expect(benchmarkNameParts(name)).toMatchObject({ clean: "lindi pynwb", isPreloaded: true, isLocal: false });
  });

  it("tolerates a name with missing parts", () => {
    expect(benchmarkNameParts("lonely")).toMatchObject({ type: "lonely", test: "", operation: "", label: null });
  });

  it("reads modalities and slice sizes", () => {
    expect(modalityOf(null)).toBe(null);
    expect(modalityOf("BehaviorTestCase")).toBe(null);
    expect(modalityOf("OphysTestCase3")).toBe("Ophys");
    expect(scalingValueOf({ slice_range: ["slice(0, 40, None)"] })).toBe(40);
    expect(scalingValueOf({ slice_range: ["slice(10, 40, None)"] })).toBe(null);
    expect(scalingValueOf({ slice_range: [3] })).toBe(null);
    expect(scalingValueOf({})).toBe(null);
  });
});
