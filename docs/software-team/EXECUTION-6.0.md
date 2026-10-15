# 6.0 Software Team execution ledger

## October 14 shareable-summary addition

Lead-approved roadmap gate16 is implemented locally: transcript viewer More
transcript tools opens a separate shareable-summary workspace with explicit
source selection, reviewed editable draft, confidentiality/explicit privileged
designation, and labelled copy/TXT/Print-PDF. Source transcript stays unchanged;
no automatic AI/MCP/email submission or new persistence. Original source links
and identifiers are not automatically exported. Edits invalidate review.

Independent QA reproduced and repaired missing-policy and asynchronous
policy/source-check defects, publicly tracked as #152/#153 under feature #151
and Azure Task #347. Nineteen focused checks including real Chrome narrow/theme
and print-media assertions pass. Full integrated suite: 449 passed, zero
failures/skips. Eight-page surface audit, lint, development
build and release-state checks pass. Live five-browser acceptance, actual PDF
pagination/downloads and legal/recipient review remain separate requirements;
cross-resource checks are best-effort, not an atomic disclosure guarantee.

Project: Better CaptionKeep, P:/Projects/better-captionkeep-6.0, codex/6.0.
Review baseline: f4d4d02. Date: October 13, 2026.
The original review remains in ../SOFTWARE-TEAM-REVIEW-6.0-2026-10-13.md.

## Implemented repair batch

Scope update, October 14, 2026: the lead removed Safari completely from 6.0
and reserved it for a later major version. The supported release targets are
Chrome, Edge, Brave, Firefox, and Opera, with 15 live provider cells. Safari
preparation is [archived](../deferred/safari/README.md). Dated execution below
retains original evidence; old six-target artifacts are historical, not current
candidate inputs. Five-target regeneration and validation are required.

| Review | Owner | Implementation and verification | Remaining acceptance |
| --- | --- | --- | --- |
| R01 | Database/security/backend/QA | Source deletion, expiry, pruning, and Clear All remove dependent Evidence Board excerpts. Marker updates merge individual deltas under the worker history queue and reject missing sources. In-memory deletion/race tests. | Loaded-extension deletion and managed-policy UAT. |
| R02 | Integration/frontend | Document backgrounds preload ordered dependencies; workers load synchronously. Historical Firefox/Safari/Chromium fixtures existed before the scope change. | Actual installed Firefox provider certification; Safari fixtures are archived, not a 6.0 gate. |
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
   Firefox, and Opera: all 15 supported provider/browser combinations.
2. Accessibility tasks, browser performance, failure/restart, upgrade, retention,
   privacy, and export review on the exact candidate.
3. Reconcile every full-scope roadmap commitment against final evidence.
4. Regenerate and approve actual-product Store screenshots/copy.
5. Freeze exact commit/hashes, complete the unchanged candidate window, and
   follow the governed Store submission/approval/public parity/upgrade process.

The software-team package and this ledger travel with the repository.
No Store publication or browser certification is implied by this repair batch.

## October 14 top-to-bottom execution pass

Starting revision: 360cae2. Four actual agents performed engineering, UX/UI,
assurance and coordinator/Scrum Master passes, with independent cross-review.
The full scope remains in ROADMAP-6.0.md; old committed programs were not dropped.

| Track | Executed work | Verification boundary |
| --- | --- | --- |
| Capture/reliability, Task #343 | Meet/Zoom terminal callback ordering and rejoin, immutable Teams archive snapshots, serialized recovery generations, canceled Leave intent and badge retry | Executable lifecycle/failure tests; actual provider acceptance open |
| Worker/privacy, Task #344 | Recovery identity response, authoritative citation/count/key checks, retention and image restrictions, review-snapshot cleanup | Actual worker tests and isolated native Chromium storage/recovery/deletion checks; live policy/provider UAT open |
| Advanced UI, Task #345 | Templates view, original Ask/Notes binding, per-meeting drafts, immutable copied safety rules, explicit no-answer path, Moment PNG/alt/export, native focus modal, narrow layout, contrast presets, stable correction/status refresh | Function tests and real Chrome 300px keyboard/contrast/template/Ask/Moment flow with fixture APIs; assistive technology and actual downloads/live providers open |
| Release control, Task #346 / CAP-14 #305 | One versioned development status record and three checked views; full artifact/branch validation; Node22 alignment and codex CI trigger; staged/ZIP source parity | Local tests; protected CI run and final public promotion evidence still required |
| Scrum Master | Created Epic #335 / Features #336-342 / Tasks #343-346; preserved inherited #298/#308/#318; corrected stale #252/#284 and CLI project default; linked public issues with revision-tested patches | Live Azure reads and post-write verification; no fabricated owners/sprints/velocity or premature closures |
| Existing public backlog | #14 capture-tab defense, #38 real read-only MCP header setup, #82 additional optional themes | Each keeps its original acceptance limits; no new permission or default-theme change |

The intermediate integrated source suite passed **341/341**, with no skips,
before the subsequent paused-provider repair and reading-first workspace redesign.
That count is not final-source packaging evidence. Independent UI review passed ten function cases and a real Chrome
advanced rendered workflow. The benchmark's prepared 10,000-caption path completed
the same backlog/state in 283 ms including snapshot preparation, versus 3,640 ms
for mutable inputs in the same build; this is CPU-module evidence, not live-browser
performance certification. See RENDERED-AND-PERFORMANCE-CHECKS.md.

PUBLIC-DEFECTS-6.0.md indexes all public reports, including retrospectively
documented October 13 fixes. Issues remain open with local/deployed/live distinctions.
The lead authorized pushing this branch and opening a **draft** PR after checks.
No merge, Store submission or public 6.0 certification is authorized or implied.

The integrated work was committed as 99e2648 and pushed to `codex/6.0`.
Draft PR #137 is open and attached to the task. Managed-locale defect #136 was
subsequently repaired with independent ten-test acceptance and pushed as 42d706f;
the full local gate passed 358 tests plus the packaging/runtime/source-parity
checks. Protected Linux validation revealed a Chrome debugging startup failure;
the actual Azure lifecycle run 741 separately revealed stale Node 20 selection.
Both findings remain under #105; startup diagnostics and Azure runtime correction
are being retested. CI success is not implied by the local pass.

The lead also explicitly required BYOMCP before 6.0 release, clarifying this is
user-owned MCP rather than publisher-hosted AI. Roadmap gate 15, the new draft
ADR and UX/assurance contracts preserve that requirement. It is not implemented
or approved by inclusion alone. Remote placement, native enrollment, credentials,
aggregate job quota and resolved-address/resource authorization require review.

### Latest user-directed workspace iteration

The user's live meeting screenshot identified excessive chrome competing with
conversation: a prominent On the Fly explanation, repeated per-caption actions,
heavy identifiers, newest-first cards and nested scrolling. The reading-first
redesign retains advanced tools but discloses them on selection, uses quiet
chronological speaker/time rows, and makes Follow latest explicit. Screenshots,
participant identities and actual meeting content are not public test fixtures.
The reading-first source is frozen for integration, not a release-candidate freeze.
Independent QA passed 26 focused production-function/workflow regressions and the
actual Chrome rendered test, including 300/400/1280 widths, keyboard focus beyond
150 captions and highlighted words/reading position surviving new captions.
Missing-source actions and policy-wait selection races (#133/#134) fail closed.
The full integrated suite now passes 353/353 with zero skips. Final package,
source-parity and CI evidence are separate gates; live certification remains open.

The complete local release-candidate command passed on October 14: 353 tests,
extension validation, seven-surface audit, zero dependency vulnerabilities,
Store metadata checks, six browser packages, separate rendered Chrome/Edge/Brave
checks and eight native-extension smoke checks per browser, Store-equivalent ZIPs,
Intune bundle and source-parity/hash/SBOM verification. Firefox captured a
screenshot only; Opera and Safari did not run. This execution prepares a
development handoff, not a certified or frozen release candidate. Build provenance
is regenerated against the committed source before the authorized draft PR.

Confirmed defect #132 independently reproduces paused Meet/Zoom capture missing
leave/rejoin boundaries and combining sessions. Production provider/content and
coordinator fixtures now pass eight lifecycle regressions. Lifecycle observation
remains enabled while caption retention and automatic caption enabling stay off.
Same-meeting resume preserves the session; rejoin begins a fresh paused session.
Independent QA review passed; authenticated live provider acceptance remains open.

## October 14: concrete BYOMCP integration and release preparation

Starting commit for this continuation: `b9f52d7`. Actual runtime, Settings,
independent QA and release-engineering assignments delivered these local changes:

- Optional native permission, strict nonsecret configuration, concrete native
  enrollment/inventory adapter, fresh policy/capacity checks and exact typed
  source-bound approvals. No helper starts on ordinary capture or page load.
- Runnable Node.js 22+ helper for both pinned SDK transports; Cloudflare official
  execute compatibility is a finite existing-record DNS compiler with independent
  GET-only verification. Generic tools are not automatically promoted to actions.
- Verified results pin actual separate source-linked Receipts. Strict profile
  fields, single-use proof handling, retention rollback and workspace inventory
  regressions were repaired; public defects remain open for applicable acceptance.
- Separate offline helper ZIP, dependency licenses, CycloneDX SBOM and per-file
  hashes, verified against direct source/lock bytes and included in release
  provenance. Candidate validation requires all three helper artifact hashes.
- Correct Edge Store runtime identity, deterministic observable theme/focus
  checks and strong prototype IDs. Optional permission review metadata now has
  exact justification coverage rather than silently ignoring nativeMessaging.
- Shareable-summary privacy/UI repairs and attendee Open/Close controls are
  integrated. Safari is archived, not a 6.0 certification target or blocker.

Observed local complete `npm run release:candidate`: **489/489 extension tests,
28/28 helper tests, zero skips or failures**, eight-page/54-script surface audit,
zero vulnerabilities in both dependency audits, Store metadata, five browser
packages, separate Chrome/Edge/Brave rendered and loaded-extension smoke checks,
Intune bundle, both Store ZIPs and helper/source/hash/SBOM/provenance verification.
The generated provenance records the starting commit and a dirty source tree;
it must be regenerated after committing, not represented as a frozen candidate.
Firefox captured a screenshot only; its native checks did not run. Opera and all
15 authenticated browser/provider cells remain unverified. Later metadata and
workflow-artifact follow-ups require their focused reruns before push.

Independent Cloudflare/runtime review passed 51 focused checks. No real DNS write,
directory-person query, credential provisioning or OS native installation was
performed. The registered Cloudflare connection in Codex passed an identity check
only, not a CaptionKeep helper test; no Codex credentials were copied. Task #348
under Feature #318 tracks the actual installed-provider acceptance work. No merge,
Store submission, publication, legal privilege determination or complete-UAT
claim follows from this implementation handoff.

Final-source follow-up verification: **494/494 extension tests passed, zero
failures/skips**, including actual offline helper ZIP extraction/import and
execution of the workflow checksum command against synthetic files. Eight Store
metadata tests, lint, eight-page surface audit, checked development-status views
and current package verification passed. Optional permission justification is
now enforced and single-purpose/privacy copy discloses opt-in MCP sharing.
Future release workflow preserves the existing Store-only checksum contract and
adds a complete-distribution checksum manifest; both are included with the
helper and all five browser packages in attestation/upload/draft asset paths.
No release workflow, tag, native installation or publication was triggered.

## October 14: authorized branch sync and local-helper setup

The lead approved bringing master history into the 6.0 branch only, keeping
draft PR #137 unmerged and publishing nothing. Merge commit `c60ab32` preserves
the newer public 5.4 listing/installation records alongside checked 6.0 status.
No 5.4 checkout, package or live Store listing was changed by this integration.

Azure 749 failed because Development ran root tests before installing the optional
helper SDK. GitHub validation on `c41fcc1` passed the complete candidate gate,
which installs those dependencies first. Azure now uses root dependency install,
locked helper setup with lifecycle scripts disabled, then tests. Two regression
checks cover ordering and unchanged candidate/production approval boundaries.
After the documentation sync and setup repair, **496/496 integrated tests passed
with zero skips/failures**; checked status and Store metadata also passed. Remote
acceptance requires the new push and rerun, not the old GitHub success.

The lead also approved local Brave helper registration and a read-only connection
test, excluding DNS changes and directory lookups. He clarified the desired
Cloudflare MCP uses OAuth in VS Code. Nonsecret registration inspection did not
copy credentials. Public protected-resource discovery confirms the Cloudflare
resource and authorization-server identity; it is not authenticated acceptance.
The earlier helper accepted separately provisioned bearer credentials only.
Helper-owned interactive OAuth is now implemented locally and independently
tested; no VS Code/Codex credential store was read or reused. Two real consent
attempts failed before credential persistence (the second at token exchange).
Cloudflare's required read-only preset expansion conflicts with the original
narrow requested scope set; public defect #162 records that compatibility failure.
The lead explicitly approved the read-only preset, rejection of write scopes,
discarding refresh tokens and no persistent login. That explicit session mode is
implemented. The fresh retry succeeded on October 15 UTC and the private installed
helper performed authenticated `tools/list`: four schemas returned, including
`whoami`; no tool invocation or enabled action. The temporary credential must be
removed after this bounded test. Native extension enrollment remains separate.

Revision `9307752` passed both GitHub validation runs, CodeQL and Azure Lifecycle
751; PR #137 is mergeable but remains a draft and unmerged. Those remote results
do not certify the subsequent unpushed OAuth changes. The latest focused OAuth,
independent security and native-probe suite passes **44/44, zero skips**.

The optional host was registered per-user for one isolated Brave caller, from an
owner-protected local NTFS installation (not the shared project drive). Two
browser attempts verified the no-permission denial, but did not complete the
actual optional permission grant or native enrollment. A new visible mode awaits
the person's real Connect click; no permission bypass or invented enrollment is
accepted. All test actions remain disabled and metadata inventory is the only
authorized remote operation. Full release certification remains pending.

Final OAuth-source local candidate gate passed: **522 extension tests and 47
helper tests, zero failures/skips**, both dependency audits report zero
vulnerabilities, and the eight-page/54-script surface audit passed. All five
browser packages and the optional helper ZIP/SBOM/source hashes verified.
Isolated Chrome/Edge/Brave rendering and loaded-extension smoke passed; Firefox
captured a screenshot only and Opera was unavailable. Those smoke results do
not certify live meeting providers or actual Store-installed upgrades. The
generated provenance reflects development work, not a frozen release candidate.

