# Chrome Web Store Listing — Better CaptionKeep

Public product boundary and security evidence: [Trust Center](docs/TRUST-CENTER.md).

The Store package contains no shared Microsoft Entra tenant or application identity. An organization that enables Verified Teams Transcript supplies its own single-tenant Entra tenant ID and client ID through local setup or managed browser policy. Better CaptionKeep has no paid tier: every shipped feature is available to every user, while organizational policy and provider authorization requirements still apply.

> Last Updated: 2026-10-15

October 16 scope decision: BYOMCP is deferred from the shipping 6.0 release. The package does not request nativeMessaging, ship a native helper, connect MCP services or expose MCP operation controls. Reviewed BYOAI handoff remains available. Earlier helper development evidence is retained for future work and does not describe this package. No published Store listing or submission is changed by this source update.

6.0 development review: the Live Workspace now puts chronological conversation
first, with optional selected-caption actions and explicit Follow latest. Local
Templates, reviewed source-bound Notes/Ask, rolling notes, approved Moment PNG
exports, and optional contrast presets have automated regression coverage. Pause,
leave/rejoin, archive recovery and managed-policy repairs are implemented locally.
These are development changes, not a public Store update or five-browser certification.

6.0 development scope added October 14: reviewed shareable-summary drafts and
explicit confidentiality/privilege handling labels. No automatic legal privilege
determination, automatic email sending or guaranteed removal of privileged
material is claimed. This workflow preserves the original and introduces no
publisher-operated processing. Final screenshots/copy require acceptance review;
do not change the published 5.4 listing on the strength of this development note.
Refresh final product screenshots after acceptance and candidate freeze; artwork
and listing approval remain open. The historical 5.4 publication record below is
unchanged.

6.0 development fix: Teams same-page meeting departure clears the live-capture
badge without discarding captured words. Caption menu controls and DOM-hidden
meeting controls are not evidence of an active meeting. Live Teams retest pending.

> Development package version: **6.0.0** on `codex/6.0`. This is an unpacked
> development line, not a Store submission or release candidate. It introduces
> the dark DAF-TECH operational shell, a single-decision popup, direct platform
> launchers, and the renamed
> Meeting Receipt workspace while retaining the existing local capture and
> evidence engine.

> Frozen package version: **5.4.0**. Azure Store Release run 716 submitted the
> verified package on October 10, 2026. Microsoft Edge Add-ons publicly served
> 5.4.0 later that day. Azure run 726 cancelled Chrome's original pending review
> so the stale Store listing could be replaced. After the corrected DAF-TECH
> listing was saved, run 731 resubmitted the unchanged 5.4.0 package. The public
> Chrome Web Store now serves 5.4.0 with the corrected title and BYOAI summary;
> installed-upgrade and post-upgrade smoke verification remain open.

This is the canonical Chrome Web Store listing and review record. Operational publishing steps remain in `docs/CHROME-PUBLISH-PIPELINE.md`; duplicate listing copy should not be maintained elsewhere.

**A DAF-TECH Product.** The DAF-TECH sphere is the parent-brand mark; Scribble remains the Better CaptionKeep product icon.

## Store Listing

**Extension Name**

Better CaptionKeep — Live Meeting Transcript

**Short Description**

Local Teams, Meet, and Zoom transcripts with source-linked evidence and BYOAI—no bot, account, or AI subscription.

**Detailed Description**

Better CaptionKeep is a private meeting note taker and live transcript tool for Microsoft Teams captions, Google Meet transcription, and Zoom Web transcripts. It turns captions already displayed in the meeting into searchable notes and source-linked evidence. It does not add a meeting bot, record microphone or video, or require a Better CaptionKeep account.

**Bring Your Own AI (BYOAI)**

Use the ChatGPT, Claude, Microsoft Copilot, or Gemini workspace you already have. Better CaptionKeep does not sell a required AI subscription or route meetings through a mandatory DAF-TECH AI service. On the Fly turns selected meeting words into one-click Research, Explain, Reply, or Email outcomes. AI actions copy a bounded prompt and open the user's saved AI workspace; the user still pastes, reviews, and sends. Email opens a prefilled, recipient-free draft in the saved Outlook work or school, Outlook.com personal, Gmail, or browser/default email destination. **Review/edit** remains available when more control is needed. The broader BYOAI framework also accommodates future validated customer-owned hosted assistants and gateways. Version 6.0 claims only the workspace handoff, cited local derivatives, and controls demonstrated in the frozen candidate.

**What you get**

- Live Workspace side panel for Teams, Google Meet, and Zoom Web.
- Explicit controls: nothing enables captions, opens the Teams attendee panel, or requests a Teams transcript until you choose it.
- Local transcript history, interruption recovery, full-text search, speaker aliases, corrections, and a local terminology dictionary.
- Evidence Board markers for decisions, actions, questions, risks, follow-ups, and important moments, each tied to its source-caption ID.
- On the Fly research, explanation, live-reply, and follow-up tasks using your chosen AI workspace.
- Privacy Scrubber, on by default, for supported sensitive patterns before copy, export, or AI handoff.
- TXT, Markdown, DOCX, Print/PDF, evidence-brief Markdown, and provenance JSON exports.
- SRT and WebVTT when an imported official source contains real media cue timing.
- User-reviewed loaded meeting-chat/shared-link snapshots and active-tab screenshots.
- Feature-detected on-device translation with no silent cloud substitute.
- Optional customer-owned Microsoft 365 transcript import through the organization's own single-tenant Entra application.
- Managed browser policy, Intune deployment profiles, local retention controls, and documented release provenance.

**Why it is different**

- No meeting bot.
- No required Better CaptionKeep account or paid feature tier.
- No required DAF-TECH AI subscription or publisher-operated transcript cloud; optional connected BYOAI remains customer-owned.
- No automatic prompt submission, chat posting, connector execution, or fabricated assistant return channel.
- Displayed-caption minimization instead of broad microphone, tab-audio, system-audio, or video recording.
- Source-linked evidence and immutable caption references instead of an untraceable AI summary.
- Customer-controlled Microsoft 365 and AI destinations, with managed policy for organizational deployment.

Live transcript capture starts on for supported meeting pages and can be paused or resumed explicitly without losing already captured text. Teams attendee capture and Microsoft 365 transcription remain separate visible actions. The interface clearly distinguishes the local browser copy from the official tenant-retained transcript. A signed-in organizational user can select the current meeting or choose one of five recent Teams meetings to retrieve an authorized official transcript directly into the standard transcript viewer when their tenant permits the delegated access.

Every feature included in Better CaptionKeep is available to every user. There is no paid tier, subscription, activation, or license key. Organization-managed security settings and Microsoft authorization requirements can still control how features operate in a managed environment.

Capture displayed captions while you meet, review the transcript by speaker, search for what mattered, and export TXT or Markdown files. Local history and recovery checkpoints help protect work when a meeting page changes or the browser interrupts capture.

Version 6.0 introduces the dark sphere interface, a one-button meeting decision, a persistent Transcript/Moments/Live Notes/Evidence/Ask workspace, restart-safe cited Rolling Notes, Capture Moment review, local Meeting Receipts, transcript-bound Q&A, and the advanced All Settings cockpit. The full transcript viewer remains available for live and completed history. Word exports, Print / PDF through the browser dialog, local reusable meeting templates, user-reviewed meeting chat and screenshot attachments, and feature-detected on-device translation remain available. Screenshot and chat attachment workflows do not imply audio/video recording or complete chat-history capture. Better CaptionKeep does not operate a transcript upload service.

Separate quick-start buttons open Teams to Meet now or launch each provider's official new-meeting experience for Zoom and Google Meet. Better CaptionKeep does not create invitations or contact participants.

The local Live Workspace keeps the live transcript and Evidence Board together beside the meeting. It lets you mark decisions, action items, questions, risks, follow-ups, and important moments without changing the source transcript. Evidence briefs retain source-caption references and can be copied, saved, or opened as a user-reviewed email draft with no recipients selected.

Privacy Scrubber is enabled by default and can mask common sensitive patterns before copy, export, an optional AI handoff, or a user-requested email draft. Better CaptionKeep never puts meeting text in an AI-provider URL, pastes into an AI workspace automatically, or submits for the user. When the user explicitly chooses Email, the cleaned draft subject and body are placed in the selected webmail compose URL or default mail-handler request; recipients remain blank and nothing is sent automatically.

On the Fly turns highlighted meeting words or a whole caption into a bounded, source-linked task. Research, Explain, and Reply copy the cleaned prompt and open the user's first saved AI destination in one click; the user pastes, reviews, and sends there. Email opens a recipient-free draft in the saved webmail destination. **Review/edit** opens the complete local prompt and provider chooser for exceptional cases. Results stay in the chosen external workspace; the extension does not claim an automatic assistant return channel.

Better CaptionKeep does not record microphone audio or video, run advertising or analytics, or send transcripts to a developer-operated service. Recent Microsoft 365 calendar choices are transient. Authentication tokens remain in browser session storage. Imported transcripts, source provenance, and live-caption history remain under the user's local deletion and retention controls.

Version 5.4 is preparing broad AI-assisted interface translation previews. Preview languages are labeled as uncertified, retain English fallback, and provide a user-reviewed translation-report form. Opening a report never attaches transcript text, meeting links, participant data, tenant or account identifiers, browser history, or screenshots automatically.

To begin in 6.0, join a supported meeting. Live transcript capture starts by default; pause it in **All Settings → Capture controls** whenever you choose. Open **Live Workspace** to review the transcript and evidence, or recover unavailable meeting captions. In Teams, opening the attendee panel and requesting the official transcript remain separate actions. To use Microsoft 365 import, an organization first creates its own single-tenant Entra app registration and enters its tenant and client IDs; tenant administrator consent may be required.

6.0 artwork is pending regeneration from the final frozen interface. Current images must not be treated as final visual acceptance or uploaded before that review.

Support: https://github.com/Mr-GraphnStaff/better-captionkeep/issues

**Category**

Workflow & Planning

**Single Purpose**

Capture, protect, review, and export meeting transcripts. Better CaptionKeep reads displayed captions from supported Microsoft Teams, Google Meet, and Zoom Web pages and, after customer-owned tenant setup, lets a signed-in organizational user privately import an authorized official Teams transcript from Microsoft 365. Transcript data stays in the user's browser unless the user explicitly exports, copies, or shares it through a reviewed handoff. The extension does not connect to MCP services or execute external tools in version 6.0.

**Primary Language**

English

## Graphics & Assets

| Asset | Dimensions | Status | Filename |
| --- | --- | --- | --- |
| Store Icon | 128×128 PNG | Ready | `teams-captions-saver/icons/sphere-128.png` |
| Screenshot 1 | 1280×800 PNG | Generated; owner review pending | `store-assets/6.0/01-one-button-meeting.png` |
| Screenshot 2 | 1280×800 PNG | Generated; owner review pending | `store-assets/6.0/02-rolling-live-notes.png` |
| Screenshot 3 | 1280×800 PNG | Generated; owner review pending | `store-assets/6.0/03-capture-moment.png` |
| Screenshot 4 | 1280×800 PNG | Generated; owner review pending | `store-assets/6.0/04-meeting-receipt.png` |
| Screenshot 5 | 1280×800 PNG | Generated; owner review pending | `store-assets/6.0/05-advanced-settings.png` |
| Small Promo Tile | 440×280 PNG | Generated; owner review pending | `store-assets/6.0/small-promotional-tile.png` |
| Marquee Promo Tile | 1400×560 PNG | Generated; owner review pending | `store-assets/6.0/marquee-promotional-tile.png` |

All artwork uses synthetic meetings and identities. Never substitute real participant names, meeting links, tenant identifiers, or transcript content.

## Permissions Justification

| Permission | Type | Justification |
| --- | --- | --- |
| `downloads` | permissions | Saves user-requested or user-configured TXT and Markdown transcript exports and opens the browser Downloads folder when requested. It is not used to download remote content. |
| `activeTab` | permissions | Lets the user-invoked popup identify and communicate with the supported meeting tab currently in view. |
| `storage` | permissions | Stores preferences, managed settings, recovery checkpoints, pending exports, temporary aliases, Evidence Board markers, and user-controlled local transcript history. |
| `unlimitedStorage` | permissions | Lets the user-controlled local transcript archive grow beyond the default local-storage quota without silently evicting meetings. Explicit user deletion and managed retention remain authoritative. |
| `sidePanel` | permissions | Displays one unified local Live Workspace for captured captions and source-linked evidence beside the supported meeting page. |
| `identity` | permissions | Opens interactive Microsoft Entra sign-in with PKCE for the customer-configured tenant when the user chooses Connect Microsoft 365. No shared app or client secret is embedded. |
| `https://teams.microsoft.com/*` | host_permissions | Reads captions and optional attendee information rendered during supported Microsoft Teams meetings. |
| `https://teams.cloud.microsoft/*` | host_permissions | Reads captions and optional attendee information rendered in the current Microsoft Teams web application. |
| `https://meet.google.com/*` | host_permissions | Reads captions rendered during Google Meet meetings. |
| `https://app.zoom.us/*` | host_permissions | Reads captions rendered by the Zoom Web subtitle overlay. |
| `https://login.microsoftonline.com/*` | optional_host_permissions | Requested only when the user chooses Connect Microsoft 365; performs interactive organizational Microsoft Entra authorization with PKCE. |
| `https://graph.microsoft.com/*` | optional_host_permissions | Requested only when the user chooses Connect Microsoft 365; shows up to five recent eligible Teams meetings, resolves the selected meeting, and retrieves its authorized official transcript. |

### Microsoft Delegated Scopes

| Scope | Justification |
| --- | --- |
| `openid` | Confirms the identity returned during interactive organizational sign-in. |
| `profile` | Displays the connected Microsoft 365 account label so the user can verify the active account. |
| `offline_access` | Refreshes the delegated browser session without repeated sign-in; the refresh token remains in session storage. |
| `Calendars.ReadBasic` | Reads only basic fields required to show five recent Teams meetings. Results remain in popup memory and are not retained. |
| `OnlineMeetings.Read` | Resolves the one Teams meeting explicitly selected by the user. |
| `OnlineMeetingTranscript.Read.All` | Lists and retrieves an official transcript only after the signed-in user explicitly chooses an authorized meeting. |

## Privacy & Data Use

### Data Collection

**Does the extension handle user data?** Yes. Meeting content is processed locally. Better CaptionKeep has no developer-operated collection service.

| Data Type | Handled? | Transmitted Off-Device? | Purpose | Shared with Third Parties? |
| --- | --- | --- | --- | --- |
| Personally identifiable information | Possible | Only through explicit user export/handoff or direct Microsoft sign-in | Speaker names, optional attendee names, meeting titles, and connected-account label | Only the user-selected destination or Microsoft service; not the developer |
| Health information | Not intentionally classified; may occur inside meeting content | Only through explicit user action | Preserved as part of user-controlled transcript content | Not by Better CaptionKeep automatically |
| Financial information | Not intentionally classified; may occur inside meeting content | Only through explicit user action | Preserved as part of user-controlled transcript content | Not by Better CaptionKeep automatically |
| Authentication information | Yes | Directly exchanged with Microsoft identity services | User-initiated delegated Microsoft 365 connection subject to tenant consent | Microsoft only; not retained by the developer |
| Personal communications | Yes | Only through explicit export/handoff or direct Graph retrieval from Microsoft | Local transcript capture, review, recovery, export, and optional reviewed handoff | Only the user-selected destination; not the developer |
| Location | No | No | Not used | No |
| Web history | No | No | Not used | No |
| User activity | No analytics or behavioral tracking | Small user preferences may synchronize through the browser account | User-selected extension configuration | Browser synchronization service only |
| Website content | Yes | Only through explicit export/handoff | Reads captions, meeting title, and optional attendee details on supported meeting pages | Only the user-selected destination; not the developer |

### Data Use Certification

- [x] Data is NOT sold to third parties.
- [x] Data is NOT used for purposes unrelated to the extension's core functionality.
- [x] Data is NOT used for creditworthiness or lending purposes.
- [x] The extension does not run advertising or analytics.
- [x] The extension does not execute remotely hosted code.

## Privacy Policy

**Privacy Policy URL**

https://github.com/Mr-GraphnStaff/better-captionkeep/blob/master/PRIVACY.md

## Distribution

**Visibility:** Public

**Regions:** Existing Store distribution; confirm the current dashboard selection before submission.

## Developer Info

**Publisher Name:** Señor Farris

**Contact Email:** Use the existing verified Chrome Web Store publisher contact. Confirm it in the dashboard before submission; do not place a private address in repository files.

**Support URL:** https://github.com/Mr-GraphnStaff/better-captionkeep/issues

**Homepage URL:** https://github.com/Mr-GraphnStaff/better-captionkeep

## Version History

| Version | Date | Changes | Status |
| --- | --- | --- | --- |
| 6.0.0 | 2026-10-13 | Introduces the dark DAF-TECH operational shell, one-button meeting entry, direct Teams/Meet/Zoom launchers, ready/not-ready state, and Meeting Receipt workspace over the existing local capture, archive, Evidence Board, export, privacy, and BYOAI capabilities. | Development only on `codex/6.0`; not submitted, certified, or published |
| 5.4.0 | 2026-10-10 | Adds On the Fly BYOAI handoff, explicit meeting-source controls, localization previews, DAF-TECH parent branding, Trust Center, and refreshed Store artwork. | Public in Chrome and Edge; installed-upgrade and post-upgrade functional smoke pending |
| 5.3.3 | 2026-10-07 | Unifies the live transcript and Evidence Board in one side-panel workspace, keeps the expanded viewer intentional, and stops intercepting the standard paste shortcut. | Chrome publicly serves 5.3.3 as of October 8; Edge status requires fresh verification |
| 5.3.2 | 2026-10-04 | Adds visible customer-owned Entra setup, exact tenant validation, managed-policy precedence, optional Microsoft origins, and Store-package regression gates. | Public in Chrome and Edge; installed-upgrade verification remains separate evidence |
| 5.3.1 | 2026-10-04 | Corrected unpacked production identity but shipped an inert Store Graph configuration. | Public in Edge with Microsoft 365 defect; Chrome review cancelled and replaced by the 5.3.2 submission |
| 5.3.0 | 2026-10-03 | Consolidates Verified Teams Transcript, archive/search, corrections, Word export, All settings, Print / PDF, local AI templates, reviewed chat/screenshots, imported-cue SRT/VTT, feature-detected on-device translation, and universal access to every shipped feature. | GitHub release retained for audit, but withdrawn from Store promotion after post-release defects; replacement not yet approved |
| 5.1.0 | 2026-09-25 | Added Zoom Web support, Evidence Board, improved export behavior, and release hardening. | Published |
| 5.0.0 | 2026-09-20 | Established the independent Teams and Google Meet release. | Published |

## Reviewer Test Instructions

1. Install and pin Better CaptionKeep in Chrome.
2. Start or join a Google Meet meeting and enable live captions.
3. Speak a short synthetic phrase and confirm capture activity in the popup.
4. Open the transcript viewer; search, copy, and export the phrase as TXT or Markdown.
5. Open the Evidence Board, mark a caption, and verify its source-linked brief without modifying the transcript.
6. Confirm Privacy Scrubber is enabled by default. In Settings, choose an AI destination and Outlook work or school, Outlook.com personal, Gmail, or the browser/default email app for follow-up drafts.
7. In the live transcript, highlight synthetic caption words. Verify Research, Explain, and Reply copy a bounded cleaned prompt and open the saved AI workspace without pasting or submitting it. Verify Email opens a recipient-free webmail draft, and Review/edit opens the complete local prompt and provider chooser.
8. Microsoft Teams live-caption capture can be tested on either supported Teams web host.
9. For Microsoft 365 testing, use the reviewer's organization-owned single-tenant Entra app registration. Open All Settings, enter its tenant and client IDs under Administrator connection details, save setup, choose Connect Microsoft 365, then select and import an authorized official transcript. Better CaptionKeep embeds neither a shared app identity nor a client secret.

No developer-operated server, paid subscription, microphone recording, video recording, or shared test account is required for the extension itself.

## Review Notes

### Known Issues / Limitations

- Supported meeting sites can change their rendered caption interface. Recovery detects interruptions but cannot guarantee a complete transcript.
- Zoom Web typically does not expose speaker attribution in its caption overlay; Better CaptionKeep labels the source accurately rather than inventing names.
- Verified Teams Transcript depends on Microsoft 365 transcription, delegated permissions, tenant policy, and the signed-in user's authorization.
- Privacy Scrubber reduces accidental disclosure risk but is not a compliance guarantee or enterprise DLP replacement.
- The optional direct-folder feature depends on browser support; Downloads and per-export Save As remain available.
- AI-assisted preview localizations are not professionally certified. English remains the authoritative privacy, security, and administration reference until a locale receives the documented review evidence.

### Submission Gate

- Chrome and Edge live UAT, customer-owned Entra setup, `Calendars.ReadBasic` tenant consent, independent review, and the unchanged 48-hour candidate window are normal release gates. For 5.4.0, the product owner accepted UAT and explicitly authorized an early release; the shortened observation window is recorded as an exception, not a completed gate.
- Upload and publication require explicit release-owner authorization. A successful build does not grant it.

### Submission History

Chrome 5.3.1 was submitted and then cancelled after the Microsoft 365 defect was confirmed. Edge 5.3.1 became public and exposed the defect. Azure run 619 submitted the corrected 5.3.2 package to both existing Store products on October 4, 2026. At 17:25 UTC, Microsoft's public update service served the signed Edge 5.3.2 CRX. Chrome Web Store publicly listed version 5.3.2 as updated October 6, 2026. Installed-upgrade verification remains separate evidence.

Azure Store Release run 716 submitted the immutable 5.4.0 packages on October 10, 2026. Chrome accepted the update for review with state `PENDING_REVIEW`; Microsoft accepted the Edge update for certification after the submission operation returned `Succeeded`. At submission time, public listing and installed-upgrade verification were still open.

After the public Store pages exposed stale version-5-era marketing, Azure Store Release run 726 used Chrome's official `cancelSubmission` operation on October 10, 2026. Its preflight recorded `published=PUBLISHED/5.3.3` and `submitted=PENDING_REVIEW/5.4.0`; Chrome then returned the 5.4.0 submission to draft without uploading or replacing the immutable package. The corrected DAF-TECH listing copy and artwork must be applied in the Chrome Developer Dashboard before the existing draft is resubmitted.

After the product owner saved the corrected description, five screenshots, small promotional tile, and marquee tile, Azure Store Release run 731 reverified and re-uploaded the same immutable 5.4.0 Chrome ZIP, passed the protected Production approval, and submitted the corrected draft for automatic publication after review. On October 12, the official Chrome Web Store listing was verified serving **Version 5.4.0**, **Updated October 11, 2026**, the corrected title **Better CaptionKeep — Live Meeting Transcript**, and the BYOAI summary. Chrome public availability is verified; successful existing-install upgrade and post-upgrade functional smoke testing remain open.

Later on October 10, the public Microsoft Edge Add-ons listing served version 5.4.0. A managed Edge installation received the update but reproduced the Store-generated `_metadata` warning tracked in [Microsoft issue #820](https://github.com/microsoft/MicrosoftEdge-Extensions/issues/820). The immutable submitted ZIP contains no `_metadata` entry. On October 14, the official Edge listing was verified serving the refreshed DAF-TECH description and all five 5.4 screenshots, including the three-platform, explicit-control, On the Fly, BYOAI, and enterprise-control story. Edge public availability and the listing refresh are verified; post-upgrade functional smoke testing remains open.
