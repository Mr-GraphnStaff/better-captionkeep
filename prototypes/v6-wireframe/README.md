# Better CaptionKeep 6.0 working wireframe

This buildless working model explores the proposed 6.0 visual system and primary Meeting Receipt journey without changing the production extension.

The visual system is derived from the DAF-TECH sphere: deep black-green glass, teal mineral lines, silver highlights, and an elongated orb silhouette around the operational panel. The sphere is treated as a structural theme rather than a decorative badge; conventional high-contrast content remains inside the shell for readability and accessibility.

The ready-state focal mark preserves the master DAF-TECH sphere underneath a deterministic interface treatment: its equatorial wordmark band is covered by the live green `READY` state without modifying the source brand asset.

## Included interactions

- Start a meeting record from the simplified popup.
- Inspect live capture health.
- Mark a source caption.
- Finish the meeting and open its Meeting Receipt.
- Follow proposed decisions and commitments back to their source.
- Confirm or dismiss proposed items.
- Inspect capture limitations.
- Preview the simplified Share menu and full-page Settings structure.
- Switch the browser label across the six proposed certified desktop browsers.
- Start in the DAF-TECH dark theme and toggle to the accessible light alternative.
- Switch the prototype between green `READY` and red `NOT READY`; the unavailable state also changes the provider explanation and disables capture.

## Working product modules

The model runs the existing product's evidence-marker, privacy-scrubbing, reviewed AI-handoff, export-profile, and provenance logic directly in the browser. It adds a small `localStorage` session adapter so the complete simulated journey can be used without extension permissions:

- Begin a local meeting session and add simulated provider captions.
- Select a caption and create a source-linked marker.
- Finish into a persistent Meeting Receipt with captured source and review state.
- Confirm or dismiss proposed commitments before marking review complete.
- Preserve the original source transcript while applying reviewed speaker-name corrections to a derivative.
- Preview masked text and a complete citation-bearing BYOAI handoff package.
- Prepare TXT, Markdown, DOCX, and provenance JSON exports locally.
- Reopen completed receipts from local history.

## Run locally

Serve the repository with a static HTTP server and open `prototypes/v6-wireframe/` in a browser. The prototype uses only HTML, CSS, JavaScript, and an existing Better CaptionKeep icon.

This remains a browser-local working model. It uses simulated captions, does not connect to a live meeting DOM or browser-extension APIs, and does not claim completed 6.0 functionality or six-browser certification.
