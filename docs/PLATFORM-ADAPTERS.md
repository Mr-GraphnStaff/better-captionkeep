# Meeting Platform Adapter Boundary

Version 5.0 introduces a provider boundary so Microsoft Teams, Google Meet, and later meeting platforms can share the same transcript services without sharing fragile DOM assumptions. Google Meet is the first new capture target. Microsoft Teams remains the working baseline while its current capture logic is moved behind this boundary.

## Provider definition

Each provider registers a small definition with `CaptionKeepProviderRegistry.register`:

- `id`: stable lowercase identifier such as `teams` or `google-meet`;
- `matches(url)`: returns whether the provider owns the current meeting page;
- `create(context)`: creates an isolated runtime adapter for that page.

The registry rejects duplicate or malformed providers. It loads before configuration and provider content scripts, but it does not contain provider selectors or request additional host permissions.

## Runtime adapter

An adapter must expose:

- `start(emit)`: begin meeting-presence detection, caption-source discovery, and observation;
- `stop()`: disconnect observers and timers without losing already captured transcript data.

Provider adapters emit lifecycle events to the provider-neutral `CaptionKeepCaptureCoordinator`. Caption events use normalized records containing `Name`, `Text`, `Time`, `capturedAt`, and a stable `key`. The registry validates these records before the coordinator checkpoints them and exposes them to shared services.

Adapters must also make source-unavailable, source-restored, page-reload, and meeting-ended behavior explicit. Provider-specific selectors and DOM interpretation belong only in the provider adapter.

The coordinator stores a provider-scoped recovery checkpoint after caption updates and source loss. It restores only a recent checkpoint from the same origin and meeting pathname, preserves the warning that a reload interval may be incomplete, and commits session history once when the adapter reports that the meeting ended. Query strings are deliberately excluded from the meeting identity so switching Google accounts on the same meeting URL does not discard the local transcript.

## Shared-service boundary

History, export, themes, Scrubby, AI handoff, configuration, and enterprise policy must not depend on provider DOM selectors. A mandatory backend is not part of the capture contract; local-first capture remains the product baseline and any future enterprise gateway stays optional.

`transcriptInsights.js` is the first provider-neutral feature module. Teams and Google Meet pass normalized transcript records to the same evidence-summary feature when a meeting ends. The feature assigns stable handoff-only caption IDs, requires claims to cite those IDs, honors managed AI policy, and stages text in the existing local review screen rather than sending transcript content to a provider. Future features such as bookmarks, topic chapters, decision ledgers, and follow-up tracking should consume normalized records through this boundary instead of reading meeting DOM.

Capture health is also provider-neutral at the popup contract: content scripts return `captionCount`, `captureState`, `checkpointError`, and `lastCaptionAt`. Provider adapters remain responsible for deciding whether their caption source is available; shared UI owns the human-readable health message.

## Google Meet implementation gate

Do not invent selectors from third-party examples or documentation. The Google Meet adapter requires sanitized fixtures derived from the live browser surface, followed by Chrome and Edge UAT.

The first live probe confirmed an exact `https://meet.google.com/*` scope and a semantic caption source at `[role="region"][aria-label="Captions"]`. The empty-state structure is recorded in `tests/fixtures/google-meet/captions-empty.json` without account, meeting-link, or transcript content. A controlled live probe on September 15, 2026 confirmed that a caption is a direct source child with a speaker block (image plus label) followed by a caption-text block. That sanitized boundary is recorded in `tests/fixtures/google-meet/captions-speaker-row.json`; account, meeting-code, speaker, caption, class, style, and identifying attribute values were discarded.

For the controlled speaker-row probe, the Google Meet content script accepts the internal `get_google_meet_diagnostic` message. Its response preserves element order, tag names, safe ARIA role/state values, and attribute names while discarding all text, class names, styles, meeting identifiers, and attribute values that could identify a participant. Capture this diagnostic only in a controlled test meeting and review it before committing it as a fixture.

## Zoom Web implementation gate

The September 21, 2026 controlled probe confirmed the exact `https://app.zoom.us/*` host and `/wc/{numeric-meeting-id}/join` meeting-path shape. The meeting application is embedded in a child frame, so the isolated Zoom content-script lane runs in matching frames and suppresses the top-frame duplicate.

The initial source is the subtitle overlay at `#live-transcription-subtitle`. Its direct caption child is a `SPAN` containing evolving text. The observed overlay did not expose speaker attribution; normalized records therefore use `Unknown speaker` and documentation must not imply otherwise. Hiding captions removes the source; showing captions remounts it with the latest text. The adapter treats this as recoverable and preserves prior records.

The sanitized boundary is recorded in `tests/fixtures/zoom/captions-overlay.json`. The internal `get_zoom_diagnostic` response follows the same privacy discipline as the Meet probe. Zoom vanity domains, native desktop meetings, a full transcript side panel, and audio/video capture are outside the initial boundary.
