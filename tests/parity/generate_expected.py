"""Regenerate the parity fixture and the figure values the dashboard must reproduce from it.

The dashboard ports the figure code of nwb-benchmarks (``nwb_benchmarks.database``) to TypeScript.
This script is the reference side of that port: it cuts a small slice of the published results
bundle into ``tests/fixtures/parity-bundle.json.gz``, runs nwb-benchmarks' own processing and
plotting code on it, and writes what that code computed into ``tests/fixtures/parity-expected.json``.
``tests/unit/parity.test.ts`` then checks the dashboard's numbers against those, figure by figure.

It is developer tooling only; the app never runs Python. Rerun it whenever the analysis code in
nwb-benchmarks changes:

    python -I tests/parity/generate_expected.py \
        --bundle path/to/bundle.json.gz \
        --nwb-benchmarks path/to/nwb-benchmarks

``bundle.json.gz`` is the file on the ``dist`` branch of nwb-benchmarks-results. The script needs
polars 1.x (its figure code uses arguments polars 2 removed), pandas, numpy, matplotlib,
seaborn and packaging, but not an installed nwb-benchmarks.
"""

import argparse
import gzip
import json
import math
import pathlib
import sys
import tempfile
import types
import warnings

LBL_MAC_MACHINE_IDS = [
    "87fee773e425b4b1d3978fbf762d57effb0e8df8",
    "a853f2f47d9930a78fdcf0766673deebc3fcd14f",
    "16b244cd5a970ac0d7fefcb46c6ab0476075e5b5",
]
EXCLUDE_OLDER = "2025-11-01"
OTHER_MACHINE_ID = "7143ac57434caee3a699fea97be5855842f2e0b7"

# Which runs of the published bundle the fixture keeps, by environment: every run of the 2025-09-01
# environment (the paper's reference), one file-open and one slicing run of the two older
# environments (for the performance-over-versions figure), and one round of the 2026-10-07
# environment that carries a curated exclusion and the incremental slicing benchmark.
FIXTURE_RESULT_TIMESTAMPS = {
    "052cb4d925793bbbc270d9384a60bc24023025b7": None,
    "9e225115ea6c99b60d419454a9457bb5db93c7b7": ["2025-11-20-19-31-41", "2025-11-21-10-03-37"],
    "15d059d5b6b9047f9bbeb4ac77bb4461411904c7": ["2025-11-22-03-15-37", "2025-11-22-21-08-36"],
    "42bfe7119727f6ab276361065e27b6e5fa5bbdc9": [
        "2026-10-29-18-20-35",
        "2026-10-30-04-37-19",
        "2026-10-30-15-31-21",
        "2026-10-30-15-33-08",
        "2026-10-30-15-39-20",
        "2026-10-30-23-20-18",
        "2026-11-02-23-20-14",
        "2026-11-03-20-29-10",
    ],
}
# Kept so the dashboard's own gates (minimum version, machine, date) have something to drop.
FIXTURE_EXTRA_RESULTS = [
    "results/timestamp-2026-10-27-20-41-03_environment-11386b894283a4c3e9c4b4fbe3834713015fe6ba_machine-7143ac57434caee3a699fea97be5855842f2e0b7_results.json",
]
FIXTURE_EXTRA_ENVIRONMENTS = ["e833ef393e1bef9cf9915915b1604a87c7b004dc"]
INCREMENTAL_VALUES_KEPT = 60

CONTEXTS = {
    "2025-09-01": "052cb4d925793bbbc270d9384a60bc24023025b7",
    "2026-10-07": "42bfe7119727f6ab276361065e27b6e5fa5bbdc9",
}


def build_fixture(*, bundle: dict) -> dict:
    fixture = {}
    environment_ids = set(FIXTURE_RESULT_TIMESTAMPS) | set(FIXTURE_EXTRA_ENVIRONMENTS)
    for key, value in bundle.items():
        directory, filename = key.split("/", 1)
        if directory == "environments":
            if filename.removeprefix("environment-").removesuffix(".json") in environment_ids:
                fixture[key] = value
        elif directory == "machines":
            if filename.removeprefix("machine-").removesuffix(".json") in [*LBL_MAC_MACHINE_IDS, OTHER_MACHINE_ID]:
                fixture[key] = value
        elif directory == "results":
            if key in FIXTURE_EXTRA_RESULTS:
                fixture[key] = value
                continue
            machine_id = value.get("machine_id")
            environment_id = value.get("environment_id")
            if machine_id not in LBL_MAC_MACHINE_IDS or environment_id not in FIXTURE_RESULT_TIMESTAMPS:
                continue
            timestamps = FIXTURE_RESULT_TIMESTAMPS[environment_id]
            if timestamps is not None and value["timestamp"] not in timestamps:
                continue
            if timestamps is None and value["timestamp"] < EXCLUDE_OLDER.replace("-", "-"):
                continue
            fixture[key] = truncate_incremental(results_file=value)
    return dict(sorted(fixture.items()))


def truncate_incremental(*, results_file: dict) -> dict:
    results = {}
    for benchmark_name, parameter_cases in results_file["results"].items():
        if benchmark_name.startswith("track_incremental_slicing."):
            parameter_cases = {
                case: {variable: values[:INCREMENTAL_VALUES_KEPT] for variable, values in case_results.items()}
                for case, case_results in parameter_cases.items()
            }
        results[benchmark_name] = parameter_cases
    return {**results_file, "results": results}


def write_tree(*, bundle: dict, directory: pathlib.Path) -> None:
    for key, value in bundle.items():
        path = directory / key
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(value))


def import_database_modules(*, nwb_benchmarks: pathlib.Path):
    # The package's own __init__ pulls in the benchmark runner; only the database code is needed.
    package = types.ModuleType("nwb_benchmarks")
    package.__path__ = [str(nwb_benchmarks / "src" / "nwb_benchmarks")]
    sys.modules["nwb_benchmarks"] = package
    import matplotlib

    matplotlib.use("Agg")
    import matplotlib.figure
    import matplotlib.pyplot

    # Only the numbers are wanted; skip drawing and saving every figure.
    matplotlib.figure.Figure.savefig = lambda *args, **kwargs: None
    matplotlib.pyplot.savefig = lambda *args, **kwargs: None

    from nwb_benchmarks.database import _processing, _visualization

    _visualization.BenchmarkVisualizer.plot_benchmark_dist = lambda *args, **kwargs: None
    return _processing, _visualization


def clean(value):
    if isinstance(value, float) and math.isnan(value):
        return None
    if hasattr(value, "item"):
        return clean(value.item())
    return value


def records(frame) -> list[dict]:
    return [{key: clean(value) for key, value in row.items()} for row in frame.to_dict(orient="records")]


def read_csv(path: pathlib.Path) -> list[dict]:
    import pandas

    if not path.exists():
        return []
    return records(pandas.read_csv(path))


def derive_names(*, processing, bundle: dict, scratch: pathlib.Path) -> dict:
    """How the preprocessing names every benchmark and parameter case in the whole bundle."""
    import polars

    write_tree(bundle=bundle, directory=scratch / "repository")
    (scratch / "db").mkdir()
    db = processing.BenchmarkDatabase(results_directory=scratch / "repository", db_directory=scratch / "db")
    db.create_database()
    frame = (
        db.get_results()
        .with_columns(polars.col("parameter_case_slice_range").list.first().alias("first_slice"))
        .collect()
    )

    def distinct(columns: list[str]) -> list[dict]:
        rows = frame.select(columns).unique().sort(columns, nulls_last=True).to_dicts()
        return [{key: clean(value) for key, value in row.items()} for row in rows]

    names = {
        "benchmarks": distinct(
            [
                "benchmark_name",
                "benchmark_name_type",
                "benchmark_name_test",
                "benchmark_name_operation",
                "benchmark_name_label",
                "benchmark_name_clean",
                "is_preloaded",
                "is_local",
            ]
        ),
        "modalities": distinct(["parameter_case_name", "modality"]),
        "scaling": distinct(["first_slice", "scaling_value"]),
    }
    return names


def dump_one_row_per_line(value, indent: str = "") -> str:
    """JSON with each table row on a line of its own, so a change in one value is a one-line diff."""
    if isinstance(value, dict) and value and not all(isinstance(item, (str, int, float, bool, type(None))) for item in value.values()):
        inner = indent + " "
        items = [f"{inner}{json.dumps(key)}: {dump_one_row_per_line(item, inner)}" for key, item in sorted(value.items())]
        return "{\n" + ",\n".join(items) + "\n" + indent + "}"
    if isinstance(value, list) and value:
        inner = indent + " "
        items = [inner + dump_one_row_per_line(item, inner) for item in value]
        return "[\n" + ",\n".join(items) + "\n" + indent + "]"
    return json.dumps(value, sort_keys=True)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument("--bundle", required=True, type=pathlib.Path)
    parser.add_argument("--nwb-benchmarks", required=True, type=pathlib.Path)
    parser.add_argument("--fixtures", type=pathlib.Path, default=pathlib.Path(__file__).parents[1] / "fixtures")
    args = parser.parse_args()
    warnings.filterwarnings("ignore")

    with gzip.open(args.bundle, "rt") as stream:
        bundle = json.load(stream)
    fixture = build_fixture(bundle=bundle)
    fixture_bytes = json.dumps(fixture, separators=(",", ":")).encode()
    with open(args.fixtures / "parity-bundle.json.gz", "wb") as raw:
        with gzip.GzipFile(fileobj=raw, mode="wb", mtime=0, compresslevel=9) as stream:
            stream.write(fixture_bytes)

    processing, visualization = import_database_modules(nwb_benchmarks=args.nwb_benchmarks)
    expected = {"source": {"lbl_mac_machine_ids": LBL_MAC_MACHINE_IDS, "exclude_older": EXCLUDE_OLDER}, "contexts": {}}

    with tempfile.TemporaryDirectory() as scratch:
        scratch = pathlib.Path(scratch)
        results_directory = scratch / "results-repository"
        db_directory = scratch / "db"
        db_directory.mkdir()
        write_tree(bundle=fixture, directory=results_directory)
        base_db = processing.BenchmarkDatabase(
            results_directory=results_directory,
            db_directory=db_directory,
            machine_ids=LBL_MAC_MACHINE_IDS,
            exclude_older=EXCLUDE_OLDER,
        )
        base_db.create_database()

        for label, environment_id in CONTEXTS.items():
            summary_directory = scratch / "summaries" / label
            visualizer = visualization.BenchmarkVisualizer(
                output_directory=scratch / "figures", summary_tables_directory=summary_directory.parent
            )
            visualizer._set_environment_output_context(label, environment_caption_dates=[label])
            db = base_db.with_environment_id(environment_id)
            visualizer._plot_environment_specific_figures(db)
            directory = visualizer.summary_tables_directory

            def table(name: str) -> list[dict]:
                return read_csv(directory / name)

            expected["contexts"][label] = {
                "environment_id": environment_id,
                "heatmap": {
                    "remote_file_open": table(f"method_rankings_heatmap_remote_file_open_{label}_summary.csv"),
                    "remote_file_open_pynwb": table(
                        f"method_rankings_heatmap_remote_file_open_pynwb_{label}_summary.csv"
                    ),
                    "remote_slicing_not_preloaded": table(
                        f"method_rankings_heatmap_remote_slicing_not_preloaded_largest_range_{label}_summary.csv"
                    ),
                    "remote_slicing_preloaded": table(
                        f"method_rankings_heatmap_remote_slicing_preloaded_largest_range_{label}_summary.csv"
                    ),
                },
                "file_open_network": {
                    "backend": table(f"file_open_total_transfer_in_bytes_runtime_scatter_{label}_summary.csv"),
                    "pynwb": table(f"file_open_total_transfer_in_bytes_runtime_scatter_pynwb_{label}_summary.csv"),
                },
                "slicing_network": {
                    "not_preloaded": table(
                        f"slicing_total_transfer_in_bytes_runtime_trajectory_not_preloaded_{label}_summary.csv"
                    ),
                    "preloaded": table(
                        f"slicing_total_transfer_in_bytes_runtime_trajectory_preloaded_{label}_summary.csv"
                    ),
                },
                "incremental_overview": table(f"incremental_slicing_overview_{label}.csv"),
                "incremental_curves": {
                    modality: table(f"incremental_slicing_cumulative_time_{modality.lower()}_{label}.csv")
                    for modality in ["Ecephys", "Ophys", "Icephys"]
                },
            }

        expected["derived_names"] = derive_names(
            processing=processing, bundle=bundle, scratch=scratch / "full-bundle"
        )

        visualizer = visualization.BenchmarkVisualizer(
            output_directory=scratch / "figures", summary_tables_directory=scratch / "summaries"
        )
        visualizer._set_environment_output_context(None)
        over_time = {}
        for benchmark_type in ["time_remote_file_reading", "time_remote_slicing"]:
            visualizer.plot_performance_across_versions(base_db, benchmark_type=benchmark_type)
            rows = read_csv(scratch / "summaries" / f"performance_over_{benchmark_type}_summary.csv")
            # The figure joins every result row to each package of interest; one package's rows
            # are the results once.
            over_time[benchmark_type] = [row for row in rows if row["package_name"] == "h5py"]
        expected["performance_over_time"] = over_time

    (args.fixtures / "parity-expected.json").write_text(dump_one_row_per_line(expected) + "\n")
    print(f"Wrote {len(fixture)} fixture files ({len(fixture_bytes) / 1e6:.2f} MB uncompressed).")


if __name__ == "__main__":
    main()
