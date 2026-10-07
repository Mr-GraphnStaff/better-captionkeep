# Better CaptionKeep 5.3.3 Popup Reliability Hotfix

Status: **hotfix candidate — automated validation may support review, but live Edge and Chrome UAT and governed Store promotion remain required.**

## Problem

The 5.3 user interface exposed the active meeting transcript through two competing entry points:

- **View Transcript** opened a separate full-page viewer that continued receiving live updates.
- **Open Evidence Board** opened a side panel that already contained its own live transcript view.

Both surfaces read the same authoritative capture, so this did not prove transcript corruption. It did create two simultaneous live consoles with overlapping names and controls. The popup also treated `Ctrl+V` / `Cmd+V` as a shortcut for View Transcript, conflicting with the standard paste command.

The popup also exposed the complete Microsoft 365 transcript-import workspace: recent meetings, manual meeting link, administrator identifiers, and import controls. This crowded the main panel, and an unsaved identifier could disappear while the administrator switched windows to copy the other value because opening the popup again creates a new popup document.

## Hotfix behavior

1. The popup exposes one **Open Live Workspace** action.
2. The Live Workspace side panel contains **Live transcript** and **Evidence** views together.
3. **Open full transcript** remains available inside the workspace for an intentional expanded view.
4. Completed and imported transcripts continue to use the full transcript viewer.
5. The popup no longer intercepts `Ctrl+V` or `Cmd+V`.
6. The popup retains its prominent **All Settings** link but no longer renders the Microsoft 365 transcript-import workspace.
7. Recent meetings, manual meeting-link entry, connection controls, tenant and application ID setup, and verified transcript import appear only in the durable full-tab **All Settings** page.
8. Capture, recovery, local history, evidence markers, export, and transcript authority are unchanged.

## Required validation

- Load the 5.3.3 Edge UAT package on a clean profile.
- Start a Teams meeting with live captions and confirm the popup has one Live Workspace action.
- Confirm the side panel updates without opening a second viewer tab.
- Select **Open full transcript** and confirm the expanded viewer receives the same session without duplicate or missing captions.
- Confirm `Ctrl+V` pastes normally in an editable popup field.
- From the popup, select **All Settings** and confirm the full settings tab includes **Verified Teams transcripts**.
- Switch away from All Settings to copy each identifier, return, paste both values, save, and confirm the values remain present.
- Reopen the popup and confirm none of the Microsoft 365 transcript-import workspace is displayed there.
- Repeat the workspace and expanded-view checks in Chrome and Google Meet.
- Run the release-candidate gate and retain package checksums before any Store submission.

This record does not authorize publication or claim public availability.
