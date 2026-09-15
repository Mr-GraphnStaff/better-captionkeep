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
- [ ] Preserve captured records when captions are hidden, remounted, or the page changes state.

## Automated verification

- [x] Provider lifecycle and exact-manifest tests.
- [x] Shared popup capture-contract test.
- [x] Fixture-driven parser tests for new, updated, and repeated captions.
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

The next implementation gate is live extension UAT: reload the reviewed sideload, speak a controlled phrase, and prove that the popup can copy, view, and export the captured Google Meet record. A passing fixture test alone is not evidence that the loaded extension works against the current Meet runtime.
