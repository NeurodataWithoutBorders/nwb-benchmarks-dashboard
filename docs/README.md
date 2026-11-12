# Live Testing

## Live test injections

| URL                    | What it should look like                                                                          | Try it                                                                             |
| ---------------------- | ------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| `?test&mock_data`      | The dashboard on a synthesized bundle: one fake machine, two fake environments, every figure full | [Open](https://brain-bbqs.github.io/nwb-benchmarks-dashboard/?test&mock_data)      |
| `?test&freeze_loading` | The loading card held part-way through a download (793 KB of 1.9 MB)                              | [Open](https://brain-bbqs.github.io/nwb-benchmarks-dashboard/?test&freeze_loading) |
| `?test&load_error`     | The loading card after a failed download, with its retry button and the dropzone                  | [Open](https://brain-bbqs.github.io/nwb-benchmarks-dashboard/?test&load_error)     |

`?test` alone (without one of the above) is a no-op that never changes anything by itself.

Every fake is obviously fake (the mock machine is `TestInjectionMachine`, its environments are `test-a-environment` and `test-b-environment`, its URLs are under `test-injection.invalid`, and the injected error says it is one) so it is never mistaken for real data.
Nothing is written to `localStorage`, so all of the above are safe to try at any time.

`mock_data` builds its bundle in `src/lib/mockBundle.ts` from fixed formulas and a seeded generator and hands it to the same reading, filtering and drawing code the published bundle goes through, at the one point main.ts would otherwise have fetched it.
The Chromatic dashboard snapshots use it to capture every figure deterministically.
Filters in the URL combine with it (`?test&mock_data&machine=nobody` shows every card's empty state).

Add a row here for every injection the app grows, and read the `visual-snapshots` skill under `.claude/skills/` before adding one.

## The manuscript view

`?manuscript` is not a test injection but a view for people: it draws each figure from the selection nwb-benchmarks' `generate_figures` draws the manuscript's version from (`MANUSCRIPT_SELECTIONS` and `MANUSCRIPT_FIGURE_SELECTIONS` in `src/lib/filters.ts`).
Figures 3 and 5 take the LBNL Mac's results since 2025-11-01 in the 2026-10-07 environment, and Figure 4b and the incremental slicing figure take the same machine's results in all the dated environments.
Changing any filter leaves the view, starting from the reference selection.

## Parity with the Python figures

The figures port nwb-benchmarks' Python figure code (`src/nwb_benchmarks/database/_processing.py` and `_visualization.py`), and `tests/unit/parity.test.ts` checks the port number by number against that code.
Its inputs are `tests/fixtures/parity-bundle.json.gz`, a small slice of the published results bundle, and `tests/fixtures/parity-expected.json`, what the Python code computed from that slice.

Both are written by `tests/parity/generate_expected.py`, which runs the Python code itself; rerun it whenever the analysis in nwb-benchmarks changes:

```bash
python -I tests/parity/generate_expected.py --bundle path/to/bundle.json.gz --nwb-benchmarks path/to/nwb-benchmarks
```

The app itself never runs Python.
The curation it shares with the Python code (the paper's machine IDs, environment dates and equivalent environments, and the excluded samples) lives in `src/lib/curation.ts` and has to be kept in step by hand.
