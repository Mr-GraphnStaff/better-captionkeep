# Better CaptionKeep 5.0 release gate

Version 5.0 is the multi-platform release. Google Meet is the first new live-capture provider; Microsoft Teams remains the regression baseline. Do not merge the Google Meet adapter into `release/5.0` until every required item below has direct evidence.

## Protected baselines

- [x] Preserve the accepted 4.7 source commit and Store package unchanged.
- [x] Develop 5.0 work outside `master` and `release/4.7`.
- [x] Use the protected `release/5.0` review lane.

## Google Meet implementation

- [x] Shared provider registry and isolated Google Meet content-script lane.
- [x] Exact host scope: `https://meet.google.com/*`.
- [x] Live empty-state probe confirms `[role="region"][aria-label="Captions"]`.
- [x] Sanitized empty-state fixture contains no account, meeting link, or transcript text.
- [ ] Capture a sanitized live speaker/text row fixture from a controlled meeting.
- [ ] Parse speaker and evolving caption text without depending on generated CSS classes.
- [ ] Deduplicate interim mutations into stable caption records.
- [ ] Preserve captured records when captions are hidden, remounted, or the page changes state.

## Automated verification

- [x] Provider lifecycle and exact-manifest tests.
- [x] Shared popup capture-contract test.
- [ ] Fixture-driven parser tests for new, updated, and repeated captions.
- [ ] End-of-meeting and caption-remount regression tests using live-derived structure.
- [ ] Full `npm test`, `npm run lint`, and release verification pass from the reviewed commit.

## Browser UAT

- [x] Build separate Chrome and Edge 5.0 sideload identities.
- [ ] Chrome: capture a controlled Google Meet caption, then copy, view, and export it.
- [ ] Edge: capture the same controlled phrase, then copy, view, and export it.
- [ ] Verify Scrubby, themes, history, and AI handoff against a Google Meet transcript.
- [ ] Re-run the existing Teams capture and export matrix in both browsers.

## Release and governance

- [ ] Record UAT evidence and artifact hashes on the linked Azure Boards work items.
- [ ] Complete peer review through a pull request into `release/5.0`.
- [ ] Merge only after required checks and live UAT are green.
- [ ] Update public documentation and release notes from the merged commit.

The unchecked speaker-row fixture is the current implementation gate. A detected caption container or a passing synthetic contract test is not evidence that Google Meet caption parsing works.
