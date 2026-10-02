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
- [ ] Open the same transcript in two viewer tabs; overlap edits, undo, and dictionary apply, then confirm no unrelated correction is lost or resurrected.
- [ ] Disable managed session history during a live meeting and confirm new corrections remain browser-session-only; confirm an already-open historical viewer cannot recreate purged correction data.
- [ ] Correct a recovery snapshot, retry archive, and confirm the correction follows the stable capture into the archived transcript; delete a recovery snapshot and confirm both legacy and stable correction records are removed.
- [ ] Force a local storage write failure and confirm the last complete dictionary and correction set remain intact.
- [ ] Confirm no network request, cloud AI call, account prompt, or host permission is introduced.

Record Chrome/Edge versions, extension commit, policy fixture, and pass/fail evidence. Unchecked items are not represented as completed UAT.
