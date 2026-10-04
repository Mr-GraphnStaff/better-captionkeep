# Competitive landscape and feature implementation ledger

Last verified: **October 4, 2026**.

This document corrects the earlier conclusion that Better CaptionKeep occupied an uncontested space. It does not. **SonicMeet is a direct competitor** for browser-based captions, transcripts, translation, notes, and meeting summaries across Microsoft Teams, Google Meet, and Zoom. Competitor capabilities below are public vendor claims unless explicitly marked as independently tested.

No Store submission, competitor installation, provider write, tenant change, or claim of legal compliance is implied by this analysis.

## Store evidence

Listings describe vendor claims, not independently tested competitor behavior:

- [SonicMeet, Edge](https://microsoftedge.microsoft.com/addons/detail/live-captions-translati/bckdpelmlohdnhnmaldandjdblnnmmmp) and [SonicMeet product site](https://sonicmeet.app/): browser and desktop audio capture, independent transcription, bilingual live captions, translation, transcript history, notes, AI summaries, accounts, cloud history, and paid usage plans.
- [Tactiq, Chrome](https://chromewebstore.google.com/detail/tactiq-ai-note-taker-for/fggkaccpbmombhnjkjokndojfgagejfb): PDF/Word, task templates, chat, screenshots, translation via AI, archive search, integrations.
- [Tactiq, Edge](https://microsoftedge.microsoft.com/addons/detail/tactiq-kinotizhelfer-f%C3%BC/ldihbakgcndcoojkibjniljbadkanaic): chat/screenshots, prompts, exports, search, cloud storage/CRM.
- [Google Meet CC Capturer, Chrome](https://chromewebstore.google.com/detail/google-meet-cc-capturer/kfmplmijeffknchbkhbdocilgfcokmec): history, preview, TXT/SRT, timestamps, shortcuts, multilingual UI.
- [Transcript Assistant, Chrome](https://chromewebstore.google.com/detail/transcript-assistant-%E2%80%93-me/abdfkmgniiijbffflcfmkfejigmcepec): live view, copying, TXT, three providers.
- [Teams Transcript Exporter, Edge](https://microsoftedge.microsoft.com/addons/detail/mddafbeijigbdbchhdiimghjggmckfip): verified-source VTT/SRT, DOCX, compact AI format, keyboard export, speaker merging.
- [IceCubes, Edge](https://microsoftedge.microsoft.com/addons/detail/ehafkkjkgebdlgfllhkgdibllgeoaecf): caption capture and cloud summaries/sync.
- [Trippi, Chrome](https://chromewebstore.google.com/detail/live-meeting-translation/eaheoieoelghhmebennamldmjmmfppjk): audio-derived live translation, dual captions, summaries and transcript exports.
- [Fireflies, Chrome](https://chromewebstore.google.com/detail/fireflies-ai-meeting-note/meimoidfecamngeoanhnpdjjdcefoldn): recording, transcript search, notes, sharing and integrations.

## Correction: SonicMeet is a direct competitor

The live Edge listing was verified on October 4, 2026:

- Publisher: **XTCodeTech**, with four Edge add-ons.
- Edge traction: **216 users**, **0 reviews**.
- Edge version: **1.4.4**, updated September 24, 2026.
- Listing localization: **13 languages**.
- Browser platforms: Microsoft Teams, Google Meet, and Zoom.
- Claimed capabilities: audio-derived live captions, bilingual translation, overlay, saved transcripts and notes, and structured AI summaries.

The public product site materially expands the competitive picture. SonicMeet also offers Windows and macOS applications, supports desktop meeting clients by capturing system audio, uses its own transcription/translation pipeline, advertises 62 languages, stores account-linked history, and sells metered subscriptions from $10 to $79 per month plus team plans.

The Edge disclosure says no personal data is collected, but SonicMeet's own privacy policy says it may collect account information, meeting audio, transcripts, translations, notes, summaries, session history, IP/approximate location, diagnostics, usage analytics, and payment metadata. It says audio may be transmitted to SonicMeet or speech-processing providers, and transcript-related data may be stored on its systems or provider infrastructure. The competitive analysis must describe that documented architecture without speculating about undisclosed vendors or claiming a legal violation.

## Buyer-oriented comparison

| Capability | Better CaptionKeep | SonicMeet | Strategic meaning |
| --- | --- | --- | --- |
| Browser meeting coverage | Teams Web/PWA, Google Meet, and Zoom Web | Teams, Meet, and Zoom in browser | Direct overlap; the previous “no Zoom” characterization of Better CaptionKeep is wrong. |
| Desktop-client coverage | Absent; browser/PWA only | Windows/macOS system-audio application covers desktop clients and other audio | SonicMeet leads for native-client breadth. Do not imply parity. |
| Capture source | Captions already rendered to the participant; optional customer-authorized official Teams transcript import | Meeting-tab or system audio sent through an independent transcription pipeline | Better CaptionKeep minimizes capture scope; SonicMeet is independent of provider captions. |
| Live translation | Feature-detected on-device browser translation with explicit fallback; availability varies by browser/language pair | Cloud/service-backed bilingual translation, two modes, 62 claimed languages | SonicMeet leads on predictable multilingual breadth; Better CaptionKeep leads when local processing is the buying criterion. |
| Transcript storage | Browser-local history; no developer transcript server | Account-linked saved transcript, translation, notes, summary, and session history | This is the clearest privacy and deployment distinction. |
| AI workflow | Scrubby plus review-first Bring Your Own AI handoff; no automatic submission | Built-in summaries and Ask AI using metered credits | SonicMeet is more convenient; Better CaptionKeep gives the user/provider choice and a deliberate disclosure boundary. |
| Notes and evidence | Evidence Board with decisions, actions, questions, risks, follow-ups, source-preserving corrections, and fingerprinted official imports | Caption-linked/freeform notes and AI recap claims | Better CaptionKeep can lead on traceability, but the Store listing must prove it visually. |
| Accounts and pricing | No account; every feature free | Account required; one-time 20 free minutes, then metered paid plans and team subscriptions | Better CaptionKeep has a strong adoption and trust advantage. |
| Audio/video collection | No microphone, tab audio, system audio, video, or meeting bot | Tab/system audio processing; optional microphone; no normal audio-recording retention claimed | Better CaptionKeep has the narrower data boundary. |
| Analytics | No developer-operated analytics | Privacy policy describes technical, diagnostic, performance, and usage analytics | Material enterprise privacy distinction. |
| Localization | English-only product UI today | Edge listing in 13 languages; 62 transcription/translation languages claimed | Better CaptionKeep is behind. Canadian French and Spanish are now enterprise-adoption gates, with managed Quebec deployment required. |
| Edge proof | 4.5 stars from 2 reviews; public listing currently suffers search-index visibility problems | 216 users and no reviews | Neither has durable social proof; discoverability and genuine reviews matter. |

## Revised positioning

Better CaptionKeep is not the broadest automated transcription product. Its defensible position is:

> **The free, local-first meeting record for organizations that want useful transcripts without sending meeting audio or transcript history to the extension publisher.**

That position must be supported by evidence, not generic “privacy-first” language:

- no developer-operated transcript server;
- no account, subscription, advertising, or analytics;
- no microphone, tab-audio, video, or bot capture;
- browser-local history and deletion;
- customer-owned single-tenant Microsoft 365 connection;
- source-preserving corrections and verified-source fingerprints;
- Scrubby and explicit review before AI handoff;
- all features available without payment.

The current Store description is stale and does not adequately communicate Zoom Web, on-device translation, the Evidence Board, customer-owned Microsoft 365 import, or universal free access. Store copy and screenshots require a coordinated update after the 5.3.2 recovery is public; the pending recovery submission must not be disrupted for a marketing-only revision.

## Product response

1. **Do not copy SonicMeet's architecture by reflex.** Server transcription, desktop audio capture, accounts, and cloud history would abandon Better CaptionKeep's strongest boundary.
2. **Close adoption gaps deliberately.** Canadian French and Spanish UI, localized Store material, and enterprise/privacy documentation are higher-priority adoption work than adding another cloud AI summary. Quebec devices must be able to receive Canadian French as a locked Intune policy on the same signed extension.
3. **Treat translation as a reliability gap, not an absent checkbox.** On-device translation exists, but browser/model availability and language coverage need measured evidence and clear Store wording.
4. **Keep Zoom claims precise.** Better CaptionKeep supports the Zoom Web subtitle overlay, not the native Zoom application, system-audio transcription, or reliable Zoom speaker attribution.
5. **Win on trust and evidence.** Show local storage, source fingerprints, Evidence Board lineage, deletion/export controls, and the lack of a publisher transcript server.
6. **Fix discoverability and proof.** Monitor exact-name Store search, update search terms/copy after 5.3.2, localize the listing, and seek genuine reviews without incentives or manipulation.
7. **Refresh this review at every release gate.** Record product/version/date, Store traction, pricing, privacy claims, languages, material feature changes, and the sources used.

French, Spanish, Quebec managed deployment, and GDPR-oriented adoption requirements are defined in [Multilingual Privacy and Enterprise Adoption Gate](FRENCH-GDPR-ADOPTION-GATE.md).

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
