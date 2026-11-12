import { describe, expect, it } from "vitest";
import {
  ENVIRONMENT_TIMEPOINTS,
  EQUIVALENT_ENVIRONMENT_IDS,
  EXCLUDED_SAMPLES,
  TIMEPOINT_BY_ENVIRONMENT,
  canonicalEnvironmentId,
  isExcludedSample,
} from "../../src/lib/curation";

describe("curation", () => {
  it("maps environments to their timepoints both ways", () => {
    for (const [date, id] of Object.entries(ENVIRONMENT_TIMEPOINTS)) expect(TIMEPOINT_BY_ENVIRONMENT[id]).toBe(date);
  });

  it("files an equivalent environment under a dated one, and leaves any other as it is", () => {
    for (const [alias, canonical] of Object.entries(EQUIVALENT_ENVIRONMENT_IDS)) {
      expect(canonicalEnvironmentId(alias)).toBe(canonical);
      expect(TIMEPOINT_BY_ENVIRONMENT[canonical]).toBeDefined();
    }
    expect(canonicalEnvironmentId("unlisted")).toBe("unlisted");
  });

  it("recognizes exactly the listed samples", () => {
    const sample = EXCLUDED_SAMPLES[0];
    expect(isExcludedSample(sample.machineId, sample.timestamp, sample.benchmarkName, sample.parameterCaseName)).toBe(
      true,
    );
    expect(isExcludedSample(sample.machineId, sample.timestamp, sample.benchmarkName, "OtherCase")).toBe(false);
    expect(isExcludedSample(sample.machineId, sample.timestamp, sample.benchmarkName, null)).toBe(false);
  });
});
