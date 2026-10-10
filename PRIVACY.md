# Better CaptionKeep Privacy Policy

Effective date: October 4, 2026

Better CaptionKeep, by Señor Farris, is an independent browser extension for capturing, reviewing, and exporting live captions from Microsoft Teams, Google Meet, and the Zoom Web client in supported Chromium browsers. This policy describes the Better CaptionKeep product, including its optional Bring Your Own AI (BYOAI) handoff features.

## Information the extension handles

The extension reads captions already displayed by Microsoft Teams, Google Meet, or Zoom Web, together with available speaker names, meeting titles, and timestamps. The tested Zoom subtitle overlay does not provide a speaker name, so those records are labeled `Unknown speaker`. In Teams, when attendee tracking is enabled, the extension also reads participant names, roles, and observed join/leave information. Meeting text may contain personal or sensitive information depending on what participants say. The extension reads rendered meeting-page content; it does not request or record microphone audio or video.

It also handles user preferences, such as capture settings, export format, filename patterns, save locations, selected AI providers, approved provider workspace URLs, custom masking terms, and temporary speaker aliases. An administrator may supply read-only managed settings through the browser's enterprise-policy system.

When an organization enables Verified Teams Transcript, it supplies its own single-tenant Microsoft Entra tenant ID and application client ID. Those public configuration identifiers are stored only in browser local storage, are not browser-synchronized, and are never sent to the developer. A signed-in organizational user can select the current meeting, choose from up to five recent eligible Teams meetings, or paste a meeting join link before explicitly importing an available official transcript from Microsoft Graph. To populate the recent-meeting choices, the extension requests only basic calendar fields: event subject, start and end time, organizer flag, and Teams join information. Those calendar results are held only while the popup is open and are not added to transcript history, synchronized preferences, exports, or developer logs. Microsoft Entra and Teams administrator policy determine access and whether speaker attribution is available. The feature does not request audio or video and does not automatically collect transcripts across the tenant.

## Storage and use

Meeting information is used to capture and display transcripts, maintain saved sessions, and create exports. Saved transcripts and meeting information are stored in the extension's local browser storage. Temporary speaker aliases use browser session storage. Preferences use the browser's extension sync storage and may be synchronized by the browser provider according to the user's signed-in browser account and sync settings.

Exported files are saved to a location controlled by the user and browser. A selected folder may itself be synchronized or backed up by other software. Copying a transcript places it on the system clipboard, which may be accessible to other applications or clipboard synchronization features.

The extension does not operate a developer-hosted transcript collection service. Its code does not include advertising or analytics reporting to the developer. Routine diagnostic browser-console messages are limited to state, counts, and errors rather than transcript or attendee-list values. Error details can still reveal operational context, so review and redact logs before sharing them.

For Verified Teams Transcript, authentication, basic-calendar discovery, meeting resolution, and transcript requests go directly from the extension to Microsoft identity services and Microsoft Graph. Access and refresh tokens are kept only in browser session storage and are cleared on disconnect, browser-session loss, or a rejected token. They are not placed in synchronized preferences, local transcript history, exports, or developer logs. An imported raw transcript and its provenance are retained as a separate local source artifact with the saved session; deleting that session deletes both. Tenant consent, Microsoft service retention, calendar retention, and the original Teams transcript remain controlled outside Better CaptionKeep.

## Optional BYOAI handoffs

Better CaptionKeep uses a Bring Your Own AI (BYOAI) model. If the user enables AI handoff and selects providers, the extension can open an internal review page after a meeting ends. The page prepares short instructions, a complete local Markdown evidence file, and bounded numbered copy chunks, and shows caption coverage, size, and privacy mode before release. During a meeting, On the Fly can instead copy a bounded cleaned prompt and open the user's saved AI workspace in one click. Better CaptionKeep does not paste or submit the AI prompt. Supported destinations include ChatGPT (OpenAI), Claude and Claude Console (Anthropic), Microsoft Copilot, and Gemini (Google).

If the user explicitly chooses an Email action, Better CaptionKeep places the cleaned subject and body into the compose request for the saved Outlook work or school, Outlook.com personal, Gmail, or browser/default email destination. For webmail, those values are included in the destination compose URL and therefore leave the extension for that mail provider. Recipients remain blank, and Better CaptionKeep does not send the message.

The transcript prompt is not placed in a provider URL and is not automatically pasted or submitted. A temporary local copy is loaded into extension-page memory for review and then removed from extension storage. The user must explicitly copy it and paste or attach it in a provider workspace. Provider terms and privacy policies govern information the user submits there.

AI handoffs are optional. Better CaptionKeep warns users to verify that the opened destination is the organization-approved workspace rather than a personal session. Browser-synchronized preferences may carry an enabled setting to another installation.

## Local Evidence Board

The optional Evidence Board stores user-created markers in browser local storage. A marker contains a snapshot of one captured caption, its speaker and timestamp when available, a stable evidence label, a user-selected category, and an optional user note. Markers do not alter the raw transcript and are not transmitted automatically. The user can delete markers, copy an evidence brief, save it locally as Markdown or provenance JSON, or explicitly open a draft in the saved webmail/default email destination. Better CaptionKeep does not select email recipients or send the message. An active-session provenance export can include the locally captured transcript and its SHA-256 fingerprint, so the user must review the destination before saving or sharing it.

## Privacy Scrubber

Privacy Scrubber performs deterministic pattern matching entirely inside the extension. It can mask common email addresses, phone numbers, valid Social Security number formats, Luhn-valid payment-card numbers, IP addresses, labeled dates of birth, labeled medical or member identifiers, optional profanity, and user-defined terms. It can create cleaned copy/export output and a cleaned AI handoff while retaining the original captured session. One shared scrub context is applied before a handoff is divided into file and copy-chunk presentations so repeated values use consistent placeholders.

Pattern matching can miss sensitive information and can mask harmless text. It is a disclosure-reduction aid, not a data-loss-prevention system, legal determination, or guarantee of HIPAA, PCI DSS, GDPR, or other compliance. Users must review cleaned output before sharing it.

## Sharing and limited use

### Development features: chat, screenshots, translation and templates

User-requested meeting-chat snapshots read only recognized loaded meeting panes and may include sender labels, message text, timestamps and shared links. They are not guaranteed complete chat histories. A manual attachment is labeled separately. Reviewed chat and the most recently approved screenshot are stored as supporting evidence separate from spoken captions. Source archive deletion, configured archive retention and Clear All remove associated retained extras. Extras can also be deleted separately. They are not synchronized or uploaded automatically.

Screenshots capture the visible active supported meeting tab only. The preview is held temporarily in browser session storage until the review page consumes it or the browser closes; a screenshot is retained in local storage only after the user approves it. Screenshots may contain personal information or video-call imagery. Images are not automatically masked. Forced scrubbed-export policy blocks new screenshot retention and hides retained screenshots from the extras review page. This is still-image capture, not audio or video recording.

On-device translation processes the selected captions with a browser-provided Translator model when available. Initial language-pack/model downloads may contact the browser vendor; translation does not automatically fall back to a remote service. Translated text is a potentially inaccurate derivative, not a replacement for the source transcript. It remains in page memory unless the user copies or exports it. Administrator AI/export restrictions remain enforced.

Custom AI task templates retain only the instructions explicitly entered in the template editor in local extension storage, not the generated meeting prompt. Users must not paste secrets or meeting content into reusable instructions. Templates are individually deletable, are not synchronized, and are independent of meeting archive deletion. Print / PDF uses the selected, policy-cleaned derivative and the browser's print dialog; users control any copies created outside extension storage.

Google Drive/Docs and Microsoft OneDrive/SharePoint cloud export transports are under development. This build does not expose a completed end-user sign-in/upload workflow or automatically transfer transcript content to these providers. A future enabled workflow requires separate destination authorization, a reviewed preview and an explicit upload action; transcript-import consent alone does not authorize cloud writes.

The developer does not sell user data, use it for advertising, or use it to determine creditworthiness or for lending. The extension uses meeting data only to provide its meeting-caption capture, review, export, and optional summary functions. Transfers occur through user-directed exports, clipboard actions, browser preference synchronization, and enabled AI handoffs as described above.

The use of user data is limited to providing or improving the extension's single purpose in accordance with applicable browser-extension store policies. This policy does not authorize unrelated use or sale of meeting information.

Better CaptionKeep's use and transfer of user data complies with the Chrome Web Store User Data Policy, including its Limited Use requirements.

## Retention and controls

Completed meetings are archived automatically in local browser storage. Better CaptionKeep requests `unlimitedStorage` so the archive is not constrained by `chrome.storage.local`'s default 10 MB quota and does not silently evict older meetings to make a new save appear successful. This permission does not make storage physically unlimited; browser-profile or device capacity failures remain possible and are surfaced while the recovery snapshot is retained for retry. The archive is not synchronized or uploaded by Better CaptionKeep.

Archive search scans retained completed meetings on demand inside the extension. Search terms, filters, snippets, and results are not sent to a server or stored as a separate index. Recovery checkpoints are excluded. Deleting or expiring a source meeting therefore removes it from subsequent search without leaving a derived searchable copy.

Users can delete individual archived sessions or use Clear All. Administrators can explicitly limit archive count and age or disable the archive through managed browser policy. Short-lived recovery checkpoints remain a separate resilience feature and are removed after the corresponding archive commit succeeds. These controls do not delete exported files, clipboard contents, browser history, synchronized preferences, managed administrator policy, or data the user submitted to AI providers. Manage those copies through the applicable browser, operating-system, storage-service, administrator, or provider controls. Uninstalling the extension removes its local extension storage through the browser; separately manage synchronized settings and copies outside the extension.

## Meeting participation and security

Use the extension in accordance with applicable meeting rules and participant permissions. Enable only the features you need and avoid sending confidential meeting information to third-party services unless authorized. Local storage and exports are not protected by a separate encryption system supplied by this extension; protect your browser profile and device appropriately.

## Contact and changes

For privacy questions, contact the maintainer through [the project's GitHub issues](https://github.com/Mr-GraphnStaff/better-captionkeep/issues). Issues are public: do not include transcripts, personal information, or other sensitive content. Ask for a suitable private contact method if your question requires sharing confidential details.

This policy will be updated when relevant practices change. The effective date above identifies the current version; changes are visible in the repository history.

Better CaptionKeep originated from the MIT-licensed Live-Captions-Saver project by Denis Molodtsov and is now independently developed. It is not affiliated with or endorsed by Microsoft or the AI providers named above. This policy supersedes the inherited privacy statement for Better CaptionKeep.
