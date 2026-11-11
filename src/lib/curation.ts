// The curation decisions nwb-benchmarks keeps in code (src/nwb_benchmarks/database/_processing.py
// and command_line_interface.py), mirrored here so the dashboard draws the paper's figures from the
// same selection of data. Keep them in step with that file; the parity test only covers the parts
// of them its fixture reaches.

/** The LBNL Mac, the paper's benchmark machine. Its machine ID changed twice with no hardware
 * change: once when the environment moved to Python 3.13 (ASV's machine name and platform string
 * changed), and once when macOS's dynamically allocated swap changed `total_swap_memory`. */
export const LBL_MAC_MACHINE_IDS = [
  "87fee773e425b4b1d3978fbf762d57effb0e8df8",
  "a853f2f47d9930a78fdcf0766673deebc3fcd14f",
  "16b244cd5a970ac0d7fefcb46c6ab0476075e5b5",
];

/** Results older than this ran older versions of the benchmark suite; `generate_figures` drops them. */
export const PAPER_EXCLUDE_OLDER = "2025-11-01";

/** The software environments the paper compares, by the date their package versions represent. */
export const ENVIRONMENT_TIMEPOINTS: Record<string, string> = {
  "2024-06-30": "9e225115ea6c99b60d419454a9457bb5db93c7b7",
  "2025-06-30": "15d059d5b6b9047f9bbeb4ac77bb4461411904c7",
  // Created after 2025-09-01, exact date unknown.
  "2025-09-01": "052cb4d925793bbbc270d9384a60bc24023025b7",
  // The Python 3.13 environment, dated by its first benchmark run.
  "2026-10-07": "42bfe7119727f6ab276361065e27b6e5fa5bbdc9",
};

/** The environment the paper's single-environment figures (Figures 3 and 5) use. */
export const PAPER_REFERENCE_TIMEPOINT = "2026-10-07";

/** Environment ID to its timepoint date. */
export const TIMEPOINT_BY_ENVIRONMENT: Record<string, string> = Object.fromEntries(
  Object.entries(ENVIRONMENT_TIMEPOINTS).map(([date, id]) => [id, date]),
);

export const PACKAGES_OF_INTEREST = [
  "h5py",
  "dandi",
  "zarr",
  "fsspec",
  "lindi",
  "s3fs",
  "aiohttp",
  "boto3",
  "hdmf-zarr",
  "hdmf",
  "pynwb",
];

/** `create_database`'s defaults: older results and machine files have other structures. */
export const MINIMUM_RESULTS_VERSION = "3.0.0";
export const MINIMUM_MACHINES_VERSION = "1.4.0";

export interface ExcludedSample {
  machineId: string;
  /** As in the results file name, `YYYY-MM-DD-HH-MM-SS`. */
  timestamp: string;
  benchmarkName: string;
  parameterCaseName: string;
  reason: string;
}

/** Individual samples flagged during review of the raw results. A sample is one benchmark test
 * case within one results file; every variable recorded for it is dropped, the rest of the run is
 * kept. */
export const EXCLUDED_SAMPLES: ExcludedSample[] = [
  {
    machineId: "a853f2f47d9930a78fdcf0766673deebc3fcd14f",
    timestamp: "2026-10-18-13-02-38",
    benchmarkName:
      "network_tracking_remote_slicing.HDF5PyNWBFsspecHttpsPreloadedNoCacheContinuousSliceBenchmark.track_network_during_slice",
    parameterCaseName: "OphysTestCase4",
    reason:
      "Transient network stall: 138 s against 7.8-10.2 s for the other five runs, with the same bytes and packets.",
  },
  {
    machineId: "a853f2f47d9930a78fdcf0766673deebc3fcd14f",
    timestamp: "2026-10-30-23-20-18",
    benchmarkName:
      "network_tracking_remote_file_reading.HDF5H5pyFileReadBenchmark.track_network_read_hdf5_h5py_fsspec_https_no_cache",
    parameterCaseName: "EcephysTestCase",
    reason: "Failed packet capture: every packet, byte and transfer-time metric is 0.",
  },
  {
    machineId: "a853f2f47d9930a78fdcf0766673deebc3fcd14f",
    timestamp: "2026-10-16-17-01-16",
    benchmarkName: "time_remote_file_reading.HDF5H5pyFileReadBenchmark.time_read_hdf5_h5py_fsspec_s3_no_cache",
    parameterCaseName: "IcephysTestCase",
    reason: "Isolated network stall: 76.2 s against 3.2-4.5 s for the other five runs.",
  },
  {
    machineId: "a853f2f47d9930a78fdcf0766673deebc3fcd14f",
    timestamp: "2026-10-13-14-34-49",
    benchmarkName: "time_remote_file_reading.HDF5H5pyFileReadBenchmark.time_read_hdf5_h5py_fsspec_s3_no_cache",
    parameterCaseName: "OphysTestCase",
    reason: "Isolated network stall: 22.3 s against 2.9-4.2 s for the other five runs.",
  },
  {
    machineId: "a853f2f47d9930a78fdcf0766673deebc3fcd14f",
    timestamp: "2026-10-16-17-01-16",
    benchmarkName: "time_remote_file_reading.HDF5PyNWBFileReadBenchmark.time_read_hdf5_pynwb_fsspec_https_no_cache",
    parameterCaseName: "OphysTestCase",
    reason: "Isolated network stall: 278.6 s against 45.1-57.1 s for the other five runs.",
  },
  {
    machineId: "a853f2f47d9930a78fdcf0766673deebc3fcd14f",
    timestamp: "2026-10-16-17-01-16",
    benchmarkName: "time_remote_file_reading.HDF5PyNWBFileReadBenchmark.time_read_hdf5_pynwb_fsspec_https_with_cache",
    parameterCaseName: "OphysTestCase",
    reason: "Isolated network stall: 97.6 s against 6.3-7.3 s for the other five runs.",
  },
  {
    machineId: "a853f2f47d9930a78fdcf0766673deebc3fcd14f",
    timestamp: "2026-10-29-18-20-35",
    benchmarkName:
      "time_remote_file_reading.HDF5PyNWBRos3PreloadedFileReadBenchmark.time_read_hdf5_pynwb_ros3_preloaded_with_cache",
    parameterCaseName: "OphysTestCase",
    reason: "Isolated network stall: 6.77 s against 0.83-2.89 s (median 0.93 s) for the other five runs.",
  },
];

const excludedKeys = new Set(
  EXCLUDED_SAMPLES.map((sample) =>
    [sample.machineId, sample.timestamp, sample.benchmarkName, sample.parameterCaseName].join("\u0000"),
  ),
);

/** Whether one sample is on the curated exclusion list. */
export function isExcludedSample(
  machineId: string,
  timestamp: string,
  benchmarkName: string,
  parameterCaseName: string | null,
): boolean {
  return excludedKeys.has([machineId, timestamp, benchmarkName, parameterCaseName ?? ""].join("\u0000"));
}
