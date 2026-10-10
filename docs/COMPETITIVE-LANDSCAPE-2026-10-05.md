# Browser-extension competitive landscape — updated October 10, 2026

Status: **point-in-time public-Store research and next-release decision input**.

This review supersedes the discovery coverage in
[`COMPETITIVE-FEATURES-2026-10-03.md`](COMPETITIVE-FEATURES-2026-10-03.md).
It does not replace that document's implementation ledger or independently
validate a competitor's private runtime, package, server, security, or privacy
behavior. Features below are Store or vendor claims unless explicitly described
as Better CaptionKeep source evidence.

No competitor extension was installed, no account was created, and no meeting
content was submitted during this review.

The October 10 addendum below verifies additional Edge listings supplied by the
product owner. Direct Edge pages were checked alongside matching Chrome Store,
vendor-site, and wider-web evidence because the Edge catalog does not expose all
listing detail reliably to search crawlers.

## Search boundary and method

The search covered the major browser-extension distribution surfaces with
multiple product and problem terms instead of relying on a single Store result
page:

- Chrome Web Store: `meeting transcript`, `caption saver`, `Google Meet
  transcript`, `Teams transcript`, `Zoom transcript`, `meeting notes`, `live
  caption translation`, plus named-product checks.
- Microsoft Edge Add-ons: the same capability terms plus direct listing checks
  for Better CaptionKeep, SonicMeet, DBird Dual, Tactiq, and Teams Transcript
  Exporter.
- Firefox Add-ons: `meeting transcript`, `Google Meet captions`, `Microsoft
  Teams transcript`, and `Zoom meeting notes`.
- Opera Add-ons: `meeting transcript`, `Google Meet transcript`, and named
  checks. The native catalog returned noisy or unrelated results and explicitly
  directed users to the Chrome Web Store. Opera users can install many Chromium
  extensions, so Chrome remains the material Opera-compatible market.
- Safari/macOS App Store: meeting-transcript and Safari-extension searches. A
  narrow Google Meet Transcripts Safari product was found, but no current broad
  Teams/Meet/Zoom Safari-extension peer was substantiated through a comparable
  public listing.

Brave, Vivaldi, and other Chromium browsers do not have a comparably material
independent extension catalog for this category; Chrome Web Store compatibility
is the relevant distribution surface.

This is a comprehensive bounded search, not a claim that every extension in
every locale was enumerated. Store search indexes are incomplete and change
without notice.

## Market map

### Direct competitors

| Product | Store evidence on October 5 | Claimed strengths | Important boundary |
| --- | --- | --- | --- |
| [Tactiq](https://chromewebstore.google.com/detail/tactiq-ai-note-taker-for/fggkaccpbmombhnjkjokndojfgagejfb) | Chrome: 1,000,000 users, 4.8/5 from 4.4K ratings; [Edge](https://microsoftedge.microsoft.com/addons/detail/tactiq-kinotizhelfer-f%C3%BC/ldihbakgcndcoojkibjniljbadkanaic): 13,000+ users, 14 ratings | Teams/Meet/Zoom, speaker labels, highlights, chat, screenshots, AI summaries and questions with source quotes, reusable prompts, Word/PDF/Google Docs/Notion, Slack/Teams/CRM, shared team memory | Cloud account, stored team knowledge, AI, integrations, and paid features are central to the offer. |
| [tl;dv](https://chromewebstore.google.com/detail/tldv-free-ai-note-taker-t/lknmjhcajhfbbglglccadlfdjbaiifig) | Chrome: 400,000 users, 4.6/5 from 584 ratings | Recording, transcription in 20+ languages, AI templates, multi-meeting questions, clips, search, automatic sharing, CRM/Zapier | Recording and cloud/team automation are a different data boundary from caption-only local capture. |
| [SonicMeet](https://microsoftedge.microsoft.com/addons/detail/live-captions-translati/bckdpelmlohdnhnmaldandjdblnnmmmp) | Edge: 216 users, 0 ratings, v1.4.4, 13 listing languages | Teams/Meet/Zoom captions, bilingual overlay, translation, transcripts, notes, structured summaries | Listing declares collection of personally identifiable information; service behavior must not be inferred beyond its public disclosures. |
| [DBird Dual](https://chromewebstore.google.com/detail/dbird-dual-live-meeting-t/klfjjicphehnmcnbbpfmbnfpnngelopo) | Chrome: 407 users, 4.9/5 from 12 ratings, v2.1.4; [Edge](https://microsoftedge.microsoft.com/addons/detail/dbird-dual-subtitles-mi/acofojbkdlnnfakafoagjaikogcfkoad) also listed | Three-provider, speaker-by-speaker original plus translated captions, inline/floating modes, local transcript, Chrome/Edge on-device translation, AI summary | Summary sends transcript for processing according to its Store copy; the listing also says it is not retained. Translation and saved transcript claims are local. |
| [Kai](https://chromewebstore.google.com/detail/kai-%E2%80%94-meeting-transcripti/bpondgnhlcmldhemoodlpoalcaeeplpg) | Chrome: 382 users, 5.0/5 from 4 ratings | Three-provider and any-audio-tab capture, on-device Whisper, on-device summary/action items, side panel, no account/upload/bot | Audio-derived capture is broader than Better CaptionKeep's displayed-caption boundary and requires a materially different package/performance review. |
| [Meet Companion](https://addons.mozilla.org/en-US/firefox/addon/meet-companion/) | Firefox: 1 user, v1.17.0, updated October 2 | Local Meet/Teams caption archive; summary, timeline, decisions, actions, risks, questions, weekly digest, single/cross-meeting questions; BYO cloud or local AI; Markdown/PDF | Firefox listing declares personal-communications handling and native messaging. Zoom is import-only rather than live capture. |
| [Transcript Assistant](https://chromewebstore.google.com/detail/transcript-assistant-%E2%80%93-me/abdfkmgniiijbffflcfmkfejigmcepec) | Chrome: 918 users, 4.9/5 from 92 ratings | Simple live Teams/Meet/Zoom transcript, copy, TXT, no bot/dashboard | Narrow product; little archive, provenance, governance, or export depth is claimed. |

### Focused caption/export competitors

| Product | Store | Claimed feature that matters |
| --- | --- | --- |
| [Teams Transcript Exporter](https://microsoftedge.microsoft.com/addons/detail/teams-transcript-exporter/mddafbeijigbdbchhdiimghjggmckfip) | Edge: 297 users, 2 ratings; [Firefox](https://addons.mozilla.org/en-US/firefox/addon/teams-transcript-exporter/): 43 users | Reads a loaded Teams/SharePoint official transcript; VTT, SRT, DOCX, clipboard, keyboard shortcut, consecutive-speaker merge, compact AI derivative, entry count. |
| [Caption Saver for Google Meet](https://chromewebstore.google.com/detail/caption-saver-for-google/jijidncmnhofnlbdaddfpklgobmejbee) | Chrome: 33 users | Visible REC indicator, live line count, reload recovery, TXT/SRT/VTT/JSON, narrow host permission. |
| [Meet Transcript Saver](https://chromewebstore.google.com/detail/meet-transcript-saver-for/pajialpngecbdnmobpfopfjjkhppmoma) | Chrome, v1.0.0 | Auto-enable captions, draggable live widget, title/participant/date search, meeting-link retention and rejoin, crash recovery, local-only storage. |
| [Caption Grab](https://chromewebstore.google.com/detail/caption-grab-google-meet/kphhjefelpcfepnkdnlbpdlconahedkf) | Chrome: 73 users | Meet and Vimeo caption capture, TXT/JSON/Markdown, configurable filename/debounce, offline/no cloud. |
| [Meet Transcript](https://chromewebstore.google.com/detail/meet-transcript/beeickjpibjhepboajdfdipekpgpkbai) | Chrome: 9 users | Search/edit/copy/export, highlights/actions/notes/bookmarks, campaigns, optional Google Drive backup. |
| [MeetLive](https://chromewebstore.google.com/detail/meetlive-ai-meeting-notes/mbniongbpabplcbhdidamihcnmgielec) | Chrome: 16 users | Rolling live notes, grounded in-meeting questions, templates, 80+ caption languages, translation, screenshots, TXT/JSON, eight UI languages. |
| [Google Meet Transcript](https://chromewebstore.google.com/detail/google-meet-transcript/bhhiklmmeaocmkdckggfljkcpajcpegl) | Chrome: 430 users, 5.0/5 from 2 ratings | On-device Whisper audio transcription, local history, 52 listing languages, user-directed LLM export. |
| [MeetGrab](https://addons.mozilla.org/en-US/firefox/addon/meetgrab-google-meet-ai-note/) | Firefox: 48 users | Caption-only Meet notes and summaries, local library, mixed-language focus, Markdown, no account. |
| [TranscripTonic](https://addons.mozilla.org/en-US/firefox/addon/transcriptonic/) | Firefox: 50 users | Automatic/manual Meet capture, captions plus chat, multilingual text export, webhooks. |
| [Meet Transcript](https://addons.mozilla.org/en-US/firefox/addon/meet-transcript/) | Firefox: 8 users | Caption-only Meet capture and minutes with optional AI-provider origins. |
| [ItsMeHere Meeting Recorder](https://addons.mozilla.org/en-US/firefox/addon/itsmehere-meeting-recorder/) | Firefox: 3 users | Three-provider audio recording, local checkpoints, automatic recovery/upload, account-based transcript and minutes, cross-meeting questions, explicit consent indicator. |

### Adjacent products

Grilo, MeetNotes, MeetingsAI, IceCubes, Felo, Trippi, iTour, Fireflies, and
similar extensions compete for meeting intelligence, translation, or recording.
They are strategically relevant, but audio capture, cloud accounts, mobile sync,
sales coaching, team workspaces, or broad video translation makes them less
direct than caption-first transcript tools.

## October 10 Edge-listing addendum

| Product | Current public evidence | Competitive meaning | Classification |
| --- | --- | --- | --- |
| [Jeudly](https://addons.mozilla.org/en-US/firefox/addon/jeudly-meeting-captions-saver/) | Firefox reports 2 users, no ratings, v1.0.6, and a July 10, 2026 update. The listing says it avoids DOM scraping by intercepting the meeting platforms' network/Redux layers and streams transcripts to a Jeudly account. Inspection of the signed public v1.0.6 package (SHA-256 `AC5EDA6E81CA4159F834BC25DFCD22991FC51B85B5C56B04B685F4B1E34B544D`) confirms that caption text is obtained by monkey-patching undocumented internals: Google Meet `RTCPeerConnection` data channels plus protobuf decoding and roster-fetch interception; Zoom Redux stores/actions plus socket commands; and Teams WebSocket, `RTCPeerConnection`, roster frames, and internal calling objects. The package still uses DOM operations for MAIN-world script injection, page title and URL metadata, Zoom iframe discovery, overlays, Teams caption-language controls, and failure detection. When signed in, its service worker creates cloud meeting records and bulk-uploads caption blocks to `jeudlyapi.jeudtech.com` with bearer-token authentication. | “No DOM scraping” is narrowly accurate for the caption payload, not a claim of no DOM access or local-only processing. Direct transport events may avoid some visual-selector breakage and preserve richer event metadata, but the implementation is tightly coupled to private protocols, Redux actions, protobuf schemas, and internal call-object shapes. It also programmatically starts or opens caption channels, conflicting with Better CaptionKeep's explicit user-controlled capture direction. Treat this as adapter research, not code or architecture to copy. | **Direct / experimental transport** |
| [OpenNoteTaker](https://microsoftedge.microsoft.com/addons/detail/meeting-recorder-ai-not/adfnhkmknajcfclcllekjihnncmheblf) | Edge lists the product at 5/5 from 2 ratings. Its [Chrome listing](https://chromewebstore.google.com/detail/meeting-recorder-ai-notes/jdcdmbjofjpalkidlefnbhbfcmcagcgn) and [product site](https://opennotetaker.app/) claim bot-free Meet, Zoom, Teams, and Tencent capture; on-device Whisper transcription and speaker separation; local summaries, search, and exports; no account for local features; and open source/self-hosting. Optional AI minutes, cross-library Q&A, and translation use paid backend credits. | This is the most strategically important new entrant. It now competes directly for the local-first, no-account, no-bot position and explains its architecture with unusually concrete privacy copy. Its audio capture provides broader coverage than displayed captions, while Better CaptionKeep retains a stronger evidence-provenance and managed-enterprise story. | **Direct** |
| [MeetLive](https://microsoftedge.microsoft.com/addons/detail/meetlive-ai-meeting-note/kkennodgmjifilebjfeiliecocblfcdf) | The Edge listing is present with no ratings. Its [Chrome listing](https://chromewebstore.google.com/detail/meetlive-ai-meeting-notes/mbniongbpabplcbhdidamihcnmgielec) reports 16 users and 1 rating and claims rolling in-meeting notes, live transcript-grounded AI questions, follow-up drafting, translation, screenshots, templates, and a synced cloud workspace. Caption capture is text-only, while live translation streams audio during explicit use. | Its strongest lesson is not raw platform count; it is a coherent live-meeting panel that turns captured words into useful work before the call ends. This validates the On the Fly direction, but its cloud workspace and publisher AI are not the Better CaptionKeep trust model. | **Direct** |
| [DBird Dual](https://microsoftedge.microsoft.com/addons/detail/dbird-dual-live-meeting-/acofojbkdlnnfakafoagjaikogcfkoad) | The current vendor page claims Teams, Zoom, and Meet; speaker-by-speaker bilingual captions; local browser translation; local transcripts; 30+ languages; 100 free translations per day; and a one-time paid upgrade. It says one-click AI summary sends transcript text for processing but does not retain it. | DBird remains the clearest live-translation UX benchmark. Its paired original/translation presentation, two-click activation, and plain pricing are worth matching in clarity, not by copying its unverified privacy superlatives. | **Direct** |
| [MeetingHub](https://microsoftedge.microsoft.com/addons/detail/meetinghub-ai-meeting-re/ofaicdkdjhgefibcnbbofocgpkkpnlje) | Edge lists it with no ratings. Its [Chrome listing](https://chromewebstore.google.com/detail/meetinghub-ai-meeting-rec/fbfagiblphdfmgnokogeeebngjlgfkkc) reports 52 users and 2 ratings and claims capture across 19 browser meeting platforms, 100+ languages, uploaded tab/microphone audio, a cloud account, AI summaries, document uploads, cross-meeting chat, recurring-topic tracking, and team sharing. | The “19 platforms” claim comes from generic browser-audio recording rather than nineteen caption adapters. That breadth is real for users, but it carries recording-consent, audio-upload, retention, identity, and enterprise-review costs that Better CaptionKeep intentionally avoids. | **Adjacent recorder / intelligence hub** |
| [Banafo](https://microsoftedge.microsoft.com/addons/detail/banafo-transcribe-rec/fkgojjjehknjckmjfepghlgjofepjncj) | Edge lists it with no ratings. Its [Chrome listing](https://chromewebstore.google.com/detail/banafo-transcribe-record/fimdehpmamnjanklbfejacbkomabdhdh) reports about 467 users and 2 ratings and claims recording of any browser conversation, cloud upload to a Banafo account, limited free transcription, synchronized manual notes, paid AI insights, and paid Google Drive export. | Banafo's broad meeting support is another result of generic audio capture. Synchronized personal notes are useful; the account, audio upload, cloud storage, and broad Store data disclosures make it a different procurement proposition. | **Adjacent recorder** |
| [NoteMeet](https://microsoftedge.microsoft.com/addons/detail/notemeet-meeting-recorder/njjobhoojhpgimbmdleifbkoghncindb) | Edge lists it with no ratings. Its [Chrome listing](https://chromewebstore.google.com/detail/notemeet-meeting-recorder/iglooicboappkpddcinabadplpbkchfl) was last updated January 12, 2025 and claims Meet, Zoom, and Teams recording, real-time transcription, AI summaries, cloud storage, and sharing. | The offer is broad but generic and lightly evidenced. It is useful as category-language research, not as a product-design leader. | **Adjacent / lower-priority** |
| [Work Hub for Teams](https://microsoftedge.microsoft.com/addons/detail/work-hub-for-teams/nlbnhijdmapeoephdniekfboafkgnkbc) | A third-party Edge-catalog snapshot reports roughly 3,000 installs, 4.2/5 from 8 ratings, and a March 2024 update. It is a compact standalone Teams web wrapper with always-on-top/sidebar behavior, notifications, and sharing—not a transcript, evidence, or AI note-taking product. Its published permission explanation includes broad request interception and all-sites access for its wrapper behavior. | There is no meeting-intelligence feature to copy. The only relevant idea is compact multitasking presentation; Better CaptionKeep already has a safer, purpose-built side panel and should not inherit this wrapper's broad permission model. | **Not a competitor** |

### What changes after this addendum

1. **Local-first is no longer an open position.** OpenNoteTaker now makes a
   strong, specific, open-source claim to local audio, transcription, summary,
   search, and export. Better CaptionKeep must lead with its different proof:
   displayed-caption minimization, source-linked evidence, reviewed disclosure,
   customer-owned destinations, managed policy, and release provenance.
2. **On the Fly is competitively validated.** MeetLive's live transcript Q&A
   and drafting make clear that users value answers during the meeting. Better
   CaptionKeep should implement the reviewed provider-adapter flow without
   implying an automatic assistant service or silently sending transcript text.
3. **Do not chase platform-count headlines with audio capture.** MeetingHub and
   Banafo cover many services because they record generic tab audio. Adding that
   architecture would change Better CaptionKeep's permissions, consent model,
   privacy disclosures, processing cost, and enterprise risk.
4. **Do not replace visible-caption adapters wholesale with private transport
   hooks.** Jeudly demonstrates that network/Redux interception can capture
   richer events without parsing rendered caption nodes, but it substitutes one
   dependency for several deeper undocumented dependencies. A future hybrid
   experiment would require clean-room implementation, platform-specific kill
   switches, explicit start behavior, Store/privacy review, and live regression
   evidence; it is not a release shortcut.
5. **The marketing gap remains larger than the capability gap.** The strongest
   listings tell a visual sequence—meeting detected, capture active, useful
   result, export/share—and state platform breadth in the first sentence. The
   Better CaptionKeep Store story should show its own sequence: explicit start,
   live captions, source-linked Evidence Board, On the Fly review, and customer-
   controlled export or AI handoff.

## Better CaptionKeep's verified source position

Current source on `release/5.4` already meets or exceeds many Store claims:

- live rendered-caption capture for Teams Web/PWA, Google Meet, and Zoom Web;
- customer-owned, single-tenant Microsoft 365 import of an authorized official
  Teams transcript with separate raw source and provenance;
- local archive, recovery checkpoints, cross-meeting search, speaker aliases,
  corrections, and a local terminology dictionary;
- Evidence Board markers for decisions, actions, questions, risks, follow-ups,
  and important moments with source caption IDs;
- TXT, Markdown, DOCX, Print/PDF, Evidence Board Markdown, and provenance JSON;
- SRT/VTT only when an imported official source supplies real media cue
  boundaries; Better CaptionKeep does not invent cue timing from wall-clock
  observation;
- screenshot and loaded meeting-chat/shared-link review flows;
- on-device, feature-detected translation derivative with no silent cloud
  fallback;
- complete-meeting, reviewed BYOAI handoff with Scrubby, bounded copy chunks,
  reusable local task templates, and no automatic submission;
- no Better CaptionKeep account, subscription, publisher transcript service,
  advertising, analytics, microphone capture, video capture, or meeting bot;
- managed policy, Intune profiles, retention/deletion controls, permission
  rationale, enterprise deployment documentation, and release evidence.

The public Store pages understate this source position. On October 5, Chrome
still served 5.1.0 to 5 users with no ratings. Edge served 5.3.2 with a 4.5/5
rating from 2 users, but its description still led with the 5.0-era Teams/Meet
story and omitted Zoom Web, Evidence Board, Word/PDF, translation, official
Teams transcript import, universal feature access, and most enterprise controls.

## Honest capability matrix

Scale: **Strong** means deep and differentiating, **Adequate** means useful but
not leading, **Weak** means present with important limitations, and **Absent**
means not shipped.

| Buyer capability | Better CaptionKeep source | Strongest reviewed competitor evidence | Assessment |
| --- | --- | --- | --- |
| Three-provider caption capture | Strong | Tactiq, SonicMeet, DBird, Transcript Assistant | Parity on provider breadth; Zoom speaker identity remains a documented weakness. |
| Native-client/system-audio coverage | Absent | SonicMeet desktop, Kai audio-tab, tl;dv | Intentionally outside the current minimal-capture boundary. |
| Capture assurance and recovery | Strong but underexposed | Caption Saver, Meet Transcript Saver, ItsMeHere | Badge ON/OFF, popup line count/freshness, checkpoints, and saved history exist. Live page-level indicator and deliberate pause/resume deserve clearer UX/UAT. |
| Bilingual live presentation | Weak | DBird Dual, SonicMeet | Translation engine exists, but paired original/translation presentation and language readiness are not yet first-class. This is the clearest 5.4 product gap. |
| Product/listing localization | Weak | SonicMeet 13 listing languages; MeetLive 8 UI languages | 5.4 French Canadian and Spanish scope is necessary but not broad parity. |
| Notes with source traceability | Strong | Tactiq source quotes; Meet Companion decisions/actions/risks | Evidence Board and immutable source IDs are a defensible differentiator. |
| Built-in automatic AI summaries | Absent by design | Tactiq, DBird, Kai, Meet Companion, MeetLive | Better CaptionKeep offers reviewed BYOAI, not automatic summary generation. Do not mislabel it as equivalent. |
| Local/on-device AI | Absent | Kai; Meet Companion with Ollama/LM Studio | Material future option, but it requires model/package/performance and enterprise policy review. |
| Archive and cross-meeting retrieval | Strong | Tactiq, tl;dv, Meet Companion | Local full-text search is strong; semantic cross-meeting Q&A and weekly digests are absent. |
| Export depth and provenance | Strong | Teams Transcript Exporter, Tactiq | Better CaptionKeep leads on source-preserving evidence, but a plain transcript JSON export and speaker-block view would improve portability. |
| Automatic integrations/team memory | Absent by design | Tactiq, tl;dv | Automatic cloud sharing conflicts with the present review-first boundary. Reviewed destinations can be evaluated separately. |
| Enterprise manageability | Strong | Tactiq makes enterprise claims | None of the reviewed Store pages substantiated an equivalent combination of managed settings, Intune profiles, BYO single-tenant Entra registration, local-only profile, retention controls, SBOM/attestation, and release governance. This is a listing-evidence advantage, not a security certification. |
| Store traction and proof | Weak | Tactiq and tl;dv | The largest competitive deficit is distribution, current listing content, ratings, and discoverability rather than raw checkbox count. |

## 5.4 competitive response

The 5.4 train should use or exceed competitor ideas without copying their risk
model. Existing Azure Boards authority remains the source of committed scope;
new work below needs an approved item before implementation.

### Must deliver inside current 5.4 authority

1. **Finish Canadian French and Spanish product localization and localize both
   Store listings.** This closes the most obvious adoption gap without changing
   the data boundary. Targets: locale resources used by `popup.html`,
   `viewer.html`, `sidepanel.html`, `settings.html`, and Store metadata.
2. **Turn translation readiness into a buyer-visible bilingual experience.**
   Show original and translated text together, retain speaker/time/source ID,
   expose supported/available/download-required states, and keep the explicit
   no-cloud-fallback rule. Targets: `viewer.html` translation dialog,
   `viewer.js` functions `checkTranslationPair()` and
   `translateVisibleCaptions()`, and `translation.js`.
3. **Prove capture assurance.** UAT must verify the ON/OFF badge, popup line
   count, last-caption freshness, recovery warning, and the Track Live Captions
   control in Teams, Meet, and Zoom. Targets: `popup.js:updateStatusUI()`,
   `service_worker.js:updateBadge()`, provider content scripts, and the 5.4 UAT
   evidence.
4. **Replace stale Store copy and screenshots at 5.4 promotion.** Lead with the
   three providers and local/no-account boundary; show Evidence Board,
   translation, official Teams import, Word/PDF/export choices, and managed
   controls. Do not change the frozen 5.3.2 submission. Targets:
   `store-metadata/chrome.json`, Edge submission metadata, and `store-assets/5.4`.
5. **Pass the committed reliability and release safeguards.** Competitors sell
   convenience; Better CaptionKeep should differentiate with repeatable clean
   profile proof, upgrade canaries, and no silent capture loss.

### October 5 localization expansion decision

The product owner subsequently authorized a broader user-base experiment. The
reviewed core remains English, Canadian French, and Spanish, while 5.4 now
targets clearly labeled AI-assisted preview catalogs across major Chrome/Edge
locale families, including Indic, CJK, right-to-left, European, Latin American,
and Southeast Asian languages. Preview wording must not be represented as
professionally certified. Each catalog requires automated key/placeholder
validation, English fallback, representative script/layout testing, and a
privacy-safe user correction path. The exact locale list and gates live in
`RELEASE-5.4.md`; catalog count is not a public claim until packaging passes.

### Best next additions if explicitly authorized for 5.4

1. **First-class pause/resume control with a visible paused interval.** Reuse
   `captureCoordinator.js:pause()` and `resume()` and the existing
   `trackCaptionsToggle`; do not delete earlier captions or hide the gap.
2. **Plain transcript JSON export with provenance.** Reuse
   `exportProfiles.js:createProfile()` and preserve source IDs and any authentic
   cue boundaries. Do not imply that live wall-clock observations are media
   timestamps.
3. **Speaker-block reading mode.** Merge consecutive display blocks without
   mutating the authoritative caption sequence. Keep a reversible link from
   each block to its source caption IDs.

These additions are smaller and more aligned with Better CaptionKeep than a
publisher-hosted summary service, desktop-audio recorder, or automatic CRM
sync. They should not be treated as committed until assigned to approved work
items and tested against managed policy.

### Defer to separately governed releases

- Firefox distribution and API-compatibility work;
- on-device Whisper or another bundled speech model;
- local-provider AI through Ollama/LM Studio/OpenAI-compatible endpoints;
- semantic cross-meeting questions and weekly digests;
- native desktop-client/system-audio capture;
- live Google Drive/Docs and OneDrive/SharePoint upload;
- automatic Slack, Teams, CRM, webhook, or team-memory publishing; and
- Safari packaging.

### Do not copy

- automatic transcript upload or automatic AI submission;
- publisher-hosted transcript history merely to match team-memory products;
- undisclosed or ambiguous audio capture;
- fabricated speaker identity or subtitle timing;
- automatic external sharing, recipients, or CRM updates; or
- vague claims such as “100% private,” “secure,” or “enterprise ready” without
  a precise data flow and current evidence.

## Release decision

Better CaptionKeep does not need feature parity with every recorder and AI note
taker. It can credibly exceed the direct caption-first set on provenance,
enterprise manageability, reviewed disclosure, and export integrity while
matching the highest-value user experience: reliable three-provider capture,
clear bilingual review, visible capture state, useful local history, and fast
portable output.

The immediate product risk is not that Better CaptionKeep lacks features. It is
that the public listings do not reveal the features already present, Chrome is
behind Edge, translation is not yet a polished bilingual surface, and market
proof is tiny beside the category leaders.
