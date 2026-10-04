# DOCX export UAT

This checklist validates the first issue #49 delivery. DOCX is supported; SRT and WebVTT remain intentionally unavailable because captured display/observation times are not verified speech cue boundaries.

- [ ] Export the same complete live transcript and saved session to DOCX and confirm both use the shared export preview page.
- [ ] Export a filtered viewer subset and confirm only visible captions appear in the preview and document.
- [ ] Open the DOCX in current Microsoft Word and LibreOffice Writer; confirm no repair prompt appears.
- [ ] Confirm long captions, line breaks, Unicode names/text, XML-special characters, Unknown speaker, missing source times, and simultaneous observations remain readable.
- [ ] Confirm each caption includes its source caption identifier and the document discloses that displayed times are not verified media cue boundaries.
- [ ] Select Original and Corrected transcript views and confirm the DOCX version notice matches the selected derivative.
- [ ] Enable Scrubby with synthetic sensitive content and confirm the preview, visible document text, package XML, properties, and relationships contain no raw value.
- [ ] Apply managed file-export disable after the preview opens and confirm execution is blocked and pending exports are discarded.
- [ ] Exercise Save As, browser Downloads, a configured subfolder, cancellation, retry, and pending-export recovery in Chrome and Edge.
- [ ] Confirm TXT and Markdown manual/automatic exports remain unchanged and DOCX automatic save follows the same destination preference.
- [ ] Confirm SRT/WebVTT are not offered and no timing precision is fabricated.

Record browser, Word and LibreOffice versions, extension commit, policy fixture, and pass/fail evidence. Unchecked items are not represented as completed UAT.
