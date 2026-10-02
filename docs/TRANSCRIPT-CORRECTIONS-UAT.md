# Transcript corrections and local dictionary UAT

This checklist validates issue #50 using synthetic meetings. Corrections and terminology remain browser-local and separate from the captured provider transcript.

- [ ] Correct a live caption and confirm the corrected view changes while Original transcript still shows the provider text.
- [ ] Update that caption at the provider and confirm Better CaptionKeep shows the revised source text plus a review-required conflict instead of silently reapplying the old correction.
- [ ] Undo a manual correction and confirm the provider text is restored without changing adjacent captions.
- [ ] Save literal dictionary terms, including punctuation and non-ASCII text, then confirm saving alone does not modify the current or prior transcripts.
- [ ] Preview the dictionary and confirm it reports the affected captions without persisting changes.
- [ ] Explicitly apply the dictionary, reload the extension, and confirm the corrected derivative survives while the original remains available.
- [ ] Export both views and confirm the file identifies Original versus Corrected before Scrubby masks configured sensitive details.
- [ ] Delete the archived session and confirm its correction records are also removed while the shared terminology dictionary remains.
- [ ] Force a local storage write failure and confirm the last complete dictionary and correction set remain intact.
- [ ] Confirm no network request, cloud AI call, account prompt, or host permission is introduced.

Record Chrome/Edge versions, extension commit, policy fixture, and pass/fail evidence. Unchecked items are not represented as completed UAT.
