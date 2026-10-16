# 6.0 Software Team execution ledger

## October 16 VM release-preparation increments

Windows NEW-install development CLI now packages with the helper. It reviews the
exact request/runtime/package/registry plan before INSTALL, provisions only a new
private root, refuses existing registrations and persists an ownership receipt.
Removal reviews the exact receipt/target before REMOVE and retains files and
credentials. Independent security/QA review found no remaining blocker within
this bounded increment. Real Windows execution exposed an unnecessary WRITE_OWNER
request; the corrected adapter verifies existing ownership and persists only the
Access section, then reads back exact protected owner/System/Admin permissions.
Actual ACL test passed separately; default helper suite has 128 passed, one
explicit opt-in ACL test skipped, zero failures.

An isolated VM installation from the hash-verified helper ZIP passed. Actual Brave
minimal and production-native-client-wrapper probes returned challenge-ok and
wrapper-challenge-ok respectively; completion was denied by the diagnostic guard.
Receipt-owned unregistering succeeded; both registry views again return an absent
default value (the empty key is intentionally retained). Synthetic configuration
and package files remain private for inspection. No provider request, MCP server
or tool execution, authentication or host-state copy occurred. This is not normal
Settings/no-coaching acceptance. Issue170 retains Azure Task348/Feature318 linkage.
Signed/standalone distribution, existing-profile/account preservation and generic
vendor-owned sign-in remain unfinished release work.

Store promotion scripts now verify accepted candidate/commit/hash/report/target
evidence before credentials/network and upload the already verified byte snapshot.
Existing remote draft/staged publication paths are disabled because a local
receipt or version cannot prove remote bytes. Independent review caught and
removed that unsafe shortcut. The 48-hour timestamp is explicitly a release-owner
attestation, not independently measured continuous freeze. Focused stubbed tests
pass 27/27; development status still validates without fabricating readiness.
Confirmed release defect is public #171; specific Azure defect linkage awaits
authenticated Boards access (established release parent is Epic335).

Browser smoke now closes the browser before its socket, waits for process-tree
shutdown, validates its created temp directory before bounded lock retries, and
waits for a page target. Actual Edge/Opera each passed 67 rendered assertions.
Parallel testing exposed a delayed Node exit-notification race after taskkill;
the correction waits the existing bounded exit budget and retains real failures.
Focused cleanup/rendered checks pass 15/15; full extension suite passes 591/591,
zero skipped. Lint and surface audit pass. Public test-harness defect is #172;
its specific Azure linkage likewise awaits access. No defect is closed merely
from these tests. The integrated candidate packaging gate is the next check;
source remains development/unfrozen, and no Store action or merge is authorized.

## October 16 VM environment readiness and single-writer ownership

The lead directly resumed this VM chat and assigned it implementation ownership;
host source and host engineering remain read-only/paused. No competing scheduler
was created. The host source still matches the 471-file handoff baseline, with
the original seven tracked modifications and twelve untracked source files.
All newer VM work remains preserved; the older ZIP was not reapplied.

Environment audit verified WinDev2407Eval / Microsoft Virtual Machine in both
terminal and native Computer Use. The managed in-app browser read a unique proof
page served only at guest 127.0.0.1, matching the terminal proof and hostname.
Native Explorer focus/read control also succeeded. No host desktop was targeted.

Verified tools: Git 2.55.0, gh 2.102.0, Node 24.20.0 (meets >=22), npm 11.19.0,
system PowerShell 7.6.7 (bundled PATH runtime 7.6.5), Windows PowerShell 5.1,
VS Code 1.141.2 and ripgrep 15.2.0. Chrome 155.0.8059.85, Edge 155.0.4283.45,
Brave 155.1.97.59, Firefox 157.0.1 and Opera 137.0.6036.39 are installed.
The actual desktop package is OpenAI.Codex 26.1013.3656.0 (ChatGPT.exe), separate
from codex-cli 0.163.0-alpha.10.2. No working tool was blindly reinstalled.
All 44 root and 13 helper installed dependency versions match their lockfiles;
npm ls is clean for both. Dependencies were not copied from the host.

Installed the complete 17-file portable project Software Team package as a
separate VM user skill at C:/Users/User/.agents/skills/software-team. All hashes
match the project package and all relative links resolve; project skills were
not overwritten. No redirected host C: share exists, so parity with the newer
host-global persona package remains optional/unverified. No plugin cache copied.

Guest Balanced AC sleep changed from 900 seconds to Never (0); AC hibernate was
already Never and remains 0. Queried effective values after both commands. DC
values remain sleep 600 seconds / hibernate 0. Prior values, rollback commands
and after-query are retained in the VM transfer evidence directory. Hyper-V
reports S1/S2/S3 and hibernation unavailable due firmware/Device Guard; no security,
lock, authentication, auto-login or host power settings were changed. Guest power
settings cannot prevent host sleep/shutdown/reboot or network loss.

Remaining environment limits: the saved app project currently points C:/Project,
not C:/Projects/better-captionkeep-6.0, and this chat is projectless in app metadata.
Registering the actual repo as the primary local project requires the user's app
UI; no supported project-creation tool is exposed and desktop-app UI automation
is prohibited by the installed Computer Use skill. Commands continue explicitly
in the correct local repo. The connected GitHub tool reads the expected commit;
gh CLI is unauthenticated and Azure CLI is absent. No credentials were imported.
Outbound messages to the authorized host chat failed because its thread/host
could not be resolved (reported unavailable durable host); incoming handoffs
arrive, but two-way delivery is not established. Do not report those failed
messages as sent. Live meeting acceptance remains blocked by unavailable test
accounts, per the lead's instruction to use automated/synthetic checks.

## October 16 VM restoration and missing-registration diagnosis

Terminal and Computer Use both report WinDev2407Eval; terminal hardware reports
Microsoft Virtual Machine. Host source is accessible at the redirected
`\\TSCLIENT\P\Projects\better-captionkeep-6.0` and was accessed read-only.
The transfer ZIP matches its SHA256SUMS.txt. The host HEAD is
7baceaf9cb392a8b7a67f976f7bd1fdfb4f21ad7 on codex/6.0; all 471 manifest source
hashes and the seven-modified/twelve-untracked source status match the package.
Restored an independent clone at `C:\Projects\better-captionkeep-6.0`.
All 471 restored hashes matched, including original mixed line endings, and the
reconstructed original seven-file full-index patch has SHA-256
3a6145257ccddb6b32bb4de9710facd5de3dc02bb2673e68215154a872ea5174.
Stale clone index sizes were refreshed only for paths whose clean hash equaled
HEAD; no changes were staged. Dependencies were installed from lockfiles.
No host credentials, OAuth stores, profiles, native registrations or dependencies
were copied. Transfer verification logs and synthetic rendered artifacts remain
outside the checkout in the VM transfer directory.

Restored extension suite: 574/574, zero skipped; lint and development build pass.
The initial helper run was 111/112: the real Windows OS adapter rejected a missing
native-host registry key as os-unavailable. Read-only isolation showed ACL and
volume checks succeed, while a missing registry key produces empty stdout:
Windows PowerShell 5.1 ConvertTo-Json emits no output for null. Corrected the
registry-read branch in createWindowsInstallerIo's fixed OS script to emit the
JSON literal null explicitly; other serialization and strict parsing remain.
Installer tests now pass 15/15 and full helper tests 112/112, zero skipped.
The fix is local and unpublished; it does not establish the host Brave root cause.
Independent review reran all 15 installer tests and the actual missing-key read.
Additional injected-executor probes preserved null and existing string values;
empty/malformed output and process failures still reject os-unavailable. No
actionable finding in this bounded fix; installed-host acceptance is unchanged.

The VM has no CaptionKeep Chrome/Edge current-user registration at the checked
keys. Actual isolated Brave minimal and production-wrapper challenge probes
return host-not-found; neither completes enrollment, changes registration, reads
credentials, authenticates a provider or executes a tool. This is VM evidence,
not a rerun against the host's installed user profile. Issue #170 / Azure Task348
and Feature318 remain open; independent no-coaching onboarding and host-installed
browser acceptance remain outstanding. PR137 remains draft; no release approval.

## October 16 checkpoint: preserve multiple service profiles

PR137 c45263e is green in GitHub validation/CodeQL and Azure Lifecycle773.
The installed Windows command launcher also answered a framed local challenge
and exited0; that is still not browser-owned discovery/launch acceptance.

Added pure changeProfileRegistry() for safe add/update/remove transformations.
Both current/result registries use the existing strict validator; operations
require the expected whole-registry digest, and replacements/removals also bind
the exact profile ID, revision and digest. Unrelated profiles, callers and grants
are preserved. The function snapshots inputs before awaiting; final-profile
removal requires a separate disconnect flow under the nonempty-registry contract.
Six new synthetic tests and full helper suite112/112 pass. This does not persist
changes: the future caller must atomically compare previousDigest before saving.
No UI wiring, concurrent Cloudflare OAuth store, credentials, native registration
or provider operation is supplied by this increment. Independent security/QA
reran all six tests and additional typed-action preservation checks; no blocking
finding in this pure-module scope. Existing browser-control limitation is unchanged; work continued
on this independent onboarding requirement rather than fabricating acceptance.

## October 16: implementation resumed; installed helper handshake verified

The lead explicitly resumed work until resolution after the failed Brave setup.
Coordinator owns integration; bounded active assignments cover browser discovery
diagnostics and a safe existing-installation Windows registration repair module.
Neither assignment constitutes a signed production installer or accepted setup.

Read-only inspection found the registered manifest, launcher, Node runtime and
configuration present with the supplied extension caller allowlisted. A real
framed enrollment-challenge sent to the installed helper returned successfully
and the process exited cleanly. No enrollment completion, provider login,
inventory or tool operation was requested. The browser-reported host-not-found
cause is not established; do not infer it from absent Brave-specific registry
entries. Browser control initialization failed in the available runtime, leaving
actual installed-browser connection verification outstanding.

The old markup test incorrectly rejected the explicitly permitted nonsecret
guided service label and HTTPS URL. It now permits exactly those two fields,
still rejects password fields and preserves the disclosure assertions. Focused
Settings/setup/native-client tests: 28/28 passed. Full extension rerun: 567/567
passed; lint passed. Multi-account credential resolution formerly selected the
first matching resource URL; it now binds resource, profile ID, revision and
definition digest. Five synthetic regressions and the helper suite (104/104 at
that checkpoint) passed. This is not live multi-account provider acceptance.

Independent security/QA found Windows ACL-adapter and standard-ancestor problems
in the registration-repair increment despite passing mock tests. These were
corrected and real read-only Windows ACL/volume/registry checks now pass. Final
helper suite: 106/106 passed, zero skipped. The
module is a bounded existing-installation registration repair, not a signed
distribution, complete installer, generic OAuth flow or safe profile merger.
The global Cloudflare OAuth store still contains one account record; the new
profile binding fails closed, but concurrent Cloudflare OAuth accounts remain
unfinished. No live registration, credentials or provider resources changed.
The independently reviewed runtime/account-binding and bounded registration
repair files are committed as c45263e. Other onboarding, setup-test, packaging,
prototype and context edits remain local and must not be represented as included
in that commit. The local helper ZIP verified after source authors froze their
files; it is a development distribution, not a signed standalone installer.
Public issue170 has the sanitized diagnostic evidence; it remains open and
linked to Azure Task348 / Feature318. No release readiness claim.

## October 15: user rejects MCP onboarding

Lead reports inability to set up their own MCP with current instructions and
states the feature must be substantially easier to be usable. M01 is a reported
FAIL, not merely an unrun test. Exact installed build/browser and first failing
step are unknown; do not claim an independently reproduced transport error.
Source inspection confirms dependence on externally prepared binding JSON and
missing guided setup. High-severity release blocker #170 is public and linked
to Azure Task348. Required correction is user-facing one-time helper setup and
guided Add service/sign-in/verify/first reviewed operation for both transports;
no routine manual JSON/hash/browser-ID/registry editing. Implementation and fresh
independent no-coaching acceptance remain open. No permissions or live resources
changed during this defect intake.

## October 15: tester-facing acceptance packet

Lead requested a practical document to begin QA. Added TESTER-ACCEPTANCE-6.0.md:
build identity, Brave first session, exact actions/expected behavior, blank result
records, all sixteen gates, fifteen browser/provider cells, accessibility/source/
failure/upgrade checks and separate stdio/remote MCP acceptance. No case is marked
passed by document creation. Guided onboarding and elongated-sphere drift remain
explicit acceptance gaps; prior helper DNS execution does not certify browser UI.
README and dated engineering matrix link to the packet. Documentation preparation
does not execute live meetings, install helpers, grant access, change DNS, certify
browsers or approve publication. Independent QA reviewed the packet and requested
explicit new-meeting default-on versus same-meeting pause checks and exact summary
stamps/recipient review; both clarifications are incorporated. Forty unique case
IDs and four relative reference links checked; whitespace validation passed.

## October 15: complete MCP catalog and actual Cloudflare TXT test

Engineering delivered optional catalog profiles, helper prepare/execute proposals,
browser worker bindings, exact trusted Settings approval, stdio/remote transport
support and explicitly selected full-access session OAuth. QA reproduced and
engineering repaired duplicate catalog-name ambiguity, final write-policy race,
and native EOF allowing pending dispatch (public #169). Generic results remain
unverified returned data; typed independently observed Receipts are separate.
Natural-language meeting action generation is not implied by this advanced UI.

Local checks: 561/561 extension tests, 77/77 helper tests, lint, eight-page/55-script
surface audit and rendered HTTP fixture passed. Helper packaging and development
build passed. No current full-candidate gate or fresh CI success is claimed.

The lead explicitly approved Cloudflare's broad full-access grant and separately
authorized only a unique temporary TXT add/read/delete on the named test zone.
Despite Brave blocking the callback page, the helper received and exchanged the
authorization successfully. The installed helper enrolled, discovered the actual
server catalog, created the unique TXT, independently read its exact content,
reverified unique name/type/value/ID before deletion, deleted only that ID, and
separately confirmed absence. Private evidence remains outside tracked source;
no credentials or account identifiers are published. Refresh tokens discarded.
Initial private harness Windows CMD quoting failed before enrollment/upstream
calls; corrected direct installed CLI framing passed. This is installed-helper
protocol evidence, not browser host discovery or Settings trusted-click proof.
No existing record changed. Browser UI/restart/denial and full release acceptance
remain separate open gates; no merge or Store publication performed.

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

## October 14 evening: connection recovery and cleanup

The first real manual Brave attempt observed a trusted Connect click and actual
optional nativeMessaging permission, but enrollment did not complete. Direct
helper-process framing/challenge passed; that does not prove browser-native
launch. A subsequent browser reload had no optional grant, so that attempt
cannot diagnose the host. No grant, manifest permission, or browser preference
was fabricated to obtain a passing result.

Temporary Cloudflare access was revoked at the issuer's discovered revocation
endpoint: HTTP 200, followed by HTTP 401 for an authenticated metadata-only
request using the same token. No refresh token was retained. The file-safety
guard denied deleting the encrypted file, which remains on disk; verified
revocation is not represented as verified file deletion. No new sign-in is
needed to establish that this temporary authorization is no longer usable.

Public defect #163, linked to Azure Task #348, records the unbounded permission
wait that left Settings disabled. The local correction adds bounded permission,
policy and helper waits, actionable live status, restored controls and late-grant/
stale-response guards; the original synchronous permission call and worker-side
grant check are retained. Independent integration review and latest whole-suite
results are recorded with the subsequent commit, not inferred from an older run.

On `12806ec`, Azure Lifecycle 752 and CodeQL passed, but both GitHub validations
failed at Linux Edge browser startup, not a product test assertion. The exact
startup cause remains unconfirmed. The tooling correction preserves bounded,
redacted diagnostic prefix/tail and captures browser identity before launch;
background-network isolation now matches the existing native harness. Sandbox,
startup deadline and required assertions remain unchanged. Windows Edge's 67
rendered checks passed; a fresh Linux CI run is still required.

Recovery integration: **530/530 extension tests, zero failures/skips**, lint and
the eight-page/54-script surface audit passed. Independent recovery review ran
18 focused checks, including actual Chrome DOM events with a controlled permission
fixture, plus a separate timeout/late-grant/fresh-policy-denial probe with zero
helper sends. This is not a real Brave permission or native-host acceptance test.
Helper tests remain **47/47**, zero skips/failures; the latest full packaging gate
is rerunning against these final sources. Native bootstrap remains open rather
than bypassing optional permission to manufacture success.

Completed recovery checkpoint, code revision `5da5796`: the full local candidate
gate passed all **530 extension and 47 helper tests**, zero failures/skips, both
dependency audits, lint/surface audits, five-browser packaging, helper ZIP/SBOM
and source/hash verification. Provenance recorded that revision with a clean
worktree. GitHub push run `38666796151`, PR run `38666800943`, CodeQL and Azure
754 all passed; Azure PR-merge 755 also succeeded on a merge verified to contain
`5da5796`. Its release-candidate stage was skipped by the existing release-branch
condition, not executed. Linux main tests: 522 passed, 8 platform skips, zero
failures; helper tests: 47 passed, zero skips. Linux Chrome/Edge rendered and
loaded-extension smoke passed. Firefox was screenshot-only, not native tested.
No live provider certification, Brave installed-helper enrollment, Store upgrade,
release freeze, merge or publication follows from this repair checkpoint.

## October 15: first-party Cloudflare MCP implementation comparison

The lead requested comparison against Cloudflare's real API MCP implementation,
not another retry of the same native setup. Reviewed first-party repository
revision `e85737947299bbb9b5858fc9ae6bc6d1e6f9a3ba`: README, `src/mcp-handler.ts`,
OAuth handler/scopes, and the pinned official SDK 2.3.1 implementation. Cloudflare
uses standard SDK handling with stateless 2025 compatibility and JSON/SSE shaping.
The previous authenticated metadata discovery is evidence that OAuth worked for
that test; it does not diagnose the separate browser-to-helper enrollment failure.

Confirmed #164: our wrapper accepted only POST/JSON, rejected valid SSE, empty
202/204 responses and MCP GET/DELETE, and pinned a modern wire revision without
legacy fallback. The repair delegates negotiation to the official SDK and passes
bounded incremental streams and standard lifecycle responses while preserving
exact HTTPS resource, public IPv4 DNS, authorization ownership, redirect denial,
byte limits, cancellation and deadlines. SDK tests exercise modern and 2025-only
peers through the production adapters. No real API object GET/DELETE is enabled
by supporting MCP session lifecycle at the exact reviewed endpoint.

Confirmed #165: native runtime errors were discarded and reduced to a generic
failure. The repaired Connect path propagates only fixed diagnostic enums;
Settings distinguishes missing/forbidden/failed/exited hosts, timeout and
enrollment mismatch without exposing raw errors or paths. Metadata-only verified
connections remain connected with actions off, rather than appearing disconnected
or failing review merely because no typed action is configured. Typed execution
filters and approvals are unchanged; arbitrary discovered tools remain unusable.

Independent checks: 53/53 helper tests, 84/84 native/worker/runtime/approval/UI
regressions, final four Settings diagnostic checks and a separate pre-header
abort cleanup probe passed. These use synthetic peers/browser boundaries except
the documented rendered Chrome fixture checks. No credentials, new sign-in,
native registration, installed host launch, DNS changes or directory lookup was
used. Browser-native enrollment and live provider/action acceptance remain open.

The first integrated run recorded 543/544 extension tests passing and one
shareable-summary UI assertion failing. Independent review traced #166 to a
fixed 20 ms test wait racing production's asynchronous WebCrypto/source checks;
no product export defect was established. The test-only repair waits for bounded
observable completion and adds deliberately delayed digests. Eight focused tests
and twelve simultaneous runs (96 subtests) passed. No production privacy/source/
approval check was weakened or test skipped. A final whole candidate gate follows
this correction; the initial failed run is retained, not relabelled as passing.

Final-source integrated tests now pass **545/545 extension tests and 53/53 helper
tests**, zero failures/skips, with lint, eight-page/54-script audit and both
dependency audits passing. Browser/package/source/hash validation is still a
separate stage of the running local candidate gate. Fresh CI must validate the
new pushed revision; previous green revisions are not reused as acceptance.

Follow-up verification: cd17f26 passed GitHub PR validation, CodeQL and Azure
758/759. GitHub push validation passed on attempt 2; its first Edge startup
timeout remains recorded under #105. The first local gate stopped on a Firefox
screenshot timeout, not a product assertion. The tooling now uses a fresh exact
temporary Firefox profile with --no-remote, retains its 60-second deadline and
cleans only that created profile. Four focused tests and an actual packaged
Settings screenshot passed. This corrects an isolation gap; it does not prove
the earlier timeout's cause or certify Firefox/native/provider behavior. A new
complete local gate is being run; earlier failures remain retained.

## October 15: installed bootstrap alignment and fresh attempt diagnostics

Three independent Software Team passes identified development/package identity,
configuration bootstrap and installed-artifact gaps. The reported extension ID
matches the development manifest key, whose native convention is Chrome; the
probe's Brave-only binding was incompatible. Source identity is not proof of the
loaded extension folder. The existing helper setup was aligned to the exact
development caller/convention, with zero actions; no credentials were imported.
All 15 helper public files and both runtime files were synchronized to current
source with rollback copies; package/lock parity was checked before installation.

Connect now validates trusted configuration before native launch. Missing or
wrong-browser/caller/digest bindings return configuration-required with zero
native ports. Connect-only diagnostics contain fixed stage/code and attempt
time; Settings prints only validated labels/time, never raw paths or provider
errors. Existing permission, policy and action-approval checks are unchanged.

549 extension tests passed without skips/failures; lint and the eight-page,
54-script audit passed. Independent QA verified all 17 installed source hashes
and executed the actual existing Windows CMD launcher through native framing:
challenge, enrollment, status and disconnect passed with actions disabled and
no network operations. An initial overquoted QA command timed out; corrected
standard CMD argument construction passed without modifying the launcher.
This proves local launcher/framing, NOT browser host discovery. Browser-native
Connect, restart/denial acceptance and Cloudflare discovery remain separate.
The private Brave log contained no conclusive host result; absence of verbose
entries is not evidence of success on installed Chromium155. Findings are linked
in GitHub #142/#156/#164/#165; no new OAuth, security-policy or ACL changes made.

## October 15: authenticated retry exposed Windows credential replacement bug

The lead's new consent callback completed, but authorization failed at private
storage; no authenticated connection was claimed. Harmless actual Windows DPAPI
probes reproduced first-write/read success and repeat-write failure. Windows
PowerShell coerced the File.Replace backup argument $null to an empty string,
causing ArgumentException. Passing [NullString]::Value preserves true .NET null.
This retains atomic replacement, CurrentUser DPAPI and private/protected ACLs;
no plaintext, broad access, delete-then-write or credential-copy workaround added.
Independent QA's new Windows regression exercises real create/read/overwrite/read
and confirms a rejected oversized write preserves the previous synthetic record.
The old mocked storage test could not detect this OS boundary. Public defect
#167 is linked to Azure Task348. The fixed public helper code was installed with
rollback and source-hash verification; actual OAuth/inventory retry is separate.
Failed-persistence cleanup discards in-memory tokens but does not revoke grants
at the provider; no claim of revocation is made for this failed attempt.

The subsequent consent callback completed but failed at token-exchange, before
storage. Its exact cause is unknown; do not label it a provider rejection or
reuse the callback. A separately reviewed repair now reports only fixed reason
enums and bounded HTTP status. Token error responses are intercepted before SDK
raw-description warnings or automatic code replay. Independent 22 focused tests
pass, including hostile/malformed responses, no warning leakage and one exchange.
The installed public OAuth modules match the repair source. This is diagnostic
hardening, not live authenticated success; no additional consent attempt was
started during this diagnostic repair.

