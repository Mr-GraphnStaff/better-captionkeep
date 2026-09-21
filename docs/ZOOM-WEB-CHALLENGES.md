# Zoom Web transcript capture: evidence and remaining challenges

Scope note: this work captures displayed caption text only, using the same local-first boundary as Teams and Google Meet. It does not capture microphone audio, video, meeting media streams, or the native Zoom desktop client.

## Controlled live-probe result (September 21, 2026)

- The canonical Web meeting route is `https://app.zoom.us/wc/{numeric-meeting-id}/join`. Meeting secrets and query tokens are excluded from fixtures and recovery identity.
- Zoom embeds the meeting application in a child frame on the same `app.zoom.us` host. The Zoom content-script lane therefore runs in all matching frames, while the top-frame instance exits when it detects the embedded client.
- Enabling captions mounts a real DOM source at `#live-transcription-subtitle`.
- The observed overlay contains a non-speaker marker followed by a `SPAN` containing evolving caption text. It does not expose a participant name, so the initial adapter records `Unknown speaker` rather than inventing attribution.
- Hiding captions removes the source node while leaving the meeting active. Showing captions remounts it and restores the most recent text. The adapter treats this as recoverable source loss and reuses a record only when the same text remounts within a bounded interval.
- No visible full-transcript panel was available in the controlled test. Side-panel capture remains a separate discovery item.

The sanitized fixture is `tests/fixtures/zoom/captions-overlay.json`. It contains structure and lifecycle facts only—no meeting ID, password/token, account identity, participant name, spoken text, generated classes, or style values.

## 1. Initial host scope is intentionally narrow

The tested Web client lives at `app.zoom.us/wc/...`, while ordinary `zoom.us/j/...` links first present the desktop-app handoff. Business accounts may use vanity subdomains for SSO or branding, but no vanity-host meeting surface was part of the controlled probe.

A broad `*://*.zoom.us/*` grant conflicts with the project's minimal-permission stance. The initial implementation therefore uses only `https://app.zoom.us/*`. Vanity-host support requires separate tenant evidence and an explicit permission decision.

## 2. Browser join is not guaranteed

Zoom account and meeting policy can disable or hide browser join. This limits the addressable surface for a browser-extension adapter, particularly in managed enterprises. Better CaptionKeep must not imply support for native Zoom desktop meetings.

## 3. Overlay and transcript panel are different products

The controlled Zoom Web client exposed an ephemeral subtitle overlay as DOM text. That overlay is capturable but has no speaker attribution or visible history. A Live Transcript side panel could be richer, but it was not available in the controlled test and is not part of the initial adapter.

Caption enablement may also require the participant to confirm the meeting caption language. Better CaptionKeep can request the Zoom control once, but it must not silently override an explicit user or host choice.

## 4. Privacy and compliance boundary

The extension reads only text Zoom already renders for the participant. It does not use Zoom RTMS, a meeting bot, tab audio, microphone input, camera input, or a developer-hosted transcript service. Scrubby remains exposure reduction rather than proof of HIPAA, PCI DSS, GDPR, or other compliance.

## Remaining unknowns (do not assume)

- Is a host-enabled Live Transcript side panel real DOM text, and does it provide stable speaker attribution?
- Does the overlay retain the same source and segment behavior across reconnects, screen sharing, multiple participants, and long meetings?
- How does the Web client distinguish a correction from the start of a new utterance under rapid conversation?
- Which vanity-domain patterns, if any, merit a later permission request?

## Required next validation

Run Chrome and Edge unpacked UAT with two synthetic participants. Verify interim corrections, quiet-gap segmentation, hide/show remounts, reconnects, copy/view/export, history recovery, and the explicit `Unknown speaker` limitation before promoting Zoom into a release candidate.

Research compiled September 16, 2026 and updated with a controlled live Web-client probe on September 21, 2026.
