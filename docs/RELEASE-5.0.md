# Better CaptionKeep 5.0 release gate

Version 5.0 is the next public release after 4.6. The 4.7 candidate is retired and its completed work is carried forward here. Google Meet is the first new live-capture provider; Microsoft Teams remains the regression baseline. Do not merge the Google Meet adapter into `release/5.0` until every required item below has direct evidence.

## Protected baselines

- [x] Preserve the retired 4.7 source commit and package unchanged as historical evidence.
- [x] Keep 4.6 as the live Store baseline until 5.0 passes its release gate.
- [x] Develop 5.0 work outside `master` and `release/4.7`.
- [x] Use the protected `release/5.0` review lane.

## Google Meet implementation

- [x] Shared provider registry and isolated Google Meet content-script lane.
- [x] Exact host scope: `https://meet.google.com/*`.
- [x] Live empty-state probe confirms `[role="region"][aria-label="Captions"]`.
- [x] Sanitized empty-state fixture contains no account, meeting link, or transcript text.
- [x] Capture a sanitized live speaker/text row fixture from a controlled meeting.
- [x] Parse speaker and evolving caption text without depending on generated CSS classes.
- [x] Deduplicate interim mutations into stable caption records.
- [x] Request Google Meet captions automatically once per meeting without overriding a later manual shutoff.
- [x] Preserve captured records when captions are hidden, remounted, or the page changes state.

## Automated verification

- [x] Provider lifecycle and exact-manifest tests.
- [x] Shared popup capture-contract test.
- [x] Fixture-driven parser tests for new, updated, and repeated captions.
- [x] End-of-meeting and caption-remount regression tests using live-derived structure.
- [x] Full `npm test`, `npm run lint`, and release verification pass from commit `3c0f37f` (45 tests; September 17, 2026).

## Browser UAT

- [x] Build separate Chrome and Edge 5.0 sideload identities.
- [x] Product owner accepted the live Google Meet feature after hands-on testing on September 17, 2026.
- [ ] Chrome: capture a controlled Google Meet caption, then copy, view, and export it.
- [ ] Edge: capture the same controlled phrase, then copy, view, and export it.
- [ ] Verify Scrubby, themes, history, and AI handoff against a Google Meet transcript.
- [ ] Re-run the existing Teams capture and export matrix in both browsers.

The product owner approved publication based on hands-on Google Meet testing. The unchecked browser-specific matrix items are retained as explicit unclaimed evidence and follow-up regression work; this release record does not imply those combinations were separately observed.

## Release and governance

- [ ] Record UAT evidence and artifact hashes on the linked Azure Boards work items.
- [x] Complete review through PR #22 into `release/5.0` and PR #23 into `master`.
- [x] Merge after automated checks passed and the product owner accepted the live Google Meet feature.
- [x] Update public documentation, privacy disclosure, and 5.0 release notes.
- [x] Tag `v5.0.0`, publish the GitHub release, and submit the verified Store package from commit `7d2e8ee`.
- [x] Receive Microsoft Edge Add-ons certification approval and confirm an existing installation upgraded to 5.0.0 on September 21, 2026.

The remaining unchecked browser-specific UAT and Azure Boards evidence items are follow-up regression records, not claims of completed observation. Chrome 5.0.0 became public on September 20, 2026, and Edge 5.0.0 was confirmed public with a successful upgrade on September 21, 2026. September 21 is therefore Day 0 for the next rolling two-week release cycle. Future Store updates use the gated pipeline in `docs/EDGE-PUBLISH-PIPELINE.md`.
