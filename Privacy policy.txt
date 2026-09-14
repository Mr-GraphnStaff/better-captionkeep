# Better CaptionKeep Privacy Policy

Effective date: September 12, 2026

Better CaptionKeep, by Señor Farris, is an independent Microsoft Edge extension for capturing, reviewing, and exporting live captions from Microsoft Teams. This policy describes the Better CaptionKeep fork, including its optional AI handoff features.

## Information the extension handles

The extension reads displayed Teams captions, speaker names, meeting titles, and timestamps. When attendee tracking is enabled, it also reads participant names, roles, and observed join/leave information. Meeting text may contain personal or sensitive information depending on what participants say. The extension reads captions from the Teams page; it does not record microphone audio or video.

It also handles user preferences, such as capture settings, export format, filename patterns, save locations, selected AI providers, approved provider workspace URLs, custom masking terms, and temporary speaker aliases. An administrator may supply read-only managed settings through the browser's enterprise-policy system.

## Storage and use

Meeting information is used to capture and display transcripts, maintain saved sessions, and create exports. Saved transcripts and meeting information are stored in the extension's local browser storage. Temporary speaker aliases use browser session storage. Preferences use the browser's extension sync storage and may be synchronized by Microsoft according to the user's Edge account and sync settings.

Exported files are saved to a location controlled by the user and browser. A selected folder may itself be synchronized or backed up by other software. Copying a transcript places it on the system clipboard, which may be accessible to other applications or clipboard synchronization features.

The extension does not operate a developer-hosted transcript collection service. Its code does not include advertising or analytics reporting to the developer. Diagnostic browser-console messages may contain meeting titles or participant details; review and redact logs before sharing them.

## Optional AI handoffs

If the user enables AI handoff and selects providers, the extension opens an internal review page after a meeting ends. Supported destinations include ChatGPT (OpenAI), Claude and Claude Console (Anthropic), Microsoft Copilot, and Gemini (Google).

The transcript prompt is not placed in a provider URL and is not automatically pasted or submitted. A temporary local copy is loaded into extension-page memory for review and then removed from extension storage. The user must explicitly copy it and paste or attach it in a provider workspace. Provider terms and privacy policies govern information the user submits there.

AI handoffs are optional. Better CaptionKeep warns users to verify that the opened destination is the organization-approved workspace rather than a personal session. Browser-synchronized preferences may carry an enabled setting to another installation.

## Privacy Scrubber

Privacy Scrubber performs deterministic pattern matching entirely inside the extension. It can mask common email addresses, phone numbers, valid Social Security number formats, Luhn-valid payment-card numbers, IP addresses, labeled dates of birth, labeled medical or member identifiers, optional profanity, and user-defined terms. It can create cleaned copy/export output and a cleaned AI-handoff prompt while retaining the original captured session.

Pattern matching can miss sensitive information and can mask harmless text. It is a disclosure-reduction aid, not a data-loss-prevention system, legal determination, or guarantee of HIPAA, PCI DSS, GDPR, or other compliance. Users must review cleaned output before sharing it.

## Sharing and limited use

The developer does not sell user data, use it for advertising, or use it to determine creditworthiness or for lending. The extension uses meeting data only to provide its meeting-caption capture, review, export, and optional summary functions. Transfers occur through user-directed exports, clipboard actions, browser preference synchronization, and enabled AI handoffs as described above.

The use of user data is limited to providing or improving the extension's single purpose in accordance with the Microsoft Edge Add-ons Developer Policies. This policy does not authorize unrelated use or sale of meeting information.

## Retention and controls

Saved-session history is managed in local browser storage. The current implementation limits session history to ten sessions and may remove older sessions when limits are reached. This limit does not mean all temporary or recovery data is immediately removed.

Users can delete individual saved sessions or use Clear All in session history. These controls do not delete exported files, clipboard contents, browser history, synchronized preferences, managed administrator policy, or data the user submitted to AI providers. Manage those copies through the applicable browser, operating-system, storage-service, administrator, or provider controls. Uninstalling the extension removes its local extension storage through the browser; separately manage synchronized settings and copies outside the extension.

## Meeting participation and security

Use the extension in accordance with applicable meeting rules and participant permissions. Enable only the features you need and avoid sending confidential meeting information to third-party services unless authorized. Local storage and exports are not protected by a separate encryption system supplied by this extension; protect your browser profile and device appropriately.

## Contact and changes

For privacy questions, contact the maintainer through [the project's GitHub issues](https://github.com/Mr-GraphnStaff/better-captionkeep/issues). Issues are public: do not include transcripts, personal information, or other sensitive content. Ask for a suitable private contact method if your question requires sharing confidential details.

This policy will be updated when relevant practices change. The effective date above identifies the current version; changes are visible in the repository history.

Better CaptionKeep is an independent fork of Live-Captions-Saver by Denis Molodtsov. It is not affiliated with or endorsed by Microsoft or the AI providers named above. This policy supersedes the inherited privacy statement for the Better CaptionKeep fork.
