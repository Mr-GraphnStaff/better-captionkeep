# Better CaptionKeep Security and Privacy Design

## Product boundary

Better CaptionKeep is a Manifest V3 browser extension. It has no developer-operated server, remote analytics, advertising, remote code, microphone access, or video access. It reads displayed caption DOM content from the declared Microsoft Teams, Google Meet, and Zoom Web hosts, plus optional attendee content in Teams.

## Data flow

1. Provider-specific content scripts read captions already rendered by Teams, Google Meet, or Zoom Web.
2. Active transcript recovery checkpoints and the completed-meeting archive remain in `chrome.storage.local`. The archive does not silently evict older records; managed policy can explicitly set a count limit, apply an age limit, or disable completed-session storage.
3. User preferences remain in `chrome.storage.sync`; temporary aliases remain in `chrome.storage.session`.
4. Exports are staged locally and opened in the extension's save page. The browser or user selects the final location.
5. AI handoff opens an internal review page with coverage-checked local file and copy-chunk options. Transcript text is never placed in the external provider URL and is never attached, pasted, or submitted automatically.
6. Privacy Scrubber creates a distinct cleaned value in memory. It does not overwrite the original saved transcript.
7. The Evidence Board stores user-created caption markers and notes locally. It preserves a source caption ID and never rewrites the raw transcript.
8. Evidence sharing is user-directed: email opens a draft with no recipients, while Markdown and provenance JSON require explicit save actions.
9. When managed Verified Teams Transcript is enabled, recent-meeting discovery reads a bounded basic calendar view and returns at most five already-started Teams meetings. Calendar results remain in popup memory only. An explicit import stores the official raw transcript, normalized captions, and provenance together under the same local deletion and retention controls.
10. Teams already processes meeting media and generates the captions shown to participants. Better CaptionKeep reads displayed captions and keeps its captured copy locally; it does not upload that local copy. When automatic Teams transcription succeeds, Microsoft separately notifies participants and retains an official transcript under the organization’s Microsoft 365 controls. The popup distinguishes these two artifacts and warns when official transcription cannot be verified.

## Permissions

- `storage`: local transcript archive, recovery checkpoints, preferences, managed configuration, and temporary handoff/export jobs.
- `unlimitedStorage`: removes the Storage API's default 10 MB quota for the local archive; it does not upload, synchronize, or guarantee physical device capacity.
- `downloads`: user-directed TXT and Markdown exports.
- `activeTab`: popup interaction with the active supported meeting tab.
- `sidePanel`: the local Evidence Board beside a supported meeting tab.
- `identity`: administrator-enabled interactive Microsoft Entra authorization-code sign-in with PKCE; tokens remain in `chrome.storage.session`.
- Host access is limited to the declared Teams, Google Meet, Zoom Web, Microsoft identity, and Microsoft Graph HTTPS origins. Zoom vanity subdomains and wildcard web access are not granted.
- Delegated Graph access is limited to `Calendars.ReadBasic`, `OnlineMeetings.Read`, and `OnlineMeetingTranscript.Read.All`, plus the `openid`, `profile`, and `offline_access` protocol scopes. There are no Graph application permissions.

## Scrubby guarantees and limits

The deterministic local engine masks supported email, phone, SSN-format, Luhn-valid payment-card, IP-address, labeled date-of-birth, and labeled medical/member-ID patterns. Profanity filtering is off by default. Custom terms are explicit user or administrator input. Repeated exact values receive stable placeholders inside one cleaning operation.

The engine can produce false positives and false negatives. It does not understand medical context, determine whether data is regulated, inspect attachments, replace enterprise DLP, or prove HIPAA/PCI DSS/GDPR compliance. Unmasked copy requires an extra confirmation on the AI review page.

## Enterprise controls

`managed-schema.json` permits administrators to force privacy/profanity scrubbing, require scrubbed release output, disable AI handoff, clipboard, file export, evidence email, attendee capture, or completed-session history, restrict provider choices, set history maximum/retention, supply approved ChatGPT/Claude destinations, and supply organization masking terms. Managed values are read-only and override synchronized user preferences. Protected actions recheck policy at their enforcement boundary rather than relying only on disabled UI controls. User settings can be exported/imported without transcript history; policy remains controlled by the administrator.

## Threat controls

- No transcript data in provider navigation URLs.
- BYOAI remains user-directed: Better CaptionKeep prepares reviewed local material but does not choose, call, or submit to an AI service.
- Evidence markers retain source caption identifiers and remain a separate derivative from the authoritative transcript.
- Provider workspace URLs require HTTPS and an exact official hostname.
- Stored export filenames and folders are normalized before use.
- History writes stage data before changing the index and retain prior sessions after quota failures.
- Recovery checkpoints are restored only for the exact same supported meeting page within four hours and show an incomplete-interval warning.
- Calendar discovery selects only basic fields, excludes future/non-Teams events, returns at most five unique join links, and is never persisted.
- Rejected Graph access clears session authentication and requires a new explicit connection.
- Manifest validation and regression tests verify host scope, script presence, policy schema, scrub rules, navigation behavior, recovery, and package contents.

## Residual risks

Teams, Google Meet, and Zoom Web can change their DOM without notice. Zoom Web overlay captions currently lack speaker attribution and are labeled `Unknown speaker`. A browser/PWA suspension can create a transcript gap. Local browser profiles, clipboard history, synced folders, exported files, and provider workspaces are outside the extension's protection boundary. Live testing of supported meeting hosts remains essential after provider UI changes.
