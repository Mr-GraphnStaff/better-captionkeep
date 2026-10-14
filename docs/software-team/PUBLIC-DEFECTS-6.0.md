# Public 6.0 defect and scope-gap register

Recorded October 14, 2026. Each issue below was reread from GitHub after creation.
Confirmed defects and explicit scope gaps are public; two feature requests are
labeled as scope gaps rather than fabricated runtime bugs. Source paths and
reproductions are synthetic and do not expose meeting content or credentials.

All 44 records remain open. Local fixes and tests are not deployment,
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
| [#105](https://github.com/Mr-GraphnStaff/better-captionkeep/issues/105) | 6.0: Ubuntu validation can skip all browsers and uses an incompatible rendered-test runtime | Local repair; live/release acceptance open |
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
