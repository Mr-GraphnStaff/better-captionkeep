# Better CaptionKeep 5.0 Security and Privacy Design

## Product boundary

Better CaptionKeep is a Manifest V3 browser extension. It has no developer-operated server, remote analytics, advertising, remote code, microphone access, or video access. It reads displayed caption DOM content from the declared Microsoft Teams, Google Meet, and Zoom Web hosts, plus optional attendee content in Teams.

## Data flow

1. Provider-specific content scripts read captions already rendered by Teams, Google Meet, or Zoom Web.
2. Active transcript recovery checkpoints and the ten-session history remain in `chrome.storage.local`.
3. User preferences remain in `chrome.storage.sync`; temporary aliases remain in `chrome.storage.session`.
4. Exports are staged locally and opened in the extension's save page. The browser or user selects the final location.
5. AI handoff opens an internal review page. Transcript text is never placed in the external provider URL and is never pasted or submitted automatically.
6. Privacy Scrubber creates a distinct cleaned value in memory. It does not overwrite the original saved transcript.

## Permissions

- `storage`: session history, recovery checkpoints, preferences, managed configuration, and temporary handoff/export jobs.
- `downloads`: user-directed TXT and Markdown exports.
- `activeTab`: popup interaction with the active supported meeting tab.
- Host access is limited to `https://teams.microsoft.com/*`, `https://teams.cloud.microsoft/*`, `https://meet.google.com/*`, and `https://app.zoom.us/*`. Zoom vanity subdomains are not granted.

## Scrubby guarantees and limits

The deterministic local engine masks supported email, phone, SSN-format, Luhn-valid payment-card, IP-address, labeled date-of-birth, and labeled medical/member-ID patterns. Profanity filtering is off by default. Custom terms are explicit user or administrator input. Repeated exact values receive stable placeholders inside one cleaning operation.

The engine can produce false positives and false negatives. It does not understand medical context, determine whether data is regulated, inspect attachments, replace enterprise DLP, or prove HIPAA/PCI DSS/GDPR compliance. Unmasked copy requires an extra confirmation on the AI review page.

## Enterprise controls

`managed-schema.json` permits administrators to force privacy/profanity scrubbing, disable AI handoff, restrict provider choices, supply approved ChatGPT/Claude destinations, and supply organization masking terms. Managed values are read-only and override synchronized user preferences. User settings can be exported/imported without transcript history; policy remains controlled by the administrator.

## Threat controls

- No transcript data in provider navigation URLs.
- Provider workspace URLs require HTTPS and an exact official hostname.
- Stored export filenames and folders are normalized before use.
- History writes stage data before changing the index and retain prior sessions after quota failures.
- Recovery checkpoints are restored only for the exact same supported meeting page within four hours and show an incomplete-interval warning.
- Manifest validation and regression tests verify host scope, script presence, policy schema, scrub rules, navigation behavior, recovery, and package contents.

## Residual risks

Teams, Google Meet, and Zoom Web can change their DOM without notice. Zoom Web overlay captions currently lack speaker attribution and are labeled `Unknown speaker`. A browser/PWA suspension can create a transcript gap. Local browser profiles, clipboard history, synced folders, exported files, and provider workspaces are outside the extension's protection boundary. Live testing of supported meeting hosts remains essential after provider UI changes.
