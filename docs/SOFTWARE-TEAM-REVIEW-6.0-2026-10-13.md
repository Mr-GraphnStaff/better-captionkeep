# Software Team review: Better CaptionKeep 6.0

Date: October 13, 2026
Project: P:/Projects/better-captionkeep-6.0
Branch: codex/6.0
Reviewed product revision: f4d4d02e65d2b69ba59787a49bfdce9ccdfb1769
Verdict: review complete with stated limitations; release not ready.

## Review coverage and independence

All 23 roles in the Software Team package received an explicit review pass.
Three separate reviewers covered product/design (8 roles), engineering (6),
and assurance (3). The coordinator performed operations/release and
documentation/launch/support passes (6). These are four actual agents with
grouped role responsibilities, not 23 separately staffed people.
The coordinator also implemented the preceding UI changes; its own passes
are self-review. Separate reviewers inspected the current artifacts.

The review preserved the full agreed 6.0 feature scope, six-browser commitment,
lightweight popup, advanced Settings/workspace, automatic live capture with
user-controlled pause, and local source/derivative boundaries.
No product code, publication, customer outreach, or Store submission was changed
during this review. The Software Team installation changes were already present.

Methods: source/diff/document inspection, existing artifact/evidence review,
two synthetic in-memory reproductions, and primary browser documentation.
No fresh full build, live provider certification, screen-reader assessment,
participant research, dependency scan, or performance benchmark was performed.
Existing packaging evidence is preparation evidence, not live certification.

## Findings and recommended priorities

### R01 — High: deleted transcripts leave retained Evidence Board excerpts

Evidence: teams-captions-saver/evidenceBoard.js:54 stores caption text and
markedText; sidepanel.js:591 persists evidenceBoardMarkersV1.
SessionManager.deleteSession (sessionManager.js:228), sessionKeys (:45),
pruneExpiredSessions (:83), and clearAllSessions (:429) omit those markers.

Independent assurance executed the actual SessionManager against synthetic
in-memory storage. Deleting the archive removed its caption chunk but left one
marker; Clear All still left the marker. No real meeting data was used.

Owner: database architect + backend engineer; reviewer: security architect + QA.
Acceptance: deleting, clearing, expiring, or pruning a source removes associated
markers and quoted excerpts along with dependent artifacts. Tests must check
residual storage contents, not merely disappearance from the session index.

### R02 — High: Firefox background bootstrap uses a worker-only loader

Evidence: scripts/build-browser-targets.mjs:75 produces Firefox
background.scripts containing service_worker.js. service_worker.js:1 calls
importScripts, which is a WorkerGlobalScope API rather than a document API.
Safari's optional document background environment needs the same verification.

This is a static compatibility finding supported by primary documentation,
not an observed loaded-Firefox failure:
- [MDN background manifest](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/manifest.json/background)
- [MDN WorkerGlobalScope.importScripts](https://developer.mozilla.org/en-US/docs/Web/API/WorkerGlobalScope/importScripts)

Owner: integration engineer; reviewer: frontend + QA.
Acceptance: document and worker environments load ordered dependencies using
compatible bootstraps; installed Firefox starts with no background errors and
captures, archives, opens the workspace, and exports. Verify Safari's actual
selected environment separately on macOS.

### R03 — High: Rolling Notes can retain stale earlier source text

Evidence: rollingNotes.js:33 sourceRevision uses caption count and latest caption
key/text; update at :121 returns current when those match.
boundedBatch at :91 revisits only the last caption when the revision changes.

Independent engineering executed a three-caption synthetic example, generated
notes, changed caption 1, then forced refresh. The result was changed:false,
reason:current, and the draft retained the original caption 1.

Owner: data engineer; reviewer: QA.
Acceptance: first, middle, and final caption corrections update affected notes
and citations, retain revision lineage, and do not duplicate results on an
unchanged repeat. Test concurrent new captions and restart behavior.

### R04 — High: smoke checks can pass unusable UI and fail without stopping release

Evidence: browser-surface-smoke.mjs:52 marks success when a screenshot exists.
The catch at :57 records errors, but :65 reaches successful process completion.
The candidate pipeline can therefore continue after a browser smoke failure.
reliability.test.cjs:1869 checks source strings for the prior UI regressions.

Owner: QA + platform engineer.
Acceptance: blank/hidden Settings, horizontal clipping, unreachable actions,
failed section navigation, and browser execution errors fail meaningful
rendered assertions and return a failing process result. Retain screenshots,
computed measurements, build identity, and test results. Separate preparation
mode from the stricter certification gate when browsers are unavailable.

### R05 — High: browser/provider certification and complete-scope evidence remain open

Evidence: dist/prod/browser-certification.json records every browser as
pending-live-validation and all 18 browser/provider combinations as pending.
Chrome, Edge, Brave, and Firefox have Settings screenshot evidence only.
Opera is absent from this host; Safari requires macOS.

RELEASE-6.0.md:5 says feature-complete while ROADMAP-6.0.md:121 and :125 leave
derivative expansion and template revision hardening open.
promptTemplates.js:12 sanitizes templates to ID/name/instructions; built-ins
and saved templates lack the promised revision metadata.

Owner: product/business analysis + release manager.
Acceptance: every agreed feature has an implementation/evidence entry, remaining
work has an owner, and versioned templates preserve the exact version used by
derivatives. Complete separate loaded-extension provider tests, then freeze.
No feature removal or reduced browser commitment is assumed by this report.

### R06 — Medium: capture state, provider copy, and theme behavior still disagree

Evidence:
- popup.js:203–208 classifies source unavailable without checkpointError as
  starting; :341 reports source unavailable at the same time.
- popup.js:364 adds Microsoft 365 transcription language without provider gating.
- theme.js apply retains system; theme.css:60 only supplies System/dark behavior.
- theme.css:29 light tokens inherit native color-scheme:dark.
- viewer.js:1442 uses pale success/warning colors for meaningful analytics values;
  those semantic colors are not replaced in the light token block.

Owner: UX/content + frontend/accessibility.
Acceptance: status labels and recovery actions agree across popup/workspace/badge;
Meet/Zoom omit Teams-only warnings; System follows both OS appearances and changes
while open; native controls and meaningful text meet verified contrast targets.

### R07 — Medium: policy changes may allow stale Rolling Notes to be persisted again

Evidence: sidepanel.js:291–295 writes note revisions directly to local storage;
update/toggle paths at :310/:331 do not recheck disableSessionHistory.
Policy change handling at :1214 refreshes policy but does not reset rolling
processing. Cleanup may be followed by a write from stale in-memory state.

Classification: static race concern, not a live reproduced policy bypass.
Owner: backend + security.
Acceptance: define active-session storage under disabled retention; check policy
at note writes; prove completed/denied data cannot reappear after policy changes,
meeting end, or restart.

### R08 — Medium: interruption and long-meeting durability need targeted checks

Evidence: sessionManager.js:149–163 stages archive generations, publishes the
index, then removes the previous generation. Abrupt termination bypasses caught
cleanup. Indexed pruning and Clear All do not sweep abandoned generation chunks.

captureCoordinator.js:122 queues a persistence request for each interim update;
writeCheckpoint at :63 clones/writes complete transcripts with no coalescing.
sidepanel polls every 1.2 seconds, transfers entire transcripts, reconciles a
full index, and scans before limiting rendered rows.

Classification: plausible recovery/scaling risks; no measured latency defect.
Owners: database/data/backend + reliability/performance.
Acceptance: interruption tests at each publish boundary preserve the correct
archive and remove demonstrably abandoned generations. Measure 1,000/10,000
caption idle/active workloads, pending checkpoint work, memory, payload size,
and responsiveness before selecting optimizations.

### R09 — Medium: documentation and Store art disagree with current behavior

Evidence:
- RELEASE-6.0.md:14 and store-assets/6.0/source.html:6 still show Keep this meeting.
- readme.md:97 and wiki/Getting-Started.md:7 describe explicit caption enablement,
  conflicting with automatic capture behavior.
- CHROMEWEBSTORE.md:91 also describes manually choosing when captions start.
- wiki/Troubleshooting.md still describes a public 5.3.2 baseline.
- Store images are separately authored synthetic presentation HTML, not proof
  that the current packaged interface works.

Owner: technical writer + content/launch + support.
Acceptance: current 6.0 instructions match actual controls, automatic capture,
pause/recovery, and the current archive terminology. Keep historical release
records clearly labeled. Capture final Store screenshots from the frozen product
with synthetic data and verify copy against shipped behavior.

## All 23 role recommendations

| Role | Recommendation |
| --- | --- |
| Product manager | Preserve full scope; replace completion claims with feature-to-evidence traceability (R05). |
| Business analyst | Specify capture states, retention semantics, and template version contracts with testable examples (R01/R05/R06/R07). |
| Delivery manager | Track owners/dependencies on the critical path; finish defects and feature gaps before freeze/certification. |
| UX researcher | Observe users joining, recognizing capture, pausing/resuming, finding the last transcript, and exporting; do not substitute AI personas for research. |
| UX architect | Establish a consistent recovery journey and source-state model across entry points (R06). |
| UI designer | Resolve System and explicit themes across all surfaces and native controls (R06). |
| Accessibility engineer | Verify contrast, keyboard order, zoom/reflow, announcements, and screen-reader tasks on the final build; no compliance claim from a static audit alone. |
| Content designer | Use provider-relevant status language and consistent workspace/transcript/receipt names (R06/R09). |
| Software architect | Define one small presentation contract for waiting/starting/live/paused/unavailable/recovery/error (R06). |
| Frontend engineer | Correct theme/status defects and verify rendered transitions and geometry (R04/R06). |
| Backend engineer | Enforce dependent-data/policy boundaries at writes; measure and bound redundant checkpoint work (R01/R07/R08). |
| Database architect | Delete all dependent excerpts and reconcile abandoned archive generations safely (R01/R08). |
| Data engineer | Detect earlier caption corrections and preserve valid cited note lineage (R03). |
| Integration engineer | Correct document/worker bootstraps and validate actual Firefox/Safari runtimes (R02). |
| QA engineer | Make behavioral checks fail on real regressions; execute the separate browser/provider and upgrade matrix (R04/R05). |
| Security architect | Block retention acceptance until residual marker text is removed; test policy-change races (R01/R07). |
| Performance engineer | Establish reproducible long-meeting measurements before optimization or performance promises (R08). |
| Platform/DevOps engineer | Fail candidate checks meaningfully; bind packages to reproducible source, including clean-tree or explicit dirty-source identity. |
| Site reliability engineer | Exercise restart, interruption, storage failure, meeting departure, and recovery with a data-preservation runbook (R08). |
| Release manager | Freeze only after open scope and certification criteria pass; retain unchanged-window, Store parity, and upgrade evidence. |
| Technical writer | Refresh the 6.0 quick start/recovery docs and preserve clearly labeled historical records (R09). |
| Product marketing/launch lead | Derive claims and screenshots from verified frozen behavior; keep browser certification wording exact (R05/R09). |
| Customer success/support | Provide a private-data-safe triage path for caption, save, policy, and upgrade failures with current UI labels (R09). |

## Operations and launch observations (coordinator self-review)

verify-release.mjs:129–130 records HEAD plus artifact hashes but does not reject
uncommitted product input or record a source-content digest. This is a hardening
recommendation, not a claim that current package hashes are invalid.

The existing release process requires 48 uninterrupted hours on an unchanged
candidate (RELEASE_PROCESS.md:80), and distinguishes frozen/uploaded/in-review/
approved/public/listing-synchronized/upgrade-verified. Keep that process.
EUC-DEPLOYMENT.md:263 provides policy pause/removal guidance and explicitly does
not assume Store package downgrade. Rehearse preservation and recovery for the
actual 6.0 archive before relying on it.

Support.md already prohibits transcripts, participant data, credentials, and
private URLs in reports. Preserve that boundary while making the new recovery
instructions accurate. No customer outreach or publication was performed.

## Proposed execution order

1. Fix residual evidence retention and Firefox background initialization.
2. Fix Rolling Notes correction handling and resolve policy/restart risks.
3. Complete template/provenance commitments and remaining state/theme/copy work.
4. Replace screenshot-exists checks with reproducible behavioral QA that stops on failure.
5. Measure long-meeting workloads and run recovery, accessibility, and upgrade tests.
6. Complete separate Chrome/Edge/Brave/Firefox/Opera/Safari provider evidence,
   including the Mac test, without claiming unavailable checks passed.
7. Align documentation and capture final artwork from the actual product.
8. Freeze revision/hashes, complete the unchanged candidate window, and prepare
   governed Store promotion and post-publication upgrade/listing verification.

This review recommends repairs and evidence collection; it does not authorize
publication or change the agreed 6.0 scope.

