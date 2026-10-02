# Complete BYOAI handoff UAT

This checklist validates issue #52 in unpacked Chrome and Edge builds. Provider acceptance and provider context-window behavior are outside Better CaptionKeep's guarantee.

## Test data

Use synthetic captions only. Include more than 12,000 characters, a final-caption decision, Unicode, an empty caption, a caption longer than one copy chunk, a repeated scrub-sensitive value, an Unknown speaker, and a capture-gap warning.

## Chrome and Edge

- [ ] Enable BYOAI and finish the synthetic meeting.
- [ ] Confirm the internal review page opens without transcript text in its URL.
- [ ] Confirm selected and included caption counts match, omitted is zero, and file/chunk counts and size are visible.
- [ ] Save the complete Markdown evidence and verify the first and final caption IDs occur once and in order.
- [ ] Walk every numbered copy chunk and verify a long caption retains one source ID with ordered part numbers.
- [ ] Turn Scrubby on and verify a repeated value receives the same placeholder in the file and every affected chunk.
- [ ] Turn Scrubby off and verify the second-click confirmation guards unmasked copying.
- [ ] Change managed policy while the page is open and verify AI, clipboard, file, and forced-scrubbing restrictions are rechecked at action time.
- [ ] Discard the handoff and verify copy/save controls stop working.
- [ ] Simulate storage and tab-open failure and verify no temporary `handoff_` payload remains.

Record the browser versions, extension commit, pass/fail evidence, and any deviations in the release-candidate checklist. This document is a test procedure; unchecked items are not represented as completed UAT.
