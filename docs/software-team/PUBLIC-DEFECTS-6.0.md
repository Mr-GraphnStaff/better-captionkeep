# Public 6.0 defect and scope-gap register

October 15 user acceptance failure: [#170](https://github.com/Mr-GraphnStaff/better-captionkeep/issues/170),
high-severity BYOMCP onboarding release blocker, linked to Azure Task348.
The lead could not set up their own MCP using supplied guidance (M01 FAIL).
Current source requires externally prepared binding JSON; no guided end-to-end
setup exists. Exact installed build/first failing step remain unrecorded, so
this is not a newly diagnosed OAuth/transport fault. Required acceptance: a fresh
tester configures local and remote services without developer edits/coaching,
hand-edited JSON, hashes, browser IDs or registry entries. Prior helper DNS success
does not close this defect. No fix implemented or retest passed yet.

Recorded October 14, 2026. Each issue below was reread from GitHub after creation.
Confirmed defects and explicit scope gaps are public; two feature requests are
labeled as scope gaps rather than fabricated runtime bugs. Source paths and
reproductions are synthetic and do not expose meeting content or credentials.

The initial 44-record review remains open; later follow-ups below expand this
register. Local fixes and tests are not deployment,
provider certification, Store approval, or installation-upgrade evidence.
The earlier October 13 findings are documented retrospectively as well as the
new independent October 14 findings. Issue comments record follow-up variants
without duplicating the same underlying defect.

| GitHub | Finding | Acceptance state |
| --- | --- | --- |
| [#93](https://github.com/Mr-GraphnStaff/better-captionkeep/issues/93) | [Bug][6.0] Meet and Zoom terminal callbacks can recursively finalize meetings | Local repair; live/release acceptance open |
| [#94](https://github.com/Mr-GraphnStaff/better-captionkeep/issues/94) | [Bug][6.0] Meet and Zoom SPA rejoin reuse a finalized capture coordinator | Local repair; live/release acceptance open |
| [#95](https://github.com/Mr-GraphnStaff/better-captionkeep/issues/95) | [Bug][6.0] Slow Teams archive can mix rejoined sessions and remove the new checkpoint | Local repair; live/release acceptance open |
| [#96](https://github.com/Mr-GraphnStaff/better-captionkeep/issues/96) | [Bug][6.0] Canceled Teams Leave intent can prematurely finalize later source loss | Local repair; live/release acceptance open |
| [#97](https://github.com/Mr-GraphnStaff/better-captionkeep/issues/97) | [Bug][6.0] Failed Teams badge publication suppresses retries and can leave stale state | Local repair; live/release acceptance open |
| [#98](https://github.com/Mr-GraphnStaff/better-captionkeep/issues/98) | [6.0][R01] Deleting a transcript leaves retained Evidence Board excerpts | Local repair; live/release acceptance open |
| [#99](https://github.com/Mr-GraphnStaff/better-captionkeep/issues/99) | 6.0: recovery retry succeeds without returning the archived session identity | Local repair; live/release acceptance open |
| [#100](https://github.com/Mr-GraphnStaff/better-captionkeep/issues/100) | [6.0][R02] Document background bootstrap calls worker-only importScripts | Local repair; live/release acceptance open |
| [#101](https://github.com/Mr-GraphnStaff/better-captionkeep/issues/101) | 6.0: reviewed artifacts bypass managed persistent-history denial at the worker boundary | Local repair; live/release acceptance open |
| [#102](https://github.com/Mr-GraphnStaff/better-captionkeep/issues/102) | [6.0][R03] Earlier caption corrections leave Rolling Notes stale | Local repair; live/release acceptance open |
| [#103](https://github.com/Mr-GraphnStaff/better-captionkeep/issues/103) | 6.0: release provenance can describe newer sources than the packaged runtime | Local repair; live/release acceptance open |
| [#104](https://github.com/Mr-GraphnStaff/better-captionkeep/issues/104) | [6.0][R04] Browser smoke gate passes screenshots without usable UI and can exit successfully on failure | Local repair; live/release acceptance open |
| [#105](https://github.com/Mr-GraphnStaff/better-captionkeep/issues/105) | 6.0: Ubuntu validation can skip all browsers and uses an incompatible rendered-test runtime | Remote pipeline repair verified at 9307752; live/release acceptance open |
| [#106](https://github.com/Mr-GraphnStaff/better-captionkeep/issues/106) | [6.0][R05] Template metadata drops the revision used by reviewed derivatives | Local repair; live/release acceptance open |
| [#107](https://github.com/Mr-GraphnStaff/better-captionkeep/issues/107) | [6.0][R06] System and light themes use wrong appearance and native control scheme | Local repair; live/release acceptance open |
| [#108](https://github.com/Mr-GraphnStaff/better-captionkeep/issues/108) | [6.0][R06] Popup source-unavailable status and provider-specific copy contradict capture | Local repair; live/release acceptance open |
| [#109](https://github.com/Mr-GraphnStaff/better-captionkeep/issues/109) | [6.0][R07] Rolling Notes may repersist after managed retention is disabled | Local repair; live/release acceptance open |
| [#110](https://github.com/Mr-GraphnStaff/better-captionkeep/issues/110) | [6.0][R08] Interim caption bursts queue unbounded full-transcript checkpoints | Local repair; live/release acceptance open |
| [#111](https://github.com/Mr-GraphnStaff/better-captionkeep/issues/111) | [6.0][R08] Interrupted archive publication can leave abandoned generation chunks | Local repair; live/release acceptance open |
| [#112](https://github.com/Mr-GraphnStaff/better-captionkeep/issues/112) | [6.0][R09] Release documentation falsely implies complete features or Firefox renderer acceptance | Local repair; live/release acceptance open |
| [#113](https://github.com/Mr-GraphnStaff/better-captionkeep/issues/113) | [6.0] Teams same-page meeting departure leaves the toolbar badge ON | Local repair; live/release acceptance open |
| [#114](https://github.com/Mr-GraphnStaff/better-captionkeep/issues/114) | 6.0 QA: loaded-extension readiness can mistake initial about:blank for an initialized extension | Local repair; live/release acceptance open |
| [#115](https://github.com/Mr-GraphnStaff/better-captionkeep/issues/115) | 6.0: editable BYOAI prompts can remove mandatory review rules | Local repair; live/release acceptance open |
| [#116](https://github.com/Mr-GraphnStaff/better-captionkeep/issues/116) | 6.0: reviewed answers bind to save-time captions instead of the original Ask snapshot | Local repair; live/release acceptance open |
| [#117](https://github.com/Mr-GraphnStaff/better-captionkeep/issues/117) | 6.0: unsaved notes and answers can follow the panel into another meeting | Local repair; live/release acceptance open |
| [#118](https://github.com/Mr-GraphnStaff/better-captionkeep/issues/118) | 6.0: transcript archive overlay does not contain keyboard focus | Local repair; live/release acceptance open |
| [#119](https://github.com/Mr-GraphnStaff/better-captionkeep/issues/119) | 6.0: light Rolling Notes card and dark primary buttons have unreadable contrast | Local repair; live/release acceptance open |
| [#120](https://github.com/Mr-GraphnStaff/better-captionkeep/issues/120) | 6.0: narrow workspace controls can overflow the clipped panel | Local repair; live/release acceptance open |
| [#121](https://github.com/Mr-GraphnStaff/better-captionkeep/issues/121) | 6.0: template imports can roll back version identities and silently drop overflow | Local repair; live/release acceptance open |
| [#122](https://github.com/Mr-GraphnStaff/better-captionkeep/issues/122) | 6.0: transcript Q&A cannot retain an explicit unsupported-answer result | Local repair; live/release acceptance open |
| [#123](https://github.com/Mr-GraphnStaff/better-captionkeep/issues/123) | 6.0 roadmap gap: unified workspace has no Templates view | Local repair; live/release acceptance open |
| [#124](https://github.com/Mr-GraphnStaff/better-captionkeep/issues/124) | 6.0 roadmap gap: Capture Moment has no reviewed PNG export action | Local repair; live/release acceptance open |
| [#125](https://github.com/Mr-GraphnStaff/better-captionkeep/issues/125) | 6.0: worker can retain fabricated derivative citations by trusting declared snapshot capacity | Local repair; live/release acceptance open |
| [#126](https://github.com/Mr-GraphnStaff/better-captionkeep/issues/126) | 6.0: generic Moment saves bypass the managed unmaskable-image restriction | Local repair; live/release acceptance open |
| [#127](https://github.com/Mr-GraphnStaff/better-captionkeep/issues/127) | [6.0] Release status validator accepts an incomplete frozen artifact set | Local repair; live/release acceptance open |
| [#128](https://github.com/Mr-GraphnStaff/better-captionkeep/issues/128) | [Bug][6.0] Live Workspace transcript stays stale after an earlier caption correction | Local repair; live/release acceptance open |
| [#129](https://github.com/Mr-GraphnStaff/better-captionkeep/issues/129) | [Bug][6.0] Meeting switch during policy refresh rebinds an Ask request to another transcript | Local repair; live/release acceptance open |
| [#130](https://github.com/Mr-GraphnStaff/better-captionkeep/issues/130) | 6.0: routine workspace polling clears unresolved action feedback | Local repair; live/release acceptance open |
| [#131](https://github.com/Mr-GraphnStaff/better-captionkeep/issues/131) | Delayed Teams stop releases a newer capture tab's protection | Local repair; live/release acceptance open |
| [#132](https://github.com/Mr-GraphnStaff/better-captionkeep/issues/132) | Pausing Meet or Zoom capture misses meeting boundaries and mixes later sessions | Local repair; independent synthetic regression review passed; live acceptance open |
| [#133](https://github.com/Mr-GraphnStaff/better-captionkeep/issues/133) | Missing transcript leaves stale selected-caption actions active | Local repair independently verified; live acceptance open |
| [#134](https://github.com/Mr-GraphnStaff/better-captionkeep/issues/134) | Selection changes during policy refresh silently change the action's evidence | Local repair independently verified; live acceptance open |
| [#135](https://github.com/Mr-GraphnStaff/better-captionkeep/issues/135) | UX enhancement: reading-first workspace with progressive caption actions | Implemented and independently rendered-tested; user/live acceptance open |
| [#136](https://github.com/Mr-GraphnStaff/better-captionkeep/issues/136) | Managed locale precedence incorrectly forces English or permits a user override | Local repair; ten locale tests independently passed; live Intune acceptance open |

Existing open requests also advanced:

- [#14](https://github.com/Mr-GraphnStaff/better-captionkeep/issues/14): narrowly protect active Teams capture tabs from browser auto-discard; implementation/native tests under review, no new permission.
- [#38](https://github.com/Mr-GraphnStaff/better-captionkeep/issues/38): executable MCP setup now supplies both filtering headers and explains verification; authenticated remote tool-inventory check still open.
- [#82](https://github.com/Mr-GraphnStaff/better-captionkeep/issues/82): optional Slate and High contrast themes under review; default theme unchanged.

Azure Boards Epic #335 and Features #336-342 preserve the full scope. Public issue
hyperlinks are attached to corresponding work items. Tasks #343-346 track this
implementation batch; final feature and release gates remain separate.

Draft PR [#137](https://github.com/Mr-GraphnStaff/better-captionkeep/pull/137)
contains local fixes and this evidence register. Do not close issues automatically
from commit wording or claim the draft is a public release.

## Shareable-summary prototype policy follow-up (2026-10-14)

Feature [#151](https://github.com/Mr-GraphnStaff/better-captionkeep/issues/151), Azure Task #347, adds a separate reviewed email summary and handling labels. Independent synthetic execution caught two pre-release bugs:

- [#152](https://github.com/Mr-GraphnStaff/better-captionkeep/issues/152): absent managed-policy interface was treated as empty policy, permitting clipboard output. Local repair requires policy authority and fails closed if unavailable.
- [#153](https://github.com/Mr-GraphnStaff/better-captionkeep/issues/153): policy revocation during asynchronous source validation, or a source change during the later policy check, could permit one stale output before a storage-change event arrived. Local repair rechecks both resources across the release sequence and invalidates changed settings before output. Browser APIs offer no atomic cross-resource transaction; the residual last-observation boundary is disclosed rather than claiming perfect instantaneous revocation.

Strict independent regression probes reproduced both failures before repair. They remain open pending final-source independent acceptance and applicable installed-browser tests; no prototype fix is represented as deployed or legal clearance. Only synthetic text was used.

## Attendee-panel control follow-up (2026-10-14)

[#149](https://github.com/Mr-GraphnStaff/better-captionkeep/issues/149): Live Workspace disables the attendee-panel button after capture is enabled, even when the user closes the Teams panel with its native X. The control now follows host `aria-expanded`/`aria-pressed` state (visible attendee tree fallback), offers Open/Close, and does not discard captured attendees or change caption capture. Missing or unresponsive host controls return an error rather than false success.

Local verification: six new attendee regressions plus eight Teams lifecycle checks passed; 124 reliability/UI-state checks passed; lint and the seven-page surface audit passed. These are synthetic/code checks, not rendered or live Teams acceptance. Updated packaging, live open/close/reopen verification, and deployment remain pending. The issue stays open.

## BYOMCP and release-integration follow-up (2026-10-14)

The earlier 44-record count describes the initial review only, not the cumulative
register. Additional confirmed development defects remain public and open:

| GitHub | Finding and local repair boundary |
| --- | --- |
| [#138](https://github.com/Mr-GraphnStaff/better-captionkeep/issues/138) | Async write verification must not expose unverified results or miss policy denial |
| [#139](https://github.com/Mr-GraphnStaff/better-captionkeep/issues/139) | Literal-IP remote endpoints must not bypass network restrictions |
| [#140](https://github.com/Mr-GraphnStaff/better-captionkeep/issues/140) | Native result limit must reserve room for the proof/envelope within the frame |
| [#141](https://github.com/Mr-GraphnStaff/better-captionkeep/issues/141) | Consent expiry rechecked after asynchronous admission, before dispatch |
| [#142](https://github.com/Mr-GraphnStaff/better-captionkeep/issues/142) | Metadata bootstrap and Live Workspace inventory must work without granting connection authority to workspace senders |
| [#143](https://github.com/Mr-GraphnStaff/better-captionkeep/issues/143) | Duplicate/recovered jobs must not expose results after source revocation |
| [#144](https://github.com/Mr-GraphnStaff/better-captionkeep/issues/144) | Pin denial must remove the owned artifact and never resurrect a revoked prior Receipt |
| [#145](https://github.com/Mr-GraphnStaff/better-captionkeep/issues/145) | Durable reads must honor result lifetime expiry |
| [#146](https://github.com/Mr-GraphnStaff/better-captionkeep/issues/146) | Workspace must reject returned results after selected-source changes |
| [#147](https://github.com/Mr-GraphnStaff/better-captionkeep/issues/147) | Valid final job states must not be rejected by the workspace |
| [#148](https://github.com/Mr-GraphnStaff/better-captionkeep/issues/148) | Settings must clear profile metadata after managed revocation |
| [#154](https://github.com/Mr-GraphnStaff/better-captionkeep/issues/154) | Strict registry key allowlists reject secret-bearing unknown profile fields before local storage |
| [#155](https://github.com/Mr-GraphnStaff/better-captionkeep/issues/155) | Pin consumes the already verified private Receipt, not an already-consumed native proof a second time |
| [#156](https://github.com/Mr-GraphnStaff/better-captionkeep/issues/156) | Edge Store staging must bind the helper to Edge, not the Chrome-default source identity |
| [#157](https://github.com/Mr-GraphnStaff/better-captionkeep/issues/157) | Wireframe archive IDs must not fall back to weak randomness; no authentication-token exposure claimed |
| [#158](https://github.com/Mr-GraphnStaff/better-captionkeep/issues/158) | Store metadata must strictly require optional-permission justifications, including explicit Connect for nativeMessaging |

Azure Task #348 under Evidence Actions Feature #318 tracks BYOMCP integration
and installed/provider acceptance, with verified public issue links #138-148 and
#154-155. Release Task #346 links packaging, artifact freeze and CI findings;
native installation and live certifications are not inferred from either task.

Independent synthetic integration review covers actual typed runtime/job/Receipt
paths, policy revocation during persistence, strict registry rejection and source
deletion without removing unrelated artifacts. Cloudflare compiler review checks
wrong account/record/current values, hostile TXT literals and independent
readback mismatch; 51 targeted checks passed with no skips. These do not certify
an installed native host, actual credentials, live DNS or directory activity.

[#105](https://github.com/Mr-GraphnStaff/better-captionkeep/issues/105) also tracks
Azure 745's observable theme timing failure and the merge-ref CodeQL audit-script
alert. The runner now waits for actual theme/native-control state and real page
focus; audit text is token-inspected without rebuilding HTML. Its old value was
only a boolean accessible-name check, not a production HTML sink. Local focused
checks passed; remote results are bound to the revision identified below, not to
later unpublished source changes.

Azure 749 follow-up under #105: one offline helper ZIP/import test failed because
the Development job installed only root dependencies, not the locked optional
helper SDK. The existing full GitHub candidate gate passed because it includes
helper setup. Azure Development now installs those dependencies before tests;
two ordering/boundary regressions and the 496-test integrated suite pass locally.
The original failed run is not relabeled as successful. Exact revision
`9307752ddc583f632f9b8a758a1172eb3a4e7d39` subsequently passed Azure Lifecycle
751, GitHub push/PR validation, and CodeQL analysis/check. This verifies that
pipeline repair, not authentication, provider certification or Store release.
New local Cloudflare OAuth/read-only-preset changes remain unpushed and are not
covered by that remote success.

Cloudflare OAuth feature [#159](https://github.com/Mr-GraphnStaff/better-captionkeep/issues/159)
is linked to Azure Task #348. It adds a separate Windows helper-owned sign-in,
not IDE-token extraction or an assumption that a registered server is already
authenticated for CaptionKeep. Callback/state/PKCE, issuer/resource binding,
noninteractive refresh and OS-protected credential controls have independent
synthetic coverage; live consent and installed-browser acceptance are separate.

Confirmed transport defect [#160](https://github.com/Mr-GraphnStaff/better-captionkeep/issues/160):
the IPv4-only resolver rejected the entire result when a public host also had
AAAA records. It reproduced against unauthenticated public Cloudflare metadata.
Both fetches now explicitly request A records and reject all unsafe/unexpected
selected addresses without a fallback. The repaired OAuth metadata GET returns
200. This is not an authenticated account or DNS-operation test.

OAuth prototype defect [#161](https://github.com/Mr-GraphnStaff/better-captionkeep/issues/161):
the initial token handler accepted a synthetic response with broader scopes
than requested. Initial and refresh scope sets are now checked against explicit
consent before persistence; omitted scopes retain only the requested/bound set.
The default sign-in does not retain a refresh token or request offline access.
Independent SDK/callback/store regressions passed. No real overbroad grant,
credential exposure, executed account action or deployed vulnerability is claimed.
Both #160 and #161 are linked to Azure Task #348 and remain open for acceptance.

Cloudflare consent compatibility defect
[#162](https://github.com/Mr-GraphnStaff/better-captionkeep/issues/162): two
user-approved sign-in attempts reached the callback but failed token
exchange/validation before credential persistence. No authenticated connection
or API action was claimed. Cloudflare's bootstrap-scope expansion is incompatible
with the strict minimal requested scope set; no private token response is
published or inferred as evidence of account access.

The lead explicitly approved a read-only session preset for the test. The local
correction requests only the bounded metadata-derived read catalog plus required
bootstrap/offline consent scopes upfront, rejects write or unknown returned
scopes, discards refresh tokens and refuses renewal after session expiry.
Independent synthetic tests cover expanded-grant acceptance only with the
explicit preset, write/unknown-scope rejection before storage, malformed catalog
rejection before registration, and expired-preset refresh denial. The controlled
live retry succeeded on October 15 UTC: helper-owned authorization accepted the
read-only session preset, and the installed helper's authenticated `tools/list`
returned four tool schemas, including `whoami`. No tool was invoked; actions
remain empty. Installed extension enrollment is still separate acceptance;
#162 stays open. These OAuth changes are local and unpushed, separate from the
remote CI acceptance recorded for #105.

Follow-up cleanup: the temporary access token was revoked (issuer HTTP 200),
and the same authenticated metadata request then returned HTTP 401. No refresh
token was retained. The encrypted file remains because file deletion was denied
by the safety guard; no file-removal claim is made. A real trusted Brave click
and browser permission were observed, but native enrollment did not complete.

Settings recovery defect [#163](https://github.com/Mr-GraphnStaff/better-captionkeep/issues/163),
linked to Azure Task #348: an unresolved optional permission promise left the
Settings section busy and all connection controls disabled indefinitely.
`byomcpSettings.js` now bounds permission/policy/helper waits, restores controls,
announces actionable recovery, and ignores late grants/stale replies. Browser
permission is still requested synchronously in the original click and rechecked
by the worker. Focused controller and actual rendered DOM recovery tests passed;
real native enrollment remains separate open acceptance.

On revision `12806ec`, #105 also tracks a later Linux Edge startup timeout in
both GitHub validations; Azure 752 and CodeQL passed. A diagnostic/isolation
correction is local, not a proven Linux fix. No assertion, sandbox or startup
deadline is relaxed to hide the failure. The subsequent `5da5796` rerun passed
both GitHub validations with Linux Chrome/Edge rendered and loaded-extension
smoke, plus CodeQL and Azure 754/755. This does not establish the exact cause of
the earlier startup failures or certify real meeting providers. #163's reviewed
fix is pushed; installed native enrollment remains open acceptance.

First-party Cloudflare comparison, October 15: [#164](https://github.com/Mr-GraphnStaff/better-captionkeep/issues/164)
tracks standard Streamable HTTP responses and SDK version negotiation rejected
by our transport wrapper. The bounded repair and actual SDK modern/2025 fixture
tests pass; this is not a live Cloudflare/native enrollment acceptance claim.

[#165](https://github.com/Mr-GraphnStaff/better-captionkeep/issues/165) tracks
discarded browser/native connection reasons. Connect now emits fixed safe enums
only; raw OS/provider diagnostics stay private and action failures remain opaque.
Settings maps the codes to recovery instructions and correctly represents a
metadata-only verified connection with actions off. Independent production-chain
regressions passed. Both issues remain open until applicable acceptance is met.

[#166](https://github.com/Mr-GraphnStaff/better-captionkeep/issues/166) records
a test-only shareable-summary timing defect found by the integrated suite:
the fixed 20 ms wait could inspect export state before WebCrypto/source checks
completed. Bounded observable completion and a delayed-digest regression replace
the timing guess. Eight focused checks and twelve simultaneous eight-test runs
passed. Product export code was unchanged; no disclosure defect is inferred.
