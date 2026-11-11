# User Test Checklist

|            |         |
| ---------- | ------- |
| **Tester** | <enter> |
| **Date**   | <enter> |

A basic manual pass through the app before a release or after a significant change.
Run through this on the deployed site.
Copy this file to `docs/user_tests/<tester>.md`, fill it in, and open it as a PR titled `User test: <Tester>`.

## Loading the results

- [ ] Opening the page downloads the latest results, showing progress, and then shows the dashboard
- [ ] "Load another bundle" returns to the loading card, and "Download the latest results" loads them again
- [ ] Dropping a downloaded `bundle.json.gz` (from the `dist` branch of nwb-benchmarks-results) loads it instead
- [ ] Dropping something that is not a bundle says why it was refused

## Filters

- [ ] The page opens on "Paper: all reference environments", and the address bar carries its filters
- [ ] "Paper: 2025-09-01 environment" shows the same numbers as the paper's Figure 3
- [ ] Narrowing a facet (a machine, an environment, a package version) updates every figure and the counts beside the other facets' values
- [ ] The date range and the curated-exclusions checkbox change the figures
- [ ] Reloading the page, or opening its address in another tab, keeps the filters

## Figures

- [ ] Each figure's own controls (color scale, network metric, slicing, benchmark, compare by, time axis) redraw it
- [ ] Hovering a cell, point or cross shows its values
- [ ] "Show as in the paper" switches to the paper's selection for that figure
- [ ] "Table" lists the figure's numbers, and "Download CSV" and "Download SVG" save them
- [ ] A selection a figure cannot draw (e.g. one environment for the versions figure) says why instead

## Cross-cutting

- [ ] Reloading the page mid-task doesn't leave local state (localStorage) in a way that breaks the next load
- [ ] The app is usable in both light and dark OS/browser theme, and the header toggle flips between them
- [ ] Basic responsiveness: window resized narrower doesn't break layout or hide controls
- [ ] Loading the page shows no unexpected errors in the browser console
- [ ] Can navigate to all hyperlinks in the bottom-left, and "What's New" opens with the current version's entry

## Extra notes
