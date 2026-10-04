# Local transcript archive UAT

This checklist validates issue #53 with synthetic meetings in unpacked Chrome and Edge builds. The initial archive is browser-local; no OneDrive or other cloud destination is used.

- [ ] Complete at least 25 synthetic meetings and confirm every completed meeting remains in the archive after browser restart.
- [ ] Trigger meeting completion twice with the same capture start time and confirm one archive entry remains with the final caption generation.
- [ ] Load archive data created by the previous ten-session implementation and confirm every legacy transcript opens without migration loss.
- [ ] Force a storage write failure and confirm earlier archived meetings remain readable, the recovery snapshot remains visible, and the popup shows a retry action.
- [ ] Retry the recovery snapshot and confirm the archive appears once and the recovery copy/error state is removed only after success.
- [ ] Delete one archive and use Clear All; confirm transcript chunks, attendee data, and index entries are removed.
- [ ] Apply managed maximum, retention, and archive-disable policies and confirm only those explicit policies remove archived content.
- [ ] Confirm no network request, account prompt, new host access, or cloud synchronization occurs.
- [ ] Confirm archive storage usage is visible without claiming a false fixed capacity.

Record Chrome/Edge versions, extension commit, policy fixture, and pass/fail evidence. Unchecked items are not represented as completed UAT.
