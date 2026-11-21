# Chrome Web Store Listing — Better CaptionKeep 6.0.3

Updated November 20, 2026. Current extension and Administrator Setup version: **6.0.3**. Use the approved DAF-TECH sphere artwork and existing company themes. Guided Microsoft 365 setup and Intune deployment are the launch message. Store submission, review and public availability are separate states in [the current release record](docs/RELEASE-6.0.3.md). The [publication decision](docs/release-state/6.0.3-team-release-review-2026-11-20.md) records unfinished acceptance and the known QA identity problem; none is represented as passed.

## Store Listing

**Extension Name**

Better CaptionKeep — Live Meeting Transcript

**Short Description**

Local Teams, Meet and Zoom Web captions, transcripts and evidence. No Better CaptionKeep account required.

**Detailed Description**

Better CaptionKeep is a free DAF-TECH product for keeping displayed Microsoft Teams, Google Meet and Zoom Web captions as searchable local transcripts and source-linked meeting evidence.

Review captured words, mark decisions and actions, and export transcripts. Better CaptionKeep captures displayed captions; it does not record microphone audio or video or add a meeting bot. Local caption capture requires no Better CaptionKeep account or organization setup.

Optional Bring Your Own AI handoff prepares material for your chosen AI workspace. You control what you copy or attach and complete submission yourself. Privacy Scrubber can mask supported sensitive patterns; review material before sharing.

Guided Microsoft 365 setup. Deploy Better CaptionKeep with Intune.

Version 6.0.3 adds an administrator setup entry point in All Settings → Microsoft 365. A compatible installed helper can open from there; otherwise, download and run the signed Windows x64 installer yourself. Downloading does not install or launch it.

For supported commercial Microsoft-cloud organizations, guided setup prepares deployment to Edge, Chrome or both through Intune, with optional organization-owned Microsoft 365 transcript access. It requires appropriate Microsoft licensing, enrolled Windows x64 pilot devices and administrator authority. Review proposed permissions and changes before approving deployment.

Start with a limited pilot. Verify browser installation, employee sign-in and authorized transcript import separately before expanding.

Administrator guide: https://github.com/Mr-GraphnStaff/better-captionkeep/wiki/Administrator-Deployment

## Graphics & Assets

| Asset | Dimensions | Status | Filename |
| --- | --- | --- | --- |
| Store Icon | 128×128 PNG | Ready | `teams-captions-saver/icons/sphere-128.png` |
| Screenshot 1 | 1280×800 PNG | Owner-approved October 24; manifest hash-bound | `store-assets/6.0/01-one-button-meeting.png` |
| Screenshot 2 | 1280×800 PNG | Owner-approved October 24; manifest hash-bound | `store-assets/6.0/02-rolling-live-notes.png` |
| Screenshot 3 | 1280×800 PNG | Owner-approved October 24; manifest hash-bound | `store-assets/6.0/03-capture-moment.png` |
| Screenshot 4 | 1280×800 PNG | Owner-approved October 24; manifest hash-bound | `store-assets/6.0/04-meeting-receipt.png` |
| Screenshot 5 | 1280×800 PNG | Owner-approved October 24; manifest hash-bound | `store-assets/6.0/05-advanced-settings.png` |
| Small Promo Tile | 440×280 PNG | Owner-approved October 24; manifest hash-bound | `store-assets/6.0/small-promotional-tile.png` |
| Marquee Promo Tile | 1400×560 PNG | Owner-approved October 24; manifest hash-bound | `store-assets/6.0/marquee-promotional-tile.png` |

All artwork uses synthetic meetings and identities. Never substitute real participant names, meeting links, tenant identifiers, or transcript content.

## Permissions Justification

**Single-purpose declaration**

Capture, protect, review, and export meeting transcripts. Better CaptionKeep reads displayed captions from supported Microsoft Teams, Google Meet, and Zoom Web pages and, after customer-owned tenant setup, lets a signed-in organizational user privately import an authorized official Teams transcript from Microsoft 365. Transcript data stays in the user's browser unless the user explicitly exports, copies, or shares it through a reviewed handoff. The extension does not connect to MCP services or execute external tools in version 6.0.

| Permission | Type | Justification |
| --- | --- | --- |
| `downloads` | permissions | Saves user-requested or user-configured TXT and Markdown transcript exports, opens the browser Downloads folder when requested, and downloads the signed Windows Administrator Setup installer from the versioned Better CaptionKeep GitHub release only when an administrator explicitly chooses Download and install. The extension does not execute the downloaded installer. |
| `activeTab` | permissions | Lets the user-invoked popup identify and communicate with the supported meeting tab currently in view. |
| `storage` | permissions | Stores preferences, managed settings, recovery checkpoints, pending exports, temporary aliases, Evidence Board markers, and user-controlled local transcript history. |
| `unlimitedStorage` | permissions | Lets the user-controlled local transcript archive grow beyond the default local-storage quota without silently evicting meetings. Explicit user deletion and managed retention remain authoritative. |
| `sidePanel` | permissions | Displays one unified local Live Workspace for captured captions and source-linked evidence beside the supported meeting page. |
| `identity` | permissions | Opens interactive Microsoft Entra sign-in with PKCE for the customer-configured tenant when the user chooses Connect Microsoft 365. No shared app or client secret is embedded. |
| `https://teams.microsoft.com/*` | host_permissions | Reads captions and optional attendee information rendered during supported Microsoft Teams meetings. |
| `https://teams.cloud.microsoft/*` | host_permissions | Reads captions and optional attendee information rendered in the current Microsoft Teams web application. |
| `https://meet.google.com/*` | host_permissions | Reads captions rendered during Google Meet meetings. |
| `https://app.zoom.us/*` | host_permissions | Reads captions rendered by the Zoom Web subtitle overlay. |
| `nativeMessaging` | optional_permissions | Requested only when a tenant administrator explicitly opens organization setup. Launches the separately installed, signed Better CaptionKeep Administrator Setup through one fixed native host; it does not enable MCP, access arbitrary native applications, or affect local caption capture. |
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
| 6.0.3 | 2026-11-20 | Adds the guided Microsoft 365 / Intune organization setup entry point, repairs connector/capture failures, and enforces export restrictions when organization settings cannot be read. | Team-reviewed correction candidate; hosted qualification passed and exact package identities verified. Owner-authorized submission remains pending; Store approval/public availability are separate. |
| 6.0.0 | 2026-10-13 | Introduces the dark DAF-TECH operational shell, one-button meeting entry, direct Teams/Meet/Zoom launchers, ready/not-ready state, and Meeting Receipt workspace over the existing local capture, archive, Evidence Board, export, privacy, and BYOAI capabilities. | Historical public baseline; owner confirmed both Stores October 25; Chrome listing rechecked November 16 |
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
4. Choose **Open Live Workspace**, then **Full transcript**; search, copy, and export the phrase as TXT or Markdown.
5. Open the Evidence Board, mark a caption, and verify its source-linked brief without modifying the transcript.
6. Confirm Privacy Scrubber is enabled by default. In Settings, choose an AI destination and Outlook work or school, Outlook.com personal, Gmail, or the browser/default email app for follow-up drafts.
7. In the live transcript, highlight synthetic caption words. Verify Research, Explain, and Reply copy a bounded cleaned prompt and open the saved AI workspace without pasting or submitting it. Verify Email opens a recipient-free webmail draft, and Review/edit opens the complete local prompt and provider chooser.
8. Microsoft Teams live-caption capture can be tested on either supported Teams web host.
9. Microsoft 365 import is optional. In an authorized test organization, review the guided administrator setup route in All Settings → Microsoft 365 and its licensing/permission prerequisites. Download and run the signed installer once if needed; inspect proposed changes before any approval. Manual organization-owned tenant/client IDs remain an alternative. Test an authorized transcript import only when that setup is complete.

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
- For 6.0, David Farris authorized publication on October 24 with documented owner exceptions for incomplete exact-package browser/provider, full-scope/accessibility/failure acceptance and the 48-hour unchanged window. Preserve the missing checks as missing, not passed; bind the reviewed exception to exact source/package hashes and approved targets. Hash/provenance, permission-delta, secret-handling and Production-only artifact checks still apply. Store review, public parity and delivered-upgrade verification remain rollout outcomes to observe.

### Submission History — historical 5.x records

These dated records describe earlier releases. They are not current 6.0.3 submission instructions.

Chrome 5.3.1 was submitted and then cancelled after the Microsoft 365 defect was confirmed. Edge 5.3.1 became public and exposed the defect. Azure run 619 submitted the corrected 5.3.2 package to both existing Store products on October 4, 2026. At 17:25 UTC, Microsoft's public update service served the signed Edge 5.3.2 CRX. Chrome Web Store publicly listed version 5.3.2 as updated October 6, 2026. Installed-upgrade verification remains separate evidence.

Azure Store Release run 716 submitted the immutable 5.4.0 packages on October 10, 2026. Chrome accepted the update for review with state `PENDING_REVIEW`; Microsoft accepted the Edge update for certification after the submission operation returned `Succeeded`. At submission time, public listing and installed-upgrade verification were still open.

After the public Store pages exposed stale version-5-era marketing, Azure Store Release run 726 used Chrome's official `cancelSubmission` operation on October 10, 2026. Its preflight recorded `published=PUBLISHED/5.3.3` and `submitted=PENDING_REVIEW/5.4.0`; Chrome then returned the 5.4.0 submission to draft without uploading or replacing the immutable package. The corrected DAF-TECH listing copy and artwork must be applied in the Chrome Developer Dashboard before the existing draft is resubmitted.

After the product owner saved the corrected description, five screenshots, small promotional tile, and marquee tile, Azure Store Release run 731 reverified and re-uploaded the same immutable 5.4.0 Chrome ZIP, passed the protected Production approval, and submitted the corrected draft for automatic publication after review. On October 12, the official Chrome Web Store listing was verified serving **Version 5.4.0**, **Updated October 11, 2026**, the corrected title **Better CaptionKeep — Live Meeting Transcript**, and the BYOAI summary. Chrome public availability is verified; successful existing-install upgrade and post-upgrade functional smoke testing remain open.

Later on October 10, the public Microsoft Edge Add-ons listing served version 5.4.0. A managed Edge installation received the update but reproduced the Store-generated `_metadata` warning tracked in [Microsoft issue #820](https://github.com/microsoft/MicrosoftEdge-Extensions/issues/820). The immutable submitted ZIP contains no `_metadata` entry. On October 14, the official Edge listing was verified serving the refreshed DAF-TECH description and all five 5.4 screenshots, including the three-platform, explicit-control, On the Fly, BYOAI, and enterprise-control story. Edge public availability and the listing refresh are verified; post-upgrade functional smoke testing remains open.
