# Rendered checks and synthetic workload baseline

Run the development/build tests with Node.js 22 or newer, which supplies the native WebSocket client used by the browser debugging connection. Package engines, GitHub validation/release and the Azure agent bootstrap now use the same minimum. This is a development-tool requirement; the extension does not depend on Node.js.

`node --test tests/rendered-surface-checks.test.cjs` checks the current source using installed Google Chrome. The checks verify Settings navigation, popup reachability, system theme changes and native control schemes, viewer primary/secondary tools, an empty handoff, and the Live Workspace. Negative experiments deliberately hide Settings, create horizontal overflow, and throw a script exception; each must fail the gate.

`node scripts/browser-surface-smoke.mjs` checks packaged files in each installed Chromium browser and records each actual assertion. It serves those files temporarily on loopback with fixture extension APIs. This verifies rendered interface behavior, not real extension privileges, live capture, upgrade behavior, or provider compatibility. Firefox screenshot capture is marked `captured`, not passed. Unavailable browsers are `not-run`.

`node scripts/measure-meeting-workloads.mjs` creates a reproducible synthetic baseline at `dist/prod/meeting-workload-baseline.json`. An optional first argument chooses another output file. It reports warmed median, p95, and maximum CPU durations for 1,000 and 10,000 captions: idle rolling updates, corrections to an earlier caption, and reconciliation of 500 markers. Source hashes identify the measured implementation. Batch preparation time is reported separately.

The baseline excludes DOM rendering, IPC, storage latency, browser memory, and live providers. It establishes measurements for further investigation; it neither certifies browsers nor declares a performance budget passed.

## Recorded synthetic baseline

Measured 2026-10-14 01:11:51 UTC on Node.js v22.23.2, Windows, AMD Ryzen 9 7950X. Each operation had 3 warmups and 20 measured samples. The ordinary Node context executes the unchanged production modules; a VM sandbox was discarded because its property-lookup overhead distorted CPU timing.

| Captions | Rolling idle median / p95 | Earlier revision median / p95 | 500 markers median / p95 |
|---|---|---|---|
| 1,000 | 1.53 / 1.74 ms | 1.58 / 1.83 ms | 1.37 / 1.63 ms |
| 10,000 | 14.93 / 15.49 ms | 14.98 / 15.52 ms | 2.11 / 3.11 ms |

Full backlog preparation, distinct from a single periodic update, took 72 ms for 42 batches at 1,000 captions and 6,202 ms for 417 batches at 10,000 captions. Idle results returned `current` with no change; earlier revisions returned `updated` with changes. These observations justify a browser responsiveness investigation at large backlogs, not an unmeasured optimization or a browser performance verdict.

Measured SHA-256:

- rollingNotes.js: `a9596a896e9e16c57ead934a5b1bbc73018d015ad83161fd75eac28f925a1acd`
- evidenceBoard.js: `773681d5210a336ec6462971bea285d969dc105877fd4fe99c604627d9e3d663`

## October 14 prepared-source comparison

The workload tool now compares ordinary mutable inputs with module-created,
immutable prepared inputs in the same process and checks identical resulting
note state/provenance. Preparation is included in the backlog total, not hidden
inside an idle measurement. Three warmups and 20 samples per operation remain.

Measured October 14, 2026, 13:41:09 UTC, Node 22.23.2 on the same Windows/Ryzen host:

| Captions | Ordinary full backlog | Prepared backlog, including snapshot | Ordinary idle p95 | Prepared idle p95, excluding snapshot |
| --- | --- | --- | --- | --- |
| 1,000 | 42.35 ms | 7.56 ms | 1.09 ms | 0.18 ms |
| 10,000 | 3,640.35 ms | 283.28 ms | 13.48 ms | 1.23 ms |

10,000-caption snapshot preparation alone took 13.74 ms. This is a same-build
comparison of two input paths, not a cross-browser latency claim. The workspace
yields between catch-up batches; real browser responsiveness and storage still
require live acceptance. Mutable inputs continue to be rehashed, so cached
fingerprints cannot silently ignore edits to caller-owned transcript arrays.

Measured rollingNotes.js SHA-256:
`b238449f06299083ce469547b29e5a43c02c21c04410c3b3cbeec6f811bb0536`.
Re-run if that source changes; do not treat these measurements as current after
an implementation revision.
