# Better CaptionKeep 5.1

> The enterprise hardening described below is post-5.1.0 source work. It is not part of either immutable 5.1.0 Store artifact and must receive a new reviewed version, live validation, and Store promotion before it is represented as deployed product behavior.

Better CaptionKeep 5.1 extends the local-first meeting record to Zoom Web and introduces a local Evidence Board for turning captured captions into traceable decisions, actions, questions, risks, follow-ups, and important moments.

## Highlights

- Captures displayed subtitle-overlay text from the exact `app.zoom.us` Web client without microphone, video, bot, or RTMS access.
- Keeps Microsoft Teams and Google Meet as first-class supported providers through the shared transcript, history, export, Scrubby, and recovery services.
- Adds a Chrome and Microsoft Edge side-panel Evidence Board that can stay beside the meeting.
- Creates user-directed markers with caption IDs, speaker and timestamp evidence when available, the captured text, and an optional note.
- Searches the captured transcript in a slim two-view workspace and marks any caption without interrupting the meeting.
- Reconciles a marker to finalized caption text through the stable source key while retaining the text visible when the user created the marker.
- Copies or saves a local Markdown evidence brief without changing the authoritative raw transcript.
- Opens a reviewed email draft for an evidence brief; Better CaptionKeep does not choose recipients or send the message.
- Saves a JSON provenance bundle that separates source captions from markers and fingerprints an active transcript with SHA-256.
- Positions optional assistant use as Bring Your Own AI (BYOAI): Better CaptionKeep prepares a reviewable local handoff, while the user or organization chooses the approved AI workspace.
- Preserves Privacy Scrubber, managed provider restrictions, reviewed-copy handoffs, local history, Save As, and Intune-ready deployment bundles.

## Privacy and compatibility

Better CaptionKeep does not operate a transcript collection service and does not automatically send transcript or evidence-board content to an AI provider. Evidence markers remain in browser local storage until the user deletes them, and exports occur only through explicit copy or save actions.

Zoom Web currently exposes overlay text without reliable speaker attribution, so those records are labeled `Unknown speaker`. Zoom vanity domains, the native Zoom desktop client, audio/video capture, bots, and RTMS are outside 5.1. Provider interfaces can change without notice, so the October 3–4 release-candidate window includes controlled live testing in Chrome and Edge before any store submission or publication.

## Post-5.1.0 enterprise hardening candidate

- Adds an editable security architecture with runtime and supply-chain trust-boundary diagrams, STRIDE analysis, a prioritized risk register, and pilot/GA gates.
- Adds an enterprise security review record and a complete Intune/EUC deployment, evidence, operations, and rollback runbook.
- Adds managed controls for scrubbed-only release, clipboard, file export, Evidence Board email, attendee capture, completed-session history, maximum history, and retention days.
- Rechecks managed policy at service-worker, export-page, handoff, viewer, popup, and Evidence Board action boundaries.
- Strengthens the hardened local-only profile with no AI handoff, no clipboard, no Evidence Board email, no attendee capture, scrubbed release, five-session history, and 30-day retention.
- Removes attendee-name lists from normal diagnostic logging.
- Adds dependency auditing to the release gate, CodeQL, full-SHA workflow action pinning, a runtime CycloneDX SBOM, and GitHub artifact attestations.

## Pro boundary

Pro is not part of 5.1. A future Pro release may add organization-governed AI services and workflow controls. The immutable raw transcript remains authoritative, and any normalization, summary, or AI output must stay a separately recorded derivative.
