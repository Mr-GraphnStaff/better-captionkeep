# 6.0 Software Team execution ledger

Project: Better CaptionKeep, P:/Projects/better-captionkeep-6.0, codex/6.0.
Review baseline: f4d4d02. Date: October 13, 2026.
The original review remains in ../SOFTWARE-TEAM-REVIEW-6.0-2026-10-13.md.

## Implemented repair batch

| Review | Owner | Implementation and verification | Remaining acceptance |
| --- | --- | --- | --- |
| R01 | Database/security/backend/QA | Source deletion, expiry, pruning, and Clear All remove dependent Evidence Board excerpts. Marker updates merge individual deltas under the worker history queue and reject missing sources. In-memory deletion/race tests. | Loaded-extension deletion and managed-policy UAT. |
| R02 | Integration/frontend | Document backgrounds preload ordered dependencies; workers load synchronously. Executable Firefox/Safari/Chromium background fixtures. | Actual installed Firefox and Safari/macOS provider certification. |
| R03 | Data/QA | Rolling state detects earlier-caption corrections/truncation, supersedes stale output, and rebuilds bounded batches. Restart/idempotency/paused tests. | Long live meeting correction UAT. |
| R04 | QA/platform | Real rendered visibility, geometry, navigation, theme/control, viewer, workspace, and empty-handoff assertions; injected blank/overflow/exception cases fail. Browser smoke errors return nonzero. | Firefox rendered interactions and all real extension/provider APIs. |
| R05 | Product/analysis/frontend/data | Versioned built-ins/custom templates, bounded revision history, explicit Duplicate, source-bound reviewed handoff snapshots, draft distinction, cited source excerpts in reviewed notes/answers. | Feature-by-feature final full-roadmap review and live regeneration workflows. |
| R06 | UX/UI/accessibility/content | System light/dark changes, native control schemes, contrast tokens, source-unavailable status and provider-relevant copy. Behavioral and rendered tests. | Manual keyboard/zoom/screen-reader and localized layouts. |
| R07 | Backend/security/QA | Retention-disabled rolling notes use browser-session storage. Current policy is checked at writes, migration failure removes local copies, stale temporary fallback is avoided, source deletion cleans temporary derivatives. | Live managed-policy transition and meeting-end UAT. |
| R08 | Backend/database/reliability/performance | Coalesced checkpoint writes; final flush includes late captions; archive-generation ownership journals and cautious restart cleanup. Synthetic failure/interruption tests and workload baseline. | Live browser storage/IPC/memory and interrupted-upgrade recovery. |
| R09 | Writer/content/support/release | Updated 6.0 capture instructions, current action wording, accurate completion status, and artwork regeneration warning. Historical 5.4 artifacts remain versioned. | Final screenshots from frozen product; owner-reviewed Store copy and receipts. |

## Evidence and boundaries

Focused tests execute production functions with synthetic in-memory storage and
browser fixtures. Rendered checks run actual installed Chromium browsers against
the packaged files with documented fixture extension APIs. Their scope must not
be reported as live provider certification.

The workload tool measures pure-module CPU time at 1,000/10,000 captions.
Checkpoint burst tests establish one active writer and two writes for a blocked
1,000-update burst plus a prior-caption correction. These are bounded synthetic
observations, not browser performance or durability guarantees.

See RENDERED-AND-PERFORMANCE-CHECKS.md for repeatable commands and scope.
Release provenance now records a source tree hash and dirty-worktree indicator
as well as commit and artifact hashes.

## Remaining release gates

1. Loaded-extension Teams/Meet/Zoom tests separately in Chrome, Edge, Brave,
   Firefox, Opera, and Safari/macOS. Mac test requires an available Mac.
2. Accessibility tasks, browser performance, failure/restart, upgrade, retention,
   privacy, and export review on the exact candidate.
3. Reconcile every full-scope roadmap commitment against final evidence.
4. Regenerate and approve actual-product Store screenshots/copy.
5. Freeze exact commit/hashes, complete the unchanged candidate window, and
   follow the governed Store submission/approval/public parity/upgrade process.

The software-team package and this ledger travel with the repository.
No Store publication or browser certification is implied by this repair batch.

