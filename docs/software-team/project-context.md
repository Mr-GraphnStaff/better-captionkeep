# Better CaptionKeep 6.0 execution context

> **October 16, 2026 — lead scope decision:** BYOMCP is removed from the shipping 6.0 feature set and deferred to a later release. Earlier MCP implementation and acceptance entries below are historical development evidence. Current 6.0 has no MCP connection, native-helper permission, tool-execution interface or helper distribution. Local capture, archive, exports, reviewed BYOAI handoff and historical receipt readability remain. Other release gates remain open.

Current update: October 24, 2026. Team lead: David Farris.
Source: P:/Projects/better-captionkeep-dev, branch codex/6.0.
Historical review starting revision: 360cae2. The 5.4 contents are preserved in the archive.

## Current release preparation

David authorized the 6.0 release push on October 24. The current assignment,
named specialist ownership, positive owner UAT and verification limits are in
[the release-preparation record](../release-state/6.0-preparation.md).
Earlier dated assignments below are historical and do not replace that record.

Use one active source checkout with `dist/dev`, `dist/uat` and `dist/prod`.
Only `dist/prod` supplies published distribution assets. The separate 5.4
checkouts and unused top-level lane remnants are archived in
`P:/projectsArchive`; active 6.0 Git metadata is self-contained. Do not recreate
the former top-level UAT/production source checkouts.

The shared Software Team 1.0.6 / roster 1.0.2 supplies the named team. Ishan,
Mara, Lena, Heike and Ellis were separately delegated for this release push;
Codex coordinates integration. The repository's older bundled skill is not
proof of synchronization with the shared installation. No shared skill files
were modified during release preparation.

## Assignment and authority

The lead requested a top-to-bottom Software Team review and execution of open
items, with every confirmed bug transparently documented in GitHub. He explicitly
authorized pushing the 6.0 branch and opening a draft PR after integrated checks;
merging and Store publication are not authorized by this assignment.

Preserve full roadmap scope and the lightweight spherical front door/powerful
back door. Live capture defaults on and can be paused without losing collected
words. Raw captions remain authoritative; reviewed derivatives keep source
identity and cannot rewrite them. Privacy/managed policy wins over optional
features. Five browsers remain separately required, not inferred from Chromium:
Chrome, Edge, Brave, Firefox, and Opera. The lead removed Safari completely from
6.0 on October 14, 2026, reserving it for a later major version. Its groundwork
is archived under `docs/deferred/safari`; no Safari release gate remains active.

On October 14 the lead initially required an opt-in BYOMCP bridge. The final
October 16 decision superseded that plan: MCP is excluded from shipping 6.0 and
deferred. Roadmap gate 15 now verifies the no-MCP shipping boundary. The
architecture, UX and security material remains historical future-work evidence;
local Core remains independent.

## Team and ownership

Historical pre-deferral status: the lead briefly resumed MCP implementation.
That work stopped when the October 16 no-MCP shipping decision superseded it.
No MCP installer, registration, authentication or provider task below is an
active 6.0 assignment; the preserved implementation and user state remain for a
later explicitly authorized release.
Installed helper framing/challenge succeeds locally. Exact Brave extension path,
permission, both registry views and launcher were inspected, but browser-native
connection acceptance remains unverified while browser control is unavailable.
Do not invent a Brave registry repair from absent vendor-specific keys.

October 15 active onboarding repair: lead-reported M01 failure is #170, linked to
Task348. Three actual assignments cover helper preparation, guided Settings and
independent QA; coordinator owns integration/runbook and release honesty. See
[onboarding acceptance contract](MCP-ONBOARDING-6.0.md). Preparation removes manual
configuration authoring but is not complete installation/authentication or a
closed acceptance case. Existing connections must be preserved; no live helper,
permission, authentication or resource changes are part of these implementation tests.

October 15 scope clarification: the lead requires the full discovered MCP catalog,
including writes, not a metadata-only or typed-action-only connection. Explicit
catalog profiles now support sealed, one-use exact-operation review; generic
responses remain unverified data, separate from typed readback Receipts.
An authorized installed-helper Cloudflare TXT add/read/delete test passed with
independent cleanup confirmation. Settings end-to-end and five separate live
browser certifications remain open. Full-access OAuth was explicitly approved
for this session; refresh tokens are discarded. No unrelated writes authorized.

Four actual agents perform grouped discipline passes, not fictitious employees:

| Owner | Active disciplines | Owned deliverables |
| --- | --- | --- |
| Coordinator | Product/analysis, Scrum Master/delivery, People Operations, documentation/release/support | Full-scope traceability, role coverage and accountable handoffs, live Boards reconciliation, public register, generated status, integration and draft PR |
| Engineering reviewer | Architecture, provider/integration, backend/data/reliability | Meet/Zoom lifecycle, Teams archives/checkpoints and badge recovery; independent frontend/worker review |
| UI reviewer | UX/UI/content/accessibility/frontend/performance | Templates workspace, original request provenance, review safety, Moments, themes, focus/narrow layout and rolling optimization |
| Assurance reviewer | QA/security/storage/platform/DevOps/release | Worker retention/citation/image boundaries, cleanup, real unpacked runtime and artifact parity, CI runtime, tab protection |

No live participant research or comprehensive screen-reader certification is
claimed. Local, synthetic, loaded-runtime, provider-live and public-upgrade
evidence are different acceptance stages.

### Current contribution handoff

- Engineering delivered the provider/archive repairs and independently reproduced
  workspace defects #133 and #134. Its paused-provider repair passed separate QA
  review across eight production-code fixture regressions.
- UX/UI owns the reading-first workspace implementation and repairs from that
  independent review, followed by narrow/desktop keyboard and selection evidence.
- Assurance owns independent final-workspace acceptance after source freeze,
  including missing-source selection, asynchronous action identity and keyboard
  focus beyond the latest-150 window. Earlier worker/native-runtime evidence does
  not approve the newly changed frontend.
- The coordinator owns issue/Boards traceability and integration, then the
  authorized checked-source push and draft PR. Store publication remains excluded.

These are actual grouped assignments, not a claim that every role is a separately
staffed employee. No agreed deadlines or measured cycle-time baseline exist for
this batch; do not fabricate on-time ratings or a measured completion percentage.

## Authoritative tracking

Azure DevOps live project: Better CaptionKeep, project ID
c23a840e-a145-4d4f-be1c-52627d5ae561, DAF-TECH organization; default team
Better CaptionKeep Team. The old CLI default Better-CaptionKeep was corrected.

Epic #335 tracks full 6.0. Features #336-342 preserve the inherited roadmap gates,
including inherited CAP controls #298-307, multilingual adoption #308-313 and
Evidence Actions #318-332. None of those commitments was deleted or represented
as completed by the public 5.4 release.

The roadmap has sixteen gates; gate 15 now enforces MCP exclusion for shipping 6.0, and gate 16 covers the
lead-approved reviewed shareable summary and export labels (16). Task #347 under
UI Feature #336 links public feature #151 and pre-release policy defects
#152/#153. Separate summary review is not a legal privilege determination;
original transcripts remain unchanged and no email or AI submission is automatic.

Tasks #343-346 track this repair/verification batch. Zoom story #252 was corrected
from uncommitted/New to implemented/Active with live acceptance still open;
obsolete vision/uncommitted tags were replaced. Epic #284 was relabeled as
historical 5.3 tracking, without closing its outstanding child gates. CAP-14 #305
was moved to Active with evidence of the new checked development status views.

See PUBLIC-DEFECTS-6.0.md for public issue IDs and their remaining acceptance.
Board updates use verified project IDs, rereads and revision-tested REST patches
for issue links. Failed CLI calls are not counted as applied changes.

## Verification and remaining constraints

Historical October 14 integration evidence: the optional BYOMCP helper, concrete native
adapter, Settings connection/write consent, typed action jobs and actual Receipt
retention are implemented locally. Official Cloudflare DNS uses a finite compiler
and separate readback, not arbitrary meeting-supplied code. Registered Cloudflare
access in Codex passed an identity check only; no credentials were copied and no
CaptionKeep installed-host or authenticated provider acceptance is implied.
Helper packaging now includes its own dependency audit, offline SDK sources,
license files, SBOM and independently verified source/hash evidence. These
artifacts may be required by a future release that reintroduces MCP, but they are
forbidden from the 6.0 shipping boundary. Full 6.0 release acceptance remains
open; historical local integration is not publication or browser certification.

Cloudflare helper-owned OAuth now has independent synthetic coverage, including
the explicitly approved read-only session preset and refresh-token discard.
Two initial live consent attempts failed before persistence; the corrected retry
succeeded with authenticated metadata inventory only (#162, still open). Four
tool schemas returned; no tool invocation or enabled action. The temporary local
credential was for this bounded test only. Temporary access was subsequently
revoked (HTTP 200, then authenticated metadata
HTTP 401); the encrypted file remains because deletion was blocked. The
separately registered isolated Brave helper observed a real permission grant,
but native enrollment still failed; browser/provider acceptance remains open.
No IDE credentials were reused; no DNS changes or directory lookups are authorized
by this connection test. Revision `9307752` passed GitHub validation, CodeQL and
Azure Lifecycle 751. The later `12806ec` passed Azure 752 and CodeQL but failed
GitHub validation at Linux Edge startup. Recovery revision `5da5796` then passed
fresh GitHub push/PR validation, CodeQL, Azure 754 and PR-merge Azure 755. Its
full local candidate gate passed 530 extension and 47 helper tests with no skips;
Linux main tests explicitly skipped eight platform-specific cases. Chrome/Edge
Linux surface smoke passed; real native-helper/provider acceptance remains open.

October 15 first-party Cloudflare MCP comparison found and repaired local
interop defects #164 (standard JSON/SSE/lifecycle and supported wire-version
negotiation) and #165 (discarded safe native diagnostic codes). The helper still
owns both transports and credentials; connection/inventory does not grant tool
execution. Metadata-only verified connections now stay visibly connected with
actions off. Independent synthetic/SDK and rendered fixture checks passed; no
new authentication or installed-native success is claimed. Test-only timing
defect #166 was also repaired without changing product export privacy controls.
The subsequent integrated gate and pushed revision require their own evidence.

- Tests execute production functions and deliberate failure cases; real Chromium
  rendering and loaded-extension checks use isolated profiles with synthetic data.
- No customer transcript, tenant credential or private screenshot belongs in
  public reports. Current issue reports use relative source paths and fixtures.
- The release state record remains development: no frozen candidate or provider
  certification. Generated status blocks are checked for contradictions.
- Firefox native/provider and Opera acceptance are still required. All 15
  supported browser/provider cells need their own live evidence.
- Full-scope acceptance includes inherited committed programs, manual keyboard/
  assistive-technology/localization review, live permissions/storage/restart,
  clean Store-equivalent install and actual Store-installed upgrade.
- Final art/copy approval, immutable freeze, unchanged window, Store review and
  public parity remain external release gates. Do not auto-close them from tests.

## Continuation

The execution ledger records the integrated test/build/CI evidence and final PR.
Future work starts from verified source/tracker state, not from the browser URL
or a historical release label. Keep bug reports open until their applicable
acceptance is established; the draft PR is reviewable work, not deployment.
