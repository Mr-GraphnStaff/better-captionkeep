# Local archive search UAT

This checklist validates issue #51 on top of the issue #53 local archive. Use sanitized synthetic meetings only.

- [ ] Retain meetings with mixed-case phrases, Unicode, punctuation, Unknown speaker, duplicate phrases, and distinct dates/titles/speakers.
- [ ] Search a keyword and an exact phrase; verify snippets identify the correct meeting, speaker, displayed date/time, and source key.
- [ ] Apply title, speaker, from-date, through-date, newest-first, and oldest-first filters individually and together.
- [ ] Activate a result with mouse, Enter, and keyboard-only navigation; verify the saved viewer opens at the matching caption after browser restart.
- [ ] Submit two searches rapidly and verify results from the earlier search never replace the later results.
- [ ] Delete and expire source meetings and verify subsequent searches no longer return them.
- [ ] Corrupt one synthetic archive chunk and verify readable meetings still return while the skipped-meeting count is shown.
- [ ] Disable completed-history access through managed policy and verify search is blocked without creating a hidden copy.
- [ ] Inspect extension network activity and permissions; verify search adds no request, host permission, telemetry, or persisted content index.
- [ ] Exercise the documented maximum managed archive fixture and record search latency in Chrome and Edge.

Unchecked items are not represented as completed live UAT.
