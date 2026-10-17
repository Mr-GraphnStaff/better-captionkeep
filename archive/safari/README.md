# Safari archive — deferred from 6.0

On 2026-10-14 the project lead removed Safari completely from the 6.0 release and requested an archive for a later major version. This is a scope decision, not a passed test, abandoned defect, or a claim of Safari support.

Active 6.0 targets: Chrome, Edge, Brave, Firefox and Opera. Safari has no build target, release hash requirement, certification matrix row, Store submission or native-helper support in 6.0.

## Recoverable material

- `pre-deferral/scripts/build-browser-targets.mjs`: exact pre-deferral build-script snapshot containing the Safari manifest transformation.
- `pre-deferral/tests/background-bootstrap.test.cjs`: exact pre-deferral synthetic document/worker bootstrap fixtures. These are archived reference material and are not run by the active test suite.
- `../../docs/deferred/safari/`: preserved Mac handoff and cloud-testing research, marked deferred.
- Existing generated Safari package/folder snapshots are moved out of `dist/prod` into ignored `output/archive/safari/2026-10-14/`. Those local binaries are not version-controlled; the source archive and documents are.

The earlier family test-kit ZIP in Downloads remains untouched. All old packages are preliminary pre-BYOMCP builds, not certified releases. Historical dated reviews retain their original evidence and receive a superseded-scope note.

## Reintroduction requires an explicit later-major decision

Deferral verification (2026-10-14): 430 automated tests passed, zero failures/skips; lint, seven-page surface audit, five-browser packaging and Store art rendering passed. Independent scope review confirmed exact five target lists, rejection of Safari build requests and preservation of original source/bootstrap/handoff content. No live certification, Store publication or 5.4 changes are claimed. Azure Boards and the existing three-hour standup now reflect the five-browser scope.

Do not execute the archived scripts or restore old packages as current releases. Reassess contemporary Apple APIs, signing/Store requirements, permissions, macOS native-helper integration, dependency ordering and browser/provider acceptance. Port the relevant pieces into current production files, regenerate packages and collect real Safari/macOS evidence. No prior snapshot establishes support or certification.
