# Competitive feature implementation ledger — October 3, 2026

Source location: `P:\Projects\better-captionkeep`, branch `codex/recover-5.3-project`.
No Store submission, license service activation, provider writes or tenant changes are implied.

## Store evidence

Listings describe vendor claims, not independently tested competitor behavior:

- [Tactiq, Chrome](https://chromewebstore.google.com/detail/tactiq-ai-note-taker-for/fggkaccpbmombhnjkjokndojfgagejfb): PDF/Word, task templates, chat, screenshots, translation via AI, archive search, integrations.
- [Tactiq, Edge](https://microsoftedge.microsoft.com/addons/detail/tactiq-kinotizhelfer-f%C3%BC/ldihbakgcndcoojkibjniljbadkanaic): chat/screenshots, prompts, exports, search, cloud storage/CRM.
- [Google Meet CC Capturer, Chrome](https://chromewebstore.google.com/detail/google-meet-cc-capturer/kfmplmijeffknchbkhbdocilgfcokmec): history, preview, TXT/SRT, timestamps, shortcuts, multilingual UI.
- [Transcript Assistant, Chrome](https://chromewebstore.google.com/detail/transcript-assistant-%E2%80%93-me/abdfkmgniiijbffflcfmkfejigmcepec): live view, copying, TXT, three providers.
- [Teams Transcript Exporter, Edge](https://microsoftedge.microsoft.com/addons/detail/mddafbeijigbdbchhdiimghjggmckfip): verified-source VTT/SRT, DOCX, compact AI format, keyboard export, speaker merging.
- [IceCubes, Edge](https://microsoftedge.microsoft.com/addons/detail/ehafkkjkgebdlgfllhkgdibllgeoaecf): caption capture and cloud summaries/sync.
- [Trippi, Chrome](https://chromewebstore.google.com/detail/live-meeting-translation/eaheoieoelghhmebennamldmjmmfppjk): audio-derived live translation, dual captions, summaries and transcript exports.
- [Fireflies, Chrome](https://chromewebstore.google.com/detail/fireflies-ai-meeting-note/meimoidfecamngeoanhnpdjjdcefoldn): recording, transcript search, notes, sharing and integrations.

## Implementation state

| Capability | Current state | Remaining verification/work |
| --- | --- | --- |
| Three-provider rendered-caption capture | Recovered source | Live regression UAT, Zoom attribution remains Unknown speaker |
| Archive, cross-meeting search, corrections, local dictionary, DOCX | Recovered source and automated tests | Live browser UAT |
| Highlights, action/decision/risk markers | Existing Evidence Board | Live regression UAT |
| Full-meeting reviewed BYOAI handoff | Recovered source | Live long-meeting UAT |
| PDF | Print / PDF action implemented | Actual print-preview/PDF UAT; not a direct PDF writer |
| Per-export types and keyboard actions | Implemented | Live Chrome/Edge UAT |
| Reusable task templates | Implemented, local instructions only | Live handoff/save/delete UAT |
| Chat and shared links | User-requested loaded-pane snapshots implemented | Live selectors for each provider; not automatic/full-history capture |
| Screenshots | Active-tab capture, review, explicit local retention implemented | Live Chrome/Edge and navigation/policy UAT; no automatic OCR masking |
| Translation | On-device feature-detected derivative with incremental visible-caption mode | Real language models/browser UAT; unavailable-device fallback is reviewed AI template |
| All settings | Shared full-page view registered in all manifests | Responsive/browser visual UAT |
| Universal feature access | Every shipped feature works for every user | No paid tier, activation, subscription, or license gate |
| Google Drive/Docs | Transport adapter and mocked tests | App registration, account connection, reviewed upload UI and live consent/upload UAT |
| Microsoft OneDrive/SharePoint | Transport adapter and mocked tests | Separate delegated file-write consent, destination UX, reviewed upload UI and live UAT |
| Notion | Excluded by user's corrected destination choice | None for this scope |
| Imported VTT/SRT subtitle exports | Implemented only for original Graph-imported media cue boundaries | Live imported transcript/export UAT; old archives without stored boundaries require re-import |
| Speaker-block merging / compact derivative | Still pending | Keep source references; do not remove negations or acknowledgement evidence silently |
| Multilingual interface | Still pending | Localization, language selection and accessible layout tests |
| Audio transcription / additional provider adapters | Still pending | Separate consent/privacy architecture and actual provider fixtures |
| Remote automatic AI summaries, semantic multi-meeting Q&A | Still pending | Provider selection, account authorization, grounded citations and privacy review |
| Automatic sync, CRM/Slack/Teams publishing, team collaboration | Still pending | Individual integration choices and explicit outbound authorization; never automatic unauthorized sharing |
| YouTube/imported-media summaries | Still pending | Authorized import/source parsing, distinct evidence provenance |

The ledger is intentionally not a claim of full competitor parity. Open items remain in scope unless the user changes it; they are not counted as done or disguised as working UI.

## Cloud and release boundaries

The user selected Google Drive/Docs and Microsoft OneDrive/SharePoint, correcting an earlier Notion selection. Cloud upload sign-in cannot be honestly completed without provider app configuration and separate consent. The adapters do not persist access tokens, only use fixed provider API endpoints, do not automatically retry mutations, and create new files instead of intentionally replacing existing ones.

The previously confirmed build-tool audit findings remain release blockers. Keep the configured Edge QA folder and identity stable. Stage new review builds under this project's `dist`, never in Codex task storage. Preserve the existing local-only Graph configuration when refreshing the canonical QA folder.

## Fresh source validation and review builds

- 173 automated tests passed, zero failures.
- Extension validation, Store metadata consistency, JavaScript syntax and patch whitespace checks passed.
- The temporary Chrome/Edge review folders were reconciled into the source tree
  and removed. Current release-candidate validation uses only `dist/uat`.
- The UAT manifest now carries a stable identity key; ad hoc review paths are not
  supported because they create duplicate extension identities and OAuth callbacks.
- No live browser/provider/model/cloud upload validation is claimed.
- Original MIT attribution is retained; unrelated `.gitignore` and `docs/public/`
  edits remain untouched and no commit/PR merge/Store publication was performed.
