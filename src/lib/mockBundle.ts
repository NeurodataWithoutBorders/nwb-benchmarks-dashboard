// The results bundle `?test&mock_data` loads in place of the published one: every benchmark type
// the figures read, for one recognizably fake machine and two fake environments, with values drawn
// from fixed formulas and a seeded generator, so every snapshot of it comes out alike. It is a
// bundle in the published format and goes through the same reading and processing code.

import type { Bundle } from "./database";
import { FILE_OPEN_ORDER, PYNWB_READ_ORDER } from "./methods";
import { seededRandom } from "./stats";

export const MOCK_MACHINE_ID = "test-injection-machine";
export const MOCK_MACHINE_NAME = "TestInjectionMachine";
export const MOCK_ENVIRONMENT_IDS = ["test-a-environment", "test-b-environment"];
const MOCK_URL = "https://test-injection.invalid/asset.nwb";
const MODALITIES = ["Ecephys", "Ophys", "Icephys"] as const;
const MODALITY_FACTOR = { Ecephys: 1, Ophys: 0.8, Icephys: 1.6 };
const SLICE_STOPS = { Ecephys: 262144, Ophys: 20, Icephys: 16384 };

/** Typical seconds to open each backend method (h5py and zarr-python), by the order of FILE_OPEN_ORDER. */
const OPEN_SECONDS = [0.7, 0.7, 1.2, 1.3, 5, 6, 1.6, 0.06, 0.15, 0.47];
/** ...and through PyNWB, by the order of PYNWB_READ_ORDER. */
const PYNWB_SECONDS = [5, 5.5, 55, 18, 260, 120, 45, 1.5, 9, 55];
/** Seconds to read the smallest slice, by the order of PYNWB_READ_ORDER. */
const SLICE_SECONDS = [2, 1.8, 2.2, 1.9, 8, 4, 1.2, 1.1, 0.8, 0.9];
/** Bytes a method moves per second of runtime, roughly, by the same order. */
const THROUGHPUT = [2e5, 2.5e5, 4e6, 6e6, 1e7, 1e7, 1.2e7, 3e4, 4e5, 3e4];

const fileReadClass = (method: string): string => {
  if (method.startsWith("lindi")) return "LindiLocalJSONFileReadBenchmark";
  if (method.startsWith("zarr pynwb")) return "ZarrPyNWBFileReadBenchmark";
  if (method.startsWith("zarr")) return "ZarrZarrPythonFileReadBenchmark";
  return method.includes("pynwb") ? "HDF5PyNWBFileReadBenchmark" : "HDF5H5pyFileReadBenchmark";
};

/** The slicing benchmark classes, without and with preloading, by the order of PYNWB_READ_ORDER. */
const SLICE_CLASSES: [string, string][] = [
  ["HDF5PyNWBRemfileNoCache", "HDF5PyNWBRemfilePreloadedNoCache"],
  ["HDF5PyNWBRemfileWithCache", "HDF5PyNWBRemfilePreloadedWithCache"],
  ["HDF5PyNWBFsspecHttpsNoCache", "HDF5PyNWBFsspecHttpsPreloadedNoCache"],
  ["HDF5PyNWBFsspecHttpsWithCache", "HDF5PyNWBFsspecHttpsPreloadedWithCache"],
  ["HDF5PyNWBFsspecS3NoCache", "HDF5PyNWBFsspecS3PreloadedNoCache"],
  ["HDF5PyNWBFsspecS3WithCache", "HDF5PyNWBFsspecS3PreloadedWithCache"],
  ["HDF5PyNWBROS3", "HDF5PyNWBROS3Preloaded"],
  ["LindiLocalJSON", "LindiLocalJSONPreloaded"],
  ["ZarrPyNWBS3", "ZarrPyNWBS3Preloaded"],
  ["ZarrPyNWBS3ForceNoConsolidated", "ZarrPyNWBS3ForceNoConsolidatedPreloaded"],
];

const INCREMENTAL = [
  ["HDF5PyNWBLocalIncrementalSliceBenchmark", 0.07, 0.5],
  ["ZarrPyNWBLocalIncrementalSliceBenchmark", 0.08, 0.4],
  ["HDF5PyNWBRemfileWithCacheIncrementalSliceBenchmark", 1.6, 4],
  ["HDF5PyNWBFsspecHttpsWithCacheIncrementalSliceBenchmark", 1.3, 20],
  ["HDF5PyNWBROS3IncrementalSliceBenchmark", 1.1, 40],
  ["HDF5PyNWBLindiIncrementalSliceBenchmark", 1.05, 0.8],
  ["ZarrPyNWBS3IncrementalSliceBenchmark", 0.45, 9],
] as const;

function pyCase(fields: Record<string, string>, sliceRange?: string): string {
  const entries = Object.entries(fields).map(([key, value]) => `'${key}': '${value}'`);
  if (sliceRange) entries.push(`'slice_range': ${sliceRange}`);
  return `{${entries.join(", ")}}`;
}

function sliceRange(modality: (typeof MODALITIES)[number], size: number): string {
  const stop = SLICE_STOPS[modality] * size;
  if (modality === "Ophys") return `(slice(0, ${stop}, None), slice(0, 796, None), slice(0, 512, None))`;
  if (modality === "Ecephys") return `(slice(0, ${stop}, None), slice(0, 384, None))`;
  return `(slice(0, ${stop}, None),)`;
}

function networkResults(seconds: number, throughput: number, jitter: () => number): Record<string, number> {
  const bytes = Math.round(seconds * throughput * jitter());
  const packets = Math.max(1, Math.round(bytes / 1400));
  return {
    amount_downloaded_in_bytes: Math.round(bytes * 0.97),
    amount_downloaded_in_number_of_packets: Math.round(packets * 0.6),
    amount_uploaded_in_bytes: Math.round(bytes * 0.03),
    amount_uploaded_in_number_of_packets: Math.round(packets * 0.4),
    network_total_time_in_seconds: seconds * 1.02,
    total_traffic_in_number_of_web_packets: packets,
    total_transfer_in_bytes: bytes,
    total_transfer_in_number_of_packets: packets,
    total_transfer_time_in_seconds: seconds * 0.9,
  };
}

/** 40 cumulative read times: the open time, then one slice time after another. */
function cumulativeTimes(open: number, perSlice: number, noise: () => number): number[] {
  const values = [open * noise()];
  for (let slice = 1; slice < 40; slice++) values.push(values[slice - 1] + perSlice * noise());
  return values;
}

function machine(): Record<string, unknown> {
  return {
    name: MOCK_MACHINE_NAME,
    version: "1.4.1",
    os: { cpu_count: 8 },
    sys: { platform: "test" },
    platform: { system: "TestOS", machine: "x86_64", platform: "TestOS-1.0-x86_64" },
    psutil: { total_virtual_memory: 34359738368 },
    asv: { cpu: "Test Injection CPU", num_cpu: "8", ram: "34359738368" },
  };
}

function environment(index: number): Record<string, unknown> {
  const versions = [
    {
      python: "3.11.7",
      h5py: "3.14.0",
      pynwb: "3.1.2",
      zarr: "2.18.7",
      fsspec: "2025.7.0",
      lindi: "0.4.4",
      hdmf: "4.1.0",
    },
    {
      python: "3.13.5",
      h5py: "3.16.0",
      pynwb: "4.2.0",
      zarr: "2.18.7",
      fsspec: "2026.9.0",
      lindi: "0.4.6",
      hdmf: "5.0.0",
    },
  ][index];
  return {
    [`${versions.python} | test injection environment`]: Object.entries(versions).map(([name, version]) => ({
      name,
      version,
      build: "test_0",
      channel: "test",
    })),
  };
}

/** The bundle `?test&mock_data` loads. */
export function synthesizeMockBundle(): Bundle {
  const random = seededRandom(20240630);
  const jitter =
    (spread = 0.08): (() => number) =>
    () =>
      1 + (random() * 2 - 1) * spread;
  const noise = jitter();
  const bundle: Bundle = {
    [`machines/machine-${MOCK_MACHINE_ID}.json`]: machine(),
    ...Object.fromEntries(
      MOCK_ENVIRONMENT_IDS.map((id, index) => [`environments/environment-${id}.json`, environment(index)]),
    ),
  };
  let minute = 0;
  const addRun = (environmentIndex: number, results: Record<string, Record<string, unknown>>): void => {
    minute += 37;
    const day = 10 + environmentIndex * 10 + Math.floor(minute / 1440);
    const time = `${String(Math.floor((minute % 1440) / 60)).padStart(2, "0")}-${String(minute % 60).padStart(2, "0")}-00`;
    const timestamp = `2026-01-${String(day).padStart(2, "0")}-${time}`;
    const environmentId = MOCK_ENVIRONMENT_IDS[environmentIndex];
    bundle[`results/timestamp-${timestamp}_environment-${environmentId}_machine-${MOCK_MACHINE_ID}_results.json`] = {
      database_version: "4.0.0",
      timestamp,
      commit_hash: "0000000000000000000000000000000000000000",
      environment_id: environmentId,
      machine_id: MOCK_MACHINE_ID,
      results,
    };
  };

  MOCK_ENVIRONMENT_IDS.forEach((_id, environmentIndex) => {
    // The second environment's fsspec S3 regresses, as it did between the paper's environments.
    const regression = (method: string): number => (environmentIndex === 1 && method.includes("fsspec s3") ? 3 : 1);
    for (let round = 0; round < 2; round++) {
      const reading: Record<string, Record<string, unknown>> = {};
      const network: Record<string, Record<string, unknown>> = {};
      const addRead = (method: string, seconds: number, throughput: number): void => {
        const operation = method.replaceAll(" ", "_");
        const timeName = `time_remote_file_reading.${fileReadClass(method)}.time_read_${operation}`;
        const networkName = `network_tracking_remote_file_reading.${fileReadClass(method)}.track_network_read_${operation}`;
        reading[timeName] = {};
        network[networkName] = {};
        for (const modality of MODALITIES) {
          const key = pyCase({ name: `${modality}TestCase`, https_url: MOCK_URL });
          const value = seconds * MODALITY_FACTOR[modality] * regression(method);
          reading[timeName][key] = [value * noise()];
          network[networkName][key] = networkResults(value, throughput, noise);
        }
      };
      FILE_OPEN_ORDER.forEach((method, index) => addRead(method, OPEN_SECONDS[index], THROUGHPUT[index]));
      PYNWB_READ_ORDER.forEach((method, index) => addRead(method, PYNWB_SECONDS[index], THROUGHPUT[index]));
      addRun(environmentIndex, reading);
      addRun(environmentIndex, network);

      const slicing: Record<string, Record<string, unknown>> = {};
      const slicingNetwork: Record<string, Record<string, unknown>> = {};
      PYNWB_READ_ORDER.forEach((method, index) => {
        SLICE_CLASSES[index].forEach((prefix, preloaded) => {
          const timeName = `time_remote_slicing.${prefix}ContinuousSliceBenchmark.time_slice`;
          const networkName = `network_tracking_remote_slicing.${prefix}ContinuousSliceBenchmark.track_network_during_slice`;
          slicing[timeName] = {};
          slicingNetwork[networkName] = {};
          for (const modality of MODALITIES) {
            for (let size = 1; size <= 5; size++) {
              const key = pyCase(
                { name: `${modality}TestCase${size}`, https_url: MOCK_URL, object_name: "data" },
                sliceRange(modality, size),
              );
              const cached = preloaded && method.includes("cache") && !method.includes("no cache");
              const seconds =
                SLICE_SECONDS[index] * size * MODALITY_FACTOR[modality] * regression(method) * (cached ? 0.15 : 1);
              slicing[timeName][key] = [seconds * noise()];
              slicingNetwork[networkName][key] = networkResults(seconds, cached ? 0 : THROUGHPUT[index] * 4, noise);
            }
          }
        });
      });
      addRun(environmentIndex, slicing);
      addRun(environmentIndex, slicingNetwork);
    }

    const local: Record<string, Record<string, unknown>> = {};
    const localSlicing: Record<string, Record<string, unknown>> = {};
    const downloads: Record<string, Record<string, unknown>> = {};
    for (const [format, readClass, sliceClass, download] of [
      ["hdf5", "HDF5FileReadBenchmark", "HDF5PyNWBLocal", 9000],
      ["zarr", "ZarrFileReadBenchmark", "ZarrPyNWBLocal", 6000],
    ] as const) {
      local[`time_local_file_reading.${readClass}.time_read_local_pynwb`] = {};
      downloads[
        `time_download.${format === "hdf5" ? "HDF5" : "Zarr"}DandiAPIDownloadBenchmark.time_download_${format}_dandi_api`
      ] = {};
      for (const preloaded of ["", "Preloaded"])
        localSlicing[`time_local_slicing.${sliceClass}${preloaded}ContinuousSliceBenchmark.time_slice`] = {};
      for (const modality of MODALITIES) {
        const key = pyCase({ name: `${modality}TestCase`, https_url: MOCK_URL });
        local[`time_local_file_reading.${readClass}.time_read_local_pynwb`][key] = [
          0.4 * MODALITY_FACTOR[modality] * noise(),
        ];
        downloads[
          `time_download.${format === "hdf5" ? "HDF5" : "Zarr"}DandiAPIDownloadBenchmark.time_download_${format}_dandi_api`
        ][key] = [download * MODALITY_FACTOR[modality] * noise()];
        for (const preloaded of ["", "Preloaded"]) {
          for (let size = 1; size <= 5; size++) {
            const sliceKey = pyCase(
              { name: `${modality}TestCase${size}`, https_url: MOCK_URL, object_name: "data" },
              sliceRange(modality, size),
            );
            localSlicing[`time_local_slicing.${sliceClass}${preloaded}ContinuousSliceBenchmark.time_slice`][sliceKey] =
              [0.02 * size * noise()];
          }
        }
      }
    }
    addRun(environmentIndex, downloads);
    addRun(environmentIndex, local);
    addRun(environmentIndex, localSlicing);

    if (environmentIndex === 1) {
      for (let round = 0; round < 2; round++) {
        const incremental: Record<string, Record<string, unknown>> = {};
        for (const [className, perSlice, open] of INCREMENTAL) {
          const name = `track_incremental_slicing.${className}.track_cumulative_slice_times`;
          incremental[name] = {};
          for (const modality of MODALITIES) {
            const key = pyCase({
              name: `${modality}IncrementalSliceTestCase`,
              modality: modality.toLowerCase(),
              https_url: MOCK_URL,
            });
            const factor = MODALITY_FACTOR[modality];
            incremental[name][key] = {
              cumulative_time_in_seconds: cumulativeTimes(open * factor, perSlice * factor, noise),
            };
          }
        }
        addRun(environmentIndex, incremental);
      }
      const lindi: Record<string, Record<string, unknown>> = {
        "time_download.LindiDandiAPIDownloadBenchmark.time_download_lindi_dandi_api": {},
      };
      for (const modality of MODALITIES) {
        lindi["time_download.LindiDandiAPIDownloadBenchmark.time_download_lindi_dandi_api"][
          pyCase({ name: `${modality}TestCase`, https_url: MOCK_URL })
        ] = [3 * noise()];
      }
      addRun(environmentIndex, lindi);
    }
  });
  return bundle;
}
