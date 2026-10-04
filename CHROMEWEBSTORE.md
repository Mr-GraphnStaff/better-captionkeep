# Chrome Web Store Listing — Better CaptionKeep

The Store package contains no shared Microsoft Entra tenant or application identity. An organization that enables Verified Teams Transcript supplies its own single-tenant Entra tenant ID and client ID through local setup or managed browser policy. Better CaptionKeep has no paid tier: every shipped feature is available to every user, while organizational policy and provider authorization requirements still apply.

> Last Updated: 2026-10-04

This is the canonical Chrome Web Store listing and review record. Operational publishing steps remain in `docs/CHROME-PUBLISH-PIPELINE.md`; duplicate listing copy should not be maintained elsewhere.

## Store Listing

**Extension Name**

Better CaptionKeep

**Short Description**

Capture live captions and privately import verified Microsoft Teams transcripts for local review and export.

**Detailed Description**

Better CaptionKeep preserves meeting captions from Microsoft Teams, Google Meet, and Zoom Web as a private, readable transcript. In Teams, it can request captions, the participant roster, and Microsoft 365 transcription while clearly distinguishing the local browser copy from the official tenant-retained transcript. A signed-in organizational user can select the current meeting or choose one of five recent Teams meetings to retrieve an authorized official transcript directly into the standard transcript viewer when their tenant permits the delegated access.

Every feature included in Better CaptionKeep is available to every user. There is no paid tier, subscription, activation, or license key. Organization-managed security settings and Microsoft authorization requirements can still control how features operate in a managed environment.

Capture displayed captions while you meet, review the transcript by speaker, search for what mattered, and export TXT or Markdown files. Local history and recovery checkpoints help protect work when a meeting page changes or the browser interrupts capture.

Version 5.3.2 corrects the Store Microsoft 365 configuration defect found after Edge 5.3.1 became public. It also includes the 5.3 All Settings tab, Word exports, Print / PDF through the browser dialog, local reusable AI task templates, user-reviewed meeting chat and screenshot attachments, and on-device transcript translation where supported. Screenshot and chat attachment workflows do not imply audio/video recording or complete chat-history capture. Better CaptionKeep does not operate a transcript upload service.

Separate quick-start buttons open Teams to Meet now or launch each provider's official new-meeting experience for Zoom and Google Meet. Better CaptionKeep does not create invitations or contact participants.

The local Evidence Board lets you mark decisions, action items, questions, risks, follow-ups, and important moments without changing the source transcript. Evidence briefs retain source-caption references and can be copied, saved, or opened as a user-reviewed email draft with no recipients selected.

Privacy Scrubber is enabled by default and can mask common sensitive patterns before copy, export, or an optional AI handoff. AI handoff is review-first: Better CaptionKeep prepares an editable prompt inside the extension and never puts transcript text in a provider URL, pastes it automatically, or submits it for the user.

Better CaptionKeep does not record microphone audio or video, run advertising or analytics, or send transcripts to a developer-operated service. Recent Microsoft 365 calendar choices are transient. Authentication tokens remain in browser session storage. Imported transcripts, source provenance, and live-caption history remain under the user's local deletion and retention controls.

To begin, open a supported meeting, turn on captions, and open Better CaptionKeep. Use the popup for settings, history, and exports, or open the Evidence Board beside the meeting. To use Microsoft 365 import, an organization first creates its own single-tenant Entra app registration and enters its tenant and client IDs; tenant administrator consent may be required.

Support: https://github.com/Mr-GraphnStaff/better-captionkeep/issues

**Category**

Productivity

**Single Purpose**

Capture, protect, review, and export meeting transcripts. Better CaptionKeep reads displayed captions from supported Microsoft Teams, Google Meet, and Zoom Web pages and, after customer-owned tenant setup, lets a signed-in organizational user privately import an authorized official Teams transcript from Microsoft 365. Transcript data stays in the user's browser unless the user explicitly exports or copies it.

**Primary Language**

English

## Graphics & Assets

| Asset | Dimensions | Status | Filename |
| --- | --- | --- | --- |
| Store Icon | 128×128 PNG | Ready | `teams-captions-saver/icons/scribble-128.png` |
| Screenshot 1 | 1280×800 PNG | Ready | `store-assets/5.3/01-verified-teams-transcript.png` |
| Screenshot 2 | 1280×800 PNG | Ready | `store-assets/5.3/02-local-evidence-board.png` |
| Screenshot 3 | 1280×800 PNG | Ready | `store-assets/5.3/03-private-review-and-export.png` |
| Screenshot 4 | 1280×800 PNG | Ready | `store-assets/5.3/04-three-meeting-platforms.png` |
| Screenshot 5 | 1280×800 PNG | Ready | `store-assets/5.3/05-enterprise-controls.png` |
| Small Promo Tile | 440×280 PNG | Ready | `store-assets/5.3/small-promotional-tile.png` |
| Marquee Promo Tile | 1400×560 PNG | Ready | `store-assets/5.3/large-promotional-tile.png` |

All artwork uses synthetic meetings and identities. Never substitute real participant names, meeting links, tenant identifiers, or transcript content.

## Permissions Justification

| Permission | Type | Justification |
| --- | --- | --- |
| `downloads` | permissions | Saves user-requested or user-configured TXT and Markdown transcript exports and opens the browser Downloads folder when requested. It is not used to download remote content. |
| `activeTab` | permissions | Lets the user-invoked popup identify and communicate with the supported meeting tab currently in view. |
| `storage` | permissions | Stores preferences, managed settings, recovery checkpoints, pending exports, temporary aliases, Evidence Board markers, and user-controlled local transcript history. |
| `unlimitedStorage` | permissions | Lets the user-controlled local transcript archive grow beyond the default local-storage quota without silently evicting meetings. Explicit user deletion and managed retention remain authoritative. |
| `sidePanel` | permissions | Displays the local live transcript and Evidence Board beside the supported meeting page. |
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
| Personally identifiable information | Possible | Only through explicit user export/handoff or direct Microsoft sign-in | Speaker names, optional attendee names, meeting titles, and connected-account label | Not by Better CaptionKeep automatically |
| Health information | Not intentionally classified; may occur inside meeting content | Only through explicit user action | Preserved as part of user-controlled transcript content | Not by Better CaptionKeep automatically |
| Financial information | Not intentionally classified; may occur inside meeting content | Only through explicit user action | Preserved as part of user-controlled transcript content | Not by Better CaptionKeep automatically |
| Authentication information | Yes | Directly exchanged with Microsoft identity services | User-initiated delegated Microsoft 365 connection subject to tenant consent | Microsoft only; not retained by the developer |
| Personal communications | Yes | Only through explicit export/handoff, or direct Graph retrieval from Microsoft | Local transcript capture, review, recovery, and export | Not by Better CaptionKeep automatically |
| Location | No | No | Not used | No |
| Web history | No | No | Not used | No |
| User activity | No analytics or behavioral tracking | Small user preferences may synchronize through the browser account | User-selected extension configuration | Browser synchronization service only |
| Website content | Yes | Only through explicit export/handoff | Reads captions, meeting title, and optional attendee details on supported meeting pages | Not by Better CaptionKeep automatically |

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
| 5.3.2 | 2026-10-04 | Adds visible customer-owned Entra setup, exact tenant validation, managed-policy precedence, optional Microsoft origins, and Store-package regression gates. | Chrome `PENDING_REVIEW`; Edge accepted for certification through Azure run 619; not yet public |
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
6. Confirm Privacy Scrubber is enabled by default. Optional AI handoff must stop on the internal review page until the reviewer explicitly copies text.
7. Microsoft Teams live-caption capture can be tested on either supported Teams web host.
8. For Microsoft 365 testing, use the reviewer's organization-owned single-tenant Entra app registration. Enter its tenant and client IDs under Administrator connection details, save setup, choose Connect Microsoft 365, then select and import an authorized official transcript. Better CaptionKeep embeds neither a shared app identity nor a client secret.

No developer-operated server, paid subscription, microphone recording, video recording, or shared test account is required for the extension itself.

## Review Notes

### Known Issues / Limitations

- Supported meeting sites can change their rendered caption interface. Recovery detects interruptions but cannot guarantee a complete transcript.
- Zoom Web typically does not expose speaker attribution in its caption overlay; Better CaptionKeep labels the source accurately rather than inventing names.
- Verified Teams Transcript depends on Microsoft 365 transcription, delegated permissions, tenant policy, and the signed-in user's authorization.
- Privacy Scrubber reduces accidental disclosure risk but is not a compliance guarantee or enterprise DLP replacement.
- The optional direct-folder feature depends on browser support; Downloads and per-export Save As remain available.

### Submission Gate

- Chrome and Edge live UAT, customer-owned Entra setup, `Calendars.ReadBasic` tenant consent, independent review, and the unchanged 48-hour candidate window remain mandatory.
- Upload and publication require explicit release-owner authorization. A successful build does not grant it.

### Submission History

Chrome 5.3.1 was submitted and then cancelled after the Microsoft 365 defect was confirmed. Edge 5.3.1 became public and exposed the defect. Azure run 619 submitted the corrected 5.3.2 package to both existing Store products on October 4, 2026. Chrome reports `PENDING_REVIEW`; Microsoft accepted Edge 5.3.2 for certification. Neither status is a claim of public availability.
