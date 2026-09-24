# Better CaptionKeep 5.1 Zoom Web development gate

Zoom Web is the next provider track after the published 5.0.0 Teams and Google Meet release. This gate records what is implemented, what has live evidence, and what must remain unclaimed until UAT is complete.

## Release schedule

- [x] Day 0: 5.0.0 confirmed public and updating on September 21, 2026.
- [x] Integrated 5.1 candidate branch created as `codex/5.1-release-candidate`.
- [x] Zoom Web capture and automatic-save improvements integrated on September 24, 2026.
- [ ] Final release-candidate freeze no later than October 2, 2026.
- [ ] Record the frozen commit and Chrome/Edge package SHA-256 hashes.
- [ ] Complete at least 48 uninterrupted hours of testing on October 3-4, 2026.
- [ ] Hold the final go/no-go review after the test window closes.
- [ ] Publish no earlier than October 5, 2026.

Any packaged-extension change after the test window begins resets the 48-hour
clock and moves publication as needed. The deadline never overrides the release
gate.

## Protected baseline

- [x] Integrate the Zoom work onto current `origin/master` in `codex/5.1-release-candidate`.
- [x] Use this as the single active 5.1 integration and test branch; do not create a second `release/5.1` branch.
- [x] Keep Teams caption stabilization isolated from the Zoom provider branch.
- [x] Preserve the reviewed, published 5.0.0 Store artifacts unchanged.

## Controlled discovery

- [x] Join an isolated Zoom Web test meeting without camera access.
- [x] Enable English captions and capture two synthetic utterances only.
- [x] Confirm exact host `app.zoom.us` and `/wc/{numeric-meeting-id}/join` path shape.
- [x] Confirm the meeting UI is embedded in a matching child frame.
- [x] Confirm real DOM caption text at `#live-transcription-subtitle`.
- [x] Confirm the overlay lacks speaker attribution.
- [x] Confirm hiding captions removes the source and showing captions remounts it.
- [x] Confirm caption enablement may require `More` -> `Show Captions` -> `English` -> `Save`.
- [x] Commit a sanitized structural fixture with no meeting or participant content.

## Implementation

- [x] Add an isolated `zoom` provider and content-script lane.
- [x] Limit host access to `https://app.zoom.us/*`; do not add a wildcard vanity-domain grant.
- [x] Normalize overlay captions through the shared coordinator with `Unknown speaker`.
- [x] Auto-enable captions through Zoom's hidden More menu and first-use English language dialog.
- [x] Preserve interim updates, quiet-gap segment boundaries, checkpoints, and bounded remount reuse.
- [x] Support popup status, copy, viewer, export, history, Scrubby, and optional review-first AI handoff through shared services.
- [x] Keep audio, video, RTMS, bots, native Zoom, and transcript-side-panel assumptions outside the implementation.

## Automated verification

- [x] Full combined unit suite passes: 61 tests on September 24, 2026.
- [x] Extension lint passes with the Zoom frame and manifest rules.
- [x] Chrome and Edge development packages build and contain the Zoom provider files.
- [x] Release verification passes without altering a submitted Store artifact.

## Browser UAT required before promotion

- [ ] Chrome unpacked: capture two synthetic utterances in Zoom Web and verify quiet-gap segmentation.
- [ ] Edge unpacked: repeat the controlled capture.
- [ ] Verify captions hidden/shown, meeting reconnect, tab reload, and meeting exit.
- [ ] Verify copy, viewer, TXT/Markdown export, history recovery, and Scrubby.
- [ ] Verify the UI and exports clearly retain `Unknown speaker` when the overlay provides no attribution.
- [ ] Probe a host-enabled full transcript panel separately; do not block overlay capture on that optional surface.
- [ ] Decide whether vanity-domain support is rejected, deferred, or separately permissioned.

## Promotion boundary

Do not update Store listings, tag a release, publish an artifact, or claim native Zoom support until this gate has browser evidence, the exact candidate completes the 48-hour test window, and the product owner explicitly promotes the work.
