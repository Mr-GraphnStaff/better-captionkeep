# Meeting Platform Adapter Boundary

Version 4.7 keeps the production runtime Teams-only. Zoom is a feasibility track, not a hidden beta in the release candidate.

A future platform adapter must provide:

- exact host match patterns and least-privilege permissions;
- meeting-presence detection;
- caption-source discovery and change observation;
- normalized caption records (`Name`, `Text`, `Time`, `capturedAt`, stable key);
- explicit source-unavailable and meeting-ended signals;
- a test fixture set and documented DOM assumptions.

Shared services—history, export, themes, Scrubby, AI handoff, configuration, and policy—must not depend on provider DOM selectors. Provider-specific selectors belong only in the adapter.

## Zoom 4.7 decision

No-go for the 4.7 production package. A Zoom web prototype would require new host permissions and live validation against Zoom's current caption DOM and meeting lifecycle. Adding that unverified surface would increase Store review and regression risk. The adapter contract above is the completed 4.7 deliverable; Zoom, Webex, and Google Meet follow in isolated branches after the Teams release.
