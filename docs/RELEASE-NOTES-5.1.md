# Better CaptionKeep 5.1

Better CaptionKeep 5.1 extends the local-first meeting record to Zoom Web and introduces a local Evidence Board for turning captured captions into traceable decisions, actions, questions, risks, follow-ups, and important moments.

## Highlights

- Captures displayed subtitle-overlay text from the exact `app.zoom.us` Web client without microphone, video, bot, or RTMS access.
- Keeps Microsoft Teams and Google Meet as first-class supported providers through the shared transcript, history, export, Scrubby, and recovery services.
- Adds a Chrome and Microsoft Edge side-panel Evidence Board that can stay beside the meeting.
- Creates user-directed markers with caption IDs, speaker and timestamp evidence when available, the captured text, and an optional note.
- Reconciles a marker to finalized caption text through the stable source key while retaining the text visible when the user created the marker.
- Copies or saves a local Markdown evidence brief without changing the authoritative raw transcript.
- Positions optional assistant use as Bring Your Own AI (BYOAI): Better CaptionKeep prepares a reviewable local handoff, while the user or organization chooses the approved AI workspace.
- Preserves Privacy Scrubber, managed provider restrictions, reviewed-copy handoffs, local history, Save As, and Intune-ready deployment bundles.

## Privacy and compatibility

Better CaptionKeep does not operate a transcript collection service and does not automatically send transcript or evidence-board content to an AI provider. Evidence markers remain in browser local storage until the user deletes them, and exports occur only through explicit copy or save actions.

Zoom Web currently exposes overlay text without reliable speaker attribution, so those records are labeled `Unknown speaker`. Zoom vanity domains, the native Zoom desktop client, audio/video capture, bots, and RTMS are outside 5.1. Provider interfaces can change without notice, so the October 3–4 release-candidate window includes controlled live testing in Chrome and Edge before any store submission or publication.

## Pro boundary

Pro is not part of 5.1. A future Pro release may add organization-governed AI services and workflow controls. The immutable raw transcript remains authoritative, and any normalization, summary, or AI output must stay a separately recorded derivative.
