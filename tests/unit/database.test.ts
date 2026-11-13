import { describe, expect, it } from "vitest";
import {
  environmentLabel,
  latestRunDate,
  machineLabel,
  modalityOfObject,
  normalizeResults,
  readDatabase,
  readEnvironment,
  readMachine,
} from "../../src/lib/database";
import { readParityBundle } from "./helpers/parity";

describe("readMachine", () => {
  it("reads a machine file's identity and hardware", () => {
    const machine = readMachine("machines/machine-abc.json", {
      name: "LightAirship",
      version: "1.4.1",
      os: { cpu_count: 8 },
      platform: { system: "Darwin", platform: "macOS-12", architecture: ["64bit", "Mach-O"] },
      psutil: { total_virtual_memory: 34359738368 },
      asv: { cpu: "Xeon", num_cpu: "8", ram: "1" },
    });
    expect(machine).toEqual({
      id: "abc",
      name: "LightAirship",
      version: "1.4.1",
      system: "Darwin",
      platform: "macOS-12",
      cpu: "Xeon",
      architecture: "64bit",
      cpuCount: 8,
      memoryBytes: 34359738368,
    });
  });

  it("falls back to ASV's own fields and tolerates a file with none", () => {
    expect(readMachine("machines/machine-x.json", { asv: { num_cpu: "4", ram: "16" } })).toMatchObject({
      cpuCount: 4,
      memoryBytes: 16,
      architecture: null,
      name: "",
    });
    expect(readMachine("machines/machine-y.json", null)).toMatchObject({ id: "y", version: null });
    expect(readMachine("machines/machine-z.json", { version: 1.2, platform: { machine: "arm64" } })).toMatchObject({
      version: "1.2",
      architecture: "arm64",
    });
  });
});

describe("readEnvironment", () => {
  const conda = [
    { name: "h5py", version: "3.14.0", build: "py311", channel: "conda-forge" },
    { name: "python", version: "3.11.7", build: "h1", channel: "conda-forge" },
    { name: "short", version: "1.0" },
  ];

  it("reads the conda list, the packages of interest and the paper's date", () => {
    const environment = readEnvironment("environments/environment-052cb4d925793bbbc270d9384a60bc24023025b7.json", {
      "3.11.7 | packaged by conda-forge": conda,
    });
    expect(environment?.packages).toEqual({ h5py: "3.14.0 (py311)", python: "3.11.7 (h1)" });
    expect(environment?.packagesOfInterest).toEqual({ h5py: "3.14.0" });
    expect(environment?.pythonVersion).toBe("3.11.7");
    expect(environment?.timepoint).toBe("2025-09-01");
  });

  it("adds the runtime section's distributions and versions", () => {
    const environment = readEnvironment("environments/environment-e1.json", {
      "3.13.16 | packaged": conda,
      runtime: {
        python_distributions: [
          { name: "h5py", version: "9.9.9" },
          { name: "pynwb", version: "4.2.0" },
          { name: "broken" },
        ],
        runtime_versions: { hdf5: "1.14.6", nothing: null },
      },
    });
    expect(environment?.packages.h5py).toBe("3.14.0 (py311)");
    expect(environment?.packages.pynwb).toBe("4.2.0");
    expect(environment?.packages.runtime_hdf5).toBe("1.14.6");
    expect(environment?.timepoint).toBe(null);
  });

  it("takes the Python version from the banner when conda did not list it", () => {
    expect(readEnvironment("environments/environment-e2.json", { "3.9.15 | banner": [conda[0]] })?.pythonVersion).toBe(
      "3.9.15",
    );
  });

  it("skips files the Python reader skips", () => {
    expect(readEnvironment("environments/environment-e.json", { a: [], b: [] })).toBe(null);
    expect(readEnvironment("environments/environment-e.json", { a: "not a list" })).toBe(null);
  });
});

describe("normalizeResults", () => {
  it("names a bare timing value `time` and keeps lists as they are", () => {
    expect(normalizeResults(1.5)).toEqual([["time", [1.5]]]);
    expect(normalizeResults([1, null])).toEqual([["time", [1, Number.NaN]]]);
  });

  it("adds the mean time per web packet to network results", () => {
    const variables = new Map(
      normalizeResults({ total_traffic_in_number_of_web_packets: 4, total_transfer_time_in_seconds: 2, other: [1, 2] }),
    );
    expect(variables.get("mean_time_per_web_packet")).toEqual([0.5]);
    expect(variables.get("other")).toEqual([1, 2]);
    const none = new Map(
      normalizeResults({ total_traffic_in_number_of_web_packets: 0, total_transfer_time_in_seconds: 2 }),
    );
    expect(none.get("mean_time_per_web_packet")?.[0]).toBeNaN();
  });
});

describe("readDatabase", () => {
  const db = readDatabase(readParityBundle());

  it("reads every kind of file", () => {
    expect(db.machines.size).toBe(4);
    expect(db.environments.size).toBe(5);
    expect(db.runs.length).toBeGreaterThan(20);
    expect(db.samples.length).toBeGreaterThan(1000);
    expect(db.runs.map((run) => run.timestamp)).toEqual([...db.runs.map((run) => run.timestamp)].sort());
  });

  it("counts the files it could not read: those with no date at all", () => {
    const counted = readDatabase({
      "results/old.json": { database_version: "2.0.0" },
      "results/broken.json": { database_version: "4.0.0" },
      "other/readme.json": {},
    });
    expect(counted.skipped).toEqual({ unreadable: 2 });
    expect(counted.runs).toEqual([]);
  });

  it("reads results in every older format, filling what they leave out from the file's name", () => {
    const url = "https://dandiarchive.s3.amazonaws.com/blobs/abc";
    const older = readDatabase({
      // Format 4: a named case, which teaches the modality of its file.
      "results/new.json": {
        database_version: "4.0.0",
        timestamp: "2026-01-01-00-00-00",
        machine_id: "m-new",
        environment_id: "e-new",
        results: {
          "time_remote_file_reading.X.time_read": { [`{'name': 'OphysTestCase1', 'https_url': '${url}'}`]: [1] },
        },
      },
      // No format version; the machine and environment named by hash.
      "results/timestamp-2024-02-17-00-59-37_machine-m-old_environment-e-old_results.json": {
        timestamp: "2024-02-17-00-59-37",
        machine_hash: "m-old",
        environment_hash: "e-old",
        results: {
          "time_remote_slicing.FsspecNoCacheContinuousSliceBenchmark.time_slice": {
            [`("'${url}'", "'TwoPhotonSeries'", '(slice(0, 30000, None),)')`]: [2],
            [`("'https://elsewhere'", "'ElectricalSeriesAp'", '(slice(0, 30000, None),)')`]: [3],
            [`("'https://nowhere'", "'Thing'")`]: [4],
          },
        },
      },
      // Format 2: no machine at all, and the date only in the file's name.
      "results/timestamp-2025-08-29-17-09-32_environment-e-2_results.json": {
        database_version: "2.0.0",
        results: { "time_remote_file_reading.Y.time_read": { "(\"'https://x'\",)": [5] } },
      },
    });
    expect(older.skipped).toEqual({ unreadable: 0 });
    expect(older.runs.map((run) => [run.machineId, run.environmentId, run.databaseVersion])).toEqual([
      ["m-old", "e-old", "unknown"],
      ["unknown", "e-2", "2.0.0"],
      ["m-new", "e-new", "4.0.0"],
    ]);
    const modalities = older.samples.map((sample) => sample.modality);
    expect(modalities).toEqual(["Ophys", "Ophys", "Ecephys", null, null]);
    expect(older.samples[1].scalingValue).toBe(30000);
    expect(modalityOfObject("CurrentClampSeries")).toBe("Icephys");
    expect(modalityOfObject("Thing")).toBeNull();
  });

  it("names machines, environments and the latest run readably", () => {
    expect(
      machineLabel(
        db.machines.get("a853f2f47d9930a78fdcf0766673deebc3fcd14f"),
        "a853f2f47d9930a78fdcf0766673deebc3fcd14f",
      ),
    ).toBe("ExultantMoonflower (a853f2f)");
    expect(machineLabel(undefined, "1234567890")).toBe("unknown machine (1234567)");
    const timepoint = db.environments.get("052cb4d925793bbbc270d9384a60bc24023025b7");
    expect(environmentLabel(timepoint, "052cb4d925793bbbc270d9384a60bc24023025b7")).toBe("2025-09-01 (052cb4d)");
    const other = db.environments.get("e833ef393e1bef9cf9915915b1604a87c7b004dc");
    expect(environmentLabel(other, "e833ef393e1bef9cf9915915b1604a87c7b004dc")).toBe(
      "Python 3.13.16, PyNWB 4.2.0 (e833ef3)",
    );
    expect(environmentLabel(undefined, "abcdefghij")).toBe("unknown environment (abcdefg)");
    expect(latestRunDate(db.runs)).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(latestRunDate([])).toBe(null);
  });
});
