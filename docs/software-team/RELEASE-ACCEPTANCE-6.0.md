# Better CaptionKeep 6.0 release acceptance matrix

> **October 16, 2026 — lead scope decision:** BYOMCP is removed from the shipping 6.0 feature set and deferred to a later release. Earlier MCP implementation and acceptance entries below are historical development evidence. Current 6.0 has no MCP connection, native-helper permission, tool-execution interface or helper distribution. Local capture, archive, exports, reviewed BYOAI handoff and historical receipt readability remain. Other release gates remain open.

**Testing now? Start with the [hands-on tester packet](TESTER-ACCEPTANCE-6.0.md)**
for setup identity, click-by-click cases, expected results and blank run records.
This matrix retains dated audit evidence; its older implementation observations
are not a statement of the latest build or a substitute for fresh execution.

Assurance review: October 14, 2026. Branch: `codex/6.0`.
Review baseline: `360cae215a265317efa6e4509d4ac4c689cda11d` plus the current
integration batch. This document is a requirements/evidence audit, not approval
of a candidate, a Store submission, or a public release.

**Verdict: not ready for certified release.** Working implementation and local
regressions are substantial; full scope, live providers, installed upgrade,
manual accessibility, inherited programs, and promotion remain open. Paid tiers
are not being introduced. Missing external license/SSO integration does not
create a requirement to implement one just to test its failure.

## Evidence identity and interpretation

October 14 continuation: concrete BYOMCP browser/helper/typed-action/Receipt
integration and reviewed shareable summaries now have executable synthetic
coverage. The local full candidate command passed 489 extension and 28 helper
tests, both dependency audits, five packages, Chrome/Edge/Brave rendered and
loaded-extension smoke checks, and source/hash/SBOM/helper verification. These
supersede the older 353-test local count below for this batch, but do not satisfy
installed-native/provider authentication, all 15 live provider cells, inherited
scope or final release acceptance. Follow-up metadata/workflow tests and exact
commit provenance are recorded in the execution ledger, not inferred here.

Scope decision, October 14, 2026: Safari is removed entirely from active 6.0
support, packaging, certification, and release gates by the lead. Its material
is [archived for a later major version](../deferred/safari/README.md). All five
remaining browsers still require separate evidence; removing Safari does not
turn any pending Chrome, Edge, Brave, Firefox, or Opera cell into a pass.

- The coordinator reports the frozen integration source suite at 353 tests.
  The coordinator owns the final candidate pipeline and records its exact commit,
  hashes and result in the execution ledger; this audit does not invent that
  pipeline's outcome while it is running.
- Protected Ubuntu run `38595914986` was inspected: 350 passed, 3 skipped,
  zero failed tests, then the browser-smoke gate exited 1 without exposing its
  caught reason. This is a failed CI gate, not a 353-pass Linux result. A scoped
  diagnostic/platform-test portability patch is prepared for a rerun; the exact
  Linux browser cause remains unverified until that evidence is read.
- Independent assurance executed 26 focused workspace/provenance/action cases
  and the actual Chrome rendered test after the reading-first JavaScript freeze.
  Reviewed JavaScript SHA-256:
  `c48ba2c1f1f41c1d16db27ff873dce3dc84fea733458cd8c92d0228ef4797ccb`.
  A subsequent narrow CSS fix was independently rerun in Chrome. The run was
  not skipped and checked populated 300/400/1280 widths, keyboard actions,
  focused/selected text beyond 150 captions, scrolling, and source disappearance.
- Independent paused-provider fixtures passed 8/8. Independent guard/worker/
  Teams-content peer tests passed 31/31. These execute production code with
  synthetic state, not authenticated meeting providers.
- Isolated native loaded-extension probes previously passed in Chrome, Edge
  and Brave. They establish real extension APIs, storage, worker bootstrap,
  synthetic legacy archive access and deletion/replay behavior. They do not
  exercise live capture, a signed Store upgrade, or customer identity.
- Final `dist/prod/browser-certification.json`, loaded-extension JSON, package
  hashes and provenance must be read after the coordinator's pipeline completes.
  Old generated files, or files removed during its clean step, are not evidence
  for the new artifact. Bind every final result to that artifact's digest.
- `passed` below means the identified test only. `not run` means no acceptance
  execution is recorded here. `unverified` means source/build evidence is
  insufficient. Browser installation availability is not certification.

Sources: [roadmap](../ROADMAP-6.0.md), [release record](../RELEASE-6.0.md),
[machine state](../release-state/6.0.json), [execution ledger](EXECUTION-6.0.md),
[public defects](PUBLIC-DEFECTS-6.0.md), and actual test/source inspection.

## All sixteen roadmap gates

Owners are accountable disciplines, not invented named employees or deadlines.

| Gate / requirement | Available evidence | Acceptance still not run / unverified | Owner and next step |
| --- | --- | --- | --- |
| 1 Popup sphere, default dark, one primary action, readiness, three launchers, last live transcript | `ui-state-behavior`, `advanced-ui-rendered`, Chromium surface checks; real popup source | Exact installed popup in no-meeting/starting/paused/failure/live states and native maximum height; current artwork needs approval | UX + QA: run installed state tour using final package, preserve status/click evidence |
| 2 Persistent reading-first workspace | Independent rendered/selection checks; chronology, shared actions, Follow latest, >150 focus/text/scroll, source clearing | Live meeting polling, native sidebar/tab lifecycle, long-session rendering and screen-reader reading | UI + QA: use final package in live session; inspect memory/input latency and focus over a long transcript |
| 3 Remaining surfaces | Surface audit; rendered settings/viewer/handoff; Moment review; theme tests | Complete state/theme/200% zoom tour of every surface; platform guide, exports and dialogs in native browser contexts | UX + accessibility: record surface/state/theme checklist and defects, not only screenshots |
| 4 Authoritative source and separate derivatives | `derived-artifacts`, `artifact-promotion`, template/handoff provenance, worker-boundaries, marker store, session retention | Live correction/restart/deletion across every derivative and exact source hash; full generator/model metadata review | Data + security + QA: retain a synthetic source and compare immutable raw records before/after every action |
| 5 Capture Moment | Reviewed PNG action/managed privacy checks in real rendered fixture; worker screenshot restriction; derivative tests | Native captureVisibleTab, active-tab switch, approval, note/alt text, actual PNG download, deletion in live browser | UI + QA: exercise exact frozen ZIP with synthetic meeting and permission denial; never expose real meeting screenshots |
| 6 Manual cited Live Notes | Reviewed handoff and source-bound note/answer/promotion tests; fixed safety envelope | Human-reviewed full Summary/Decisions/Actions/Risks/Questions flow with real chosen AI workspace, rejection and re-review | UI + QA: synthetic transcript end-to-end, explicit copy/review only; keep raw source unchanged |
| 7 Rolling Live Notes | Rolling module, source-revision, storage/migration, bounded batch, restart/idempotency and checkpoint tests; comparable CPU workload evidence | Long native session, storage/IPC pressure, pause/retry/failure and managed policy transitions during writes | Performance + QA: measure native browser CPU/memory/input and compare recovery after restart; module CPU is not browser performance |
| 8 Templates / prompts | Version/import limits, template lineage and per-meeting draft regressions | Full create/duplicate/edit/import/export/delete/regenerate tour; workspace selection and immutable safety rules in real tabs/locales | UI + QA: do full template revision tour against final artifact |
| 9 Transcript Q&A | Original Ask snapshots, canned no-answer, source-bound cited derivatives and promotion tests | Original request binding, correction/disappearance, unsupported answer and re-review in actual meeting tabs | UI + QA: preserve original Ask source; reject absent/changed citations |
| 10 Five build/runtime targets and one binary | Packaging/bootstrap tests; five manifests; native Chromium probes; managed-denial tests | Installed Firefox native sidebar, Opera extension APIs; stable capability-ID contract not located | Platform + architecture + QA: assert native runtimes independently; reconcile explicit capability IDs without adding paid tiers |
| 11 Accessibility/privacy/security/failure hardening | Surface audit, injection/export/policy/worker/citation/retention/failure tests, dependency audit pipeline | Screen readers, 200% zoom, high contrast/forced colors, localized live regions; native quota/permission/disconnect/restart failures; current 6.0 security/TOM review | Accessibility + security + QA: perform checks below; refresh security architecture's older 5.2/5.3 applicability |
| 12 Separate five-browser/provider certification | Renderer assertions in Chrome/Edge/Brave; Firefox screenshot only; all live provider cells pending | All 15 cells below, not inferred from shared engines | QA: execute exact-package provider protocol per browser |
| 13 Frozen candidate, artwork/copy/hashes/SBOM | Packaging/source ZIP parity, hashes/SBOM/provenance scripts, art generation and release-status validation | Final clean artifact identity, owner-approved current art/copy/privacy, candidate declaration and unchanged window | Release + product: read final pipeline evidence, review actual product art, then freeze approved digest |
| 14 Controlled promotion, public parity, upgrade | Development-state views and publish script tests; no publication implied | Controlled submission, review receipts, public version/copy/art/privacy and real installed upgrade | Release + lead: only after previous gates and applicable authorization; maintain release open until post-upgrade smoke |
| 15 Deferred user-owned BYOMCP bridge | Removed from the shipping 6.0 boundary by the October 16 lead decision; implementation and historical evidence are preserved | Not a 6.0 release gate. Shipping artifacts must omit MCP UI, runtime, native permission and helper payloads while retaining historical receipt display/delete | Future-release architecture + engineering + security + UI work only; Core 6.0 remains independent |

### Lead-approved gate 16: shareable summary and labels

Required October 14: [shareable-summary acceptance](SHAREABLE-SUMMARY-6.0.md).
Review selection, source immutability/freshness, separate draft, explicit
privilege designation, edit-invalidates-review, managed denial and labelled
copy/TXT/Print-PDF with no automatic transcript metadata. Include narrow/light/
dark UI and browser-print leakage checks. Implementation is not legal clearance
or privilege certification; five-browser live acceptance remains pending.

The one-binary enterprise requirement also preserves Core independence from
optional services and managed-denial precedence. Core currently has no required
license/SSO dependency; its absence is not a missing feature. Exercise outages
only for optional integrations actually shipped. Stable capability IDs remain
an explicit product contract requiring reconciliation, separate from paid tiers.

## Fifteen live browser/provider cells

Each cell must record exact tested package digest, browser version, OS, date,
tester, synthetic meeting steps, expected/actual result and sanitized evidence.
`Not run` is not a failed provider result, nor a pass.

| Browser | Microsoft Teams | Google Meet | Zoom Web | Runtime prerequisite / owner |
| --- | --- | --- | --- | --- |
| Google Chrome | Not run | Not run | Not run | Installed Windows browser; QA + meeting host |
| Microsoft Edge | Not run | Not run | Not run | Installed Windows browser; QA + meeting host |
| Brave | Not run | Not run | Not run | Installed Windows browser; QA + meeting host |
| Mozilla Firefox | Not run | Not run | Not run | Installed Windows browser, but native sidebar/extension behavior needs asserted testing; QA/platform |
| Opera | Not run | Not run | Not run | Browser absent on inspected host; install only with authority or use another tester; QA/platform |

Minimum protocol per cell: clean install; meeting start/default-on capture;
speech and interim correction; pause/resume; captions hidden/remounted; leave,
cancelled leave where relevant, and rejoin into a distinct meeting; last-live
transcript; raw history/export; Moments approval; Notes/Ask/templates and Evidence
actions where supported; deletion; badge/source cleanup after navigation;
restart/recovery. Teams Chromium also needs PWA and minimized/hidden-tab checks.
Test a separate second participant so speech and attribution are observable.
Do not silently downgrade a committed provider if its browser meeting UI blocks
the scenario: record blocked status and obtain an explicit scope decision.

## Inherited CAP controls remain part of release acceptance

The historical incident record is not rewritten as new evidence. Its complete
CAP-01–06 claims are historical; rerun applicable final-artifact tests. The
program continues under Feature #298 and CAP-08–16 Tasks #299–307.

| Control | Evidence available / missing | Owner and next executable step |
| --- | --- | --- |
| CAP-01 Dev/UAT overlay cannot target production | Overlay and package tests; final pipeline parity check | Platform: record final manifest/config overlay rejection |
| CAP-02 Customer-owned Microsoft setup remains visible | Source/config/Graph tests and rendered navigation; clean no-policy identity UAT not recorded | Integration + QA: exact Store ZIP first-run/setup/permissions tour |
| CAP-03 Exact Microsoft tenant binding | Graph negative test coverage, not live token verification | Security + customer tenant tester: wrong-tenant/expired/revoked denial without logging secrets |
| CAP-04 Optional Graph/identity host grants | Manifest and connector tests; native user gesture/grant/revocation still unverified | QA: clean-profile Connect permission denial/retry/revoke |
| CAP-05 No publisher identity/forbidden paths in release | `verify-release.mjs` and ZIP parity | Release: final artifact result/hash, not only source inspection |
| CAP-06 Accurate Chrome active-review states | Chrome publish regression tests | Release: verify actual submission state when authorized |
| CAP-07 Incident/release stays open through upgrade | Historical process requirement | Lead: retain tracking until current public and upgrade evidence exist |
| CAP-08 Clean-profile exact Store ZIP UAT | Native synthetic runtime is only a subset; sign-in/list/import/capture/export not run | QA + integration: no overlay/no managed-policy frozen-ZIP scenario |
| CAP-09 Evidence binds commit, ZIP, UAT, permission diff, window and approver | Hash/provenance/status records cover portions; complete submission enforcement unverified | Platform: add/verify full machine evidence and reject stale/missing/hash mismatch before Store action |
| CAP-10 Permission delta compatibility and upgrade gate | Baseline permissions inspectable; final delta/decision/enforcement not demonstrated | Security + platform: compare public 5.4 manifest to candidate, record decision, test permission-expansion upgrade |
| CAP-11 UAT consumes frozen ZIP | Source/staged/ZIP parity implemented; installed UAT digest chain not established | Release + QA: extract tested immutable ZIP, record same digest through upload |
| CAP-12 48 unchanged hours with automatic reset/block | State has boolean window gate; timestamp/digest reset/enforced submission hold not demonstrated | Platform + release: implement/test clock/digest boundary then retain real unchanged window |
| CAP-13 Public-upgrade canary | Not run; requires real supported Store installation/update | Release + tester: use staged rollout where supported, otherwise earliest real upgrade and keep gate open |
| CAP-14 One checked status across docs/Wiki/Boards | Three generated local views + validated JSON; Boards manually reconciled | Coordinator: verify protected CI and publish/reconcile all authoritative views without claiming complete auto-generation |
| CAP-15 Prior ADR for identity changes | Current baseline security architecture and separate Evidence Actions ADR referenced; 6.0-specific approval not established here | Architecture + lead: identify approved decision and source/version scope before new identity work |
| CAP-16 Release pre-mortem | Not recorded as final go/no-go | Lead + release: answer how clean Store users could still fail despite current UAT; attach mitigation/stop/rollback |

## Multilingual adoption: #308–313

[Adoption gate](../FRENCH-GDPR-ADOPTION-GATE.md) remains required, not replaced by
38 catalogs. `localization.test.cjs` checks key/placeholder parity and previews;
all 37 non-English catalogs explicitly identify preview quality. That is not
Canadian French/Spanish translation, legal, accessibility or full-surface review.

| Requirement | Available evidence / not run | Owner and next step |
| --- | --- | --- |
| English, Canadian French and Spanish all-surface localization | Catalog/helper/schema tests; many new workspace strings visibly remain English literals | Localization + UI: inventory new 6.0 strings, localize all states/labels and assert missing/literal regressions |
| Locale-aware dates/plurals/numbers/accessibility and layouts | Not established by key parity | UI + localization + QA: three-language rendered state/theme/200% zoom matrix and native screen-reader tour |
| Managed `forceUiLocale`, one identity/package | Configuration/schema/Intune tests; actual policy delivery/pilot not run | Endpoint + QA: Chrome/Edge policy inspection and locked UI evidence on assigned profiles |
| Reviewed language/UI/Store/user/admin/privacy materials | Non-English previews not professionally accepted | Product + qualified language reviewer: approve terminology and final-version materials |
| GDPR/Quebec roles, ROPA/DPIA/PIA, rights/retention/transfer review | Existing plan only, not adopter legal approval | Adopting organization DPO/counsel: actual deployment assessment; product cannot certify their compliance |

The following section is preserved as historical planning evidence for the
deferred MCP program. It is not active 6.0 acceptance scope and must not be
used to block or certify the no-MCP 6.0 release.

## Evidence Actions: #318–332

**Superseded historical decision:** an earlier plan included the opt-in BYOMCP
(user-owned MCP) bridge in 6.0. David's final October 16 decision removed it from
shipping 6.0 and deferred repair, enrollment, authentication and provider work
to a later release. The material below remains only as preserved future-work
evidence; it is not an active 6.0 requirement.
CaptionKeep does not become a publisher-operated AI host. Core remains usable
without the bridge; there is no automatic transcript release and no secrets in
browser sync. The retained program below must be reconciled before any later
release reintroduces BYOMCP, rather than silently relabeled complete.
The earlier plan subsequently refined this to operation-specific controlled write
profiles: reviewed Cloudflare DNS changes with exact sealed approval and verified
readback receipts, plus authorized Microsoft 365 person lookup/disambiguation.
This is deferred future design/build/test scope, not permission for this team to
change DNS or query actual employee profiles. Historical read-only criteria
remain visible below; their proposed successor ADR must explicitly distinguish
reviewed read profiles from write profiles, actual tool/server contracts,
before-state/concurrency limits, test-TXT/rollback and honest outcome-unknown.
Neither captions, tool annotations nor returned text may authorize a mutation.

Live read-only Azure work-item reads in this audit retain the committed program.
#319, #321 and #322 were Closed in the tracker; #320 and #323–332 were Active.
Tracker closure is not independent product acceptance. No companion repository,
enrolled bridge, remote endpoint or associated contract-suite results were
supplied to this checkout's audit. The current extension's explicit BYOAI
copy/review path is not proof of the broader customer-assistant workflow.

| Item / preserved requirement | Available evidence / remaining acceptance | Owner and next step |
| --- | --- | --- |
| #319 Ownership/trust/identity ADR | Board says Closed; approved ADR not inspected in this checkout | Architecture: supply approved artifact/version and prompt-injection/tenant/SSRF/receipt threat model |
| #320 Bounded read-only MCP tool/schema contract | Contract not independently exercised here | Integration + security: retrieve actual tool schema; run scope/pagination/error/no-write tests |
| #321 Exact selected evidence/research preview | Local selection/provenance/privacy/keyboard tests; live accessibility not complete | UX + QA: check exact disclosure and cancellation using installed final package |
| #322 Shared stdio and Streamable HTTP MCP server | Board says Closed; companion implementation/results unavailable here | Platform + integration: locate actual supported server and run identical tool contracts in both profiles |
| #323 Cited Research Cards | Reviewed Notes/Answers are separate derivatives; full research-card contract not established | Data + UI: demonstrate question/citations/retrieval/scope/limitations, stale/insufficient source, pin/copy/export |
| #324 Injection/privacy/live UAT | Local inert caption/export boundaries covered; live assistant authorization/no-write UAT not run | Security + QA: adversarial synthetic captions, unauthorized/tenant denial, clean Chrome/Edge research flow |
| #325 Optional enrolled Send to my assistant bridge | No implemented bridge/status/result/cancel flow located in this source inspection | Integration: reconcile implementation location and execute exact reviewed local + remote contracts |
| #326 Reviewed connector draft/confirmation/receipts | User-directed AI/webmail handoff exists; customer connector confirmation/receipts not demonstrated | Integration + customer tester: neutral Jira/Azure/M365 profiles; do not create real external records without authority |
| #327 Versioned Evidence Action transport envelope | Local evidence bundles/derivatives exist; action transport equivalence not verified | Data + security: validate approved selected scope, expiry, canonical integrity, limits/no tokens |
| #328 Local enrolled bridge + stdio deployment | Clean companion install/removal/upgrade/offline behavior not run | Platform + QA: reproducible isolated Windows companion test, arbitrary-origin denial |
| #329 Customer endpoint + Streamable HTTP | OAuth/origin/replay/timeout/container/Azure evidence not available here | Customer/platform + security: isolated authorized customer test environment, no production mutation |
| #330 Connection health/disconnect/managed policy | Ordinary destination/policy controls do not establish enrolled connection management | UI + endpoint: test type/identity/health/verification/disconnect and no-secret diagnostics/export |
| #331 Durable action jobs/cancel/idempotency/receipts | Archive/rolling durability tests are not assistant job lifecycle tests | Backend + QA: panel close/SW suspension/restart/retry/expiry/partial failure with synthetic receipts |
| #332 Supported deployment/runbooks/recovery | No independently reproduced companion deployment in this audit | Technical writer + platform: validate local and container/Azure runbooks, removal, rotation, outage and rollback |

These are scope/integration-evidence gaps, not newly fabricated runtime defects.
Reconcile companion repositories and any explicitly superseded decisions with the
lead; do not silently reduce them to prompt-copy functionality.

## Achievable next checks versus external gates

### Executable locally after the current pipeline finishes

1. Read exact output provenance and ZIP hashes; confirm source parity and final
   suite outcomes; do not run a competing full pipeline during packaging.
2. Expand final-package clean-profile checks to native Downloads/Save As,
   clipboard policy, history/recovery/deletion, denied permissions, local storage
   errors and restart. Use isolated profiles and synthetic data. Actual browser
   quota and signed-upgrade behavior require their own assertions.
3. Run asserted Firefox installed-extension/sidebar behavior on this available
   host. A prior captured screenshot has zero interaction assertions.
4. Run manual keyboard/200% zoom/high contrast and Windows assistive technology
   tours, plus native browser long-session CPU/memory/input measurement. Existing
   module benchmarks and selected contrast assertions are not complete WCAG or
   performance certification.
5. Compare final manifest permission delta with public 5.4; test missing/stale
   UAT evidence and 48-hour reset/submission-hold enforcement; bind final Store
   metadata/art/privacy and owner review to the candidate.
6. Retrieve companion Evidence Actions implementation/evidence and finish the
   three-language all-surface inventory. These are executable engineering work,
   not Mac/Store blockers; no full-scope-complete claim until reconciled.

### Requires live users, customer environments, hardware or distribution

- Fifteen authenticated live meeting cells, including Teams PWA/minimized UAT.
  Windows Chrome/Edge/Brave and Firefox do not require a Mac but need real provider
  sessions. Opera needs an available installed browser/tester.
- Customer-owned Microsoft identity/import, Intune language/policy pilot, and
  local/remote assistant enrollment require their actual authorized environments.
- Qualified language and adopter privacy/legal review cannot be replaced by an
  AI catalog, dependency scan or developer statement.
- The unchanged candidate window needs elapsed unchanged time. Store submission,
  approval, public parity and signed installed upgrade need authorized release
  execution and Store/customer observations, not synthetic migration fixtures.

## Defects and stop conditions

The public register already records confirmed runtime defects and local fixes,
including #131–134. This audit found acceptance gaps rather than a newly executed
runtime defect. GitHub searches for capability, Evidence Actions and localization
were checked; do not invent duplicate bugs from missing feature evidence.
No issue is closed from this matrix. Locally fixed #133/#134 have independent
focused and rendered evidence, but their applicable live/release acceptance is
still open. A stale public-register row saying repair is in progress should be
reconciled by its owner without treating a local fix as deployment.
The hidden Linux diagnostic failure was documented as a follow-up to existing
[#105](https://github.com/Mr-GraphnStaff/better-captionkeep/issues/105#issuecomment-6172883294),
not a duplicate report. The managed locale-precedence repair #136 independently
passed five new production-helper cases plus five existing catalog cases; live
Intune and complete localized surfaces remain unverified.

Stop release promotion on source/package/hash mismatch, missing required UAT,
permission expansion without compatibility/upgrade decision, disclosure outside
approved scope, raw-source mutation, lost recovery, misleading success/receipt,
cross-session artifacts, failed provider cell, or any required inherited scope
silently dropped. The lead must explicitly decide any scope change or accepted
risk; this document does not waive a requirement.
