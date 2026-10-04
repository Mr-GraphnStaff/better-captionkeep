# Install and Test

## Choose one lifecycle lane

The project maintains exactly three generated folders:

| Lane | Folder | Purpose |
| --- | --- | --- |
| Development | `dist/dev` | Current implementation and bug fixes |
| UAT / Release Candidate | `dist/uat` | Candidate behavior being accepted for promotion |
| Production | `dist/prod` | Promoted behavior plus verified release artifacts |

Do not load a ZIP file. Choose the lane folder itself; it must contain `manifest.json` at its root.

## Load unpacked

### Chrome or Brave

1. Open `chrome://extensions` in Chrome or `brave://extensions` in Brave.
2. Enable **Developer mode**.
3. Select **Load unpacked**.
4. Choose exactly one lane folder, such as `P:\Projects\better-captionkeep\dist\uat`.

### Microsoft Edge

1. Open `edge://extensions`.
2. Enable **Developer mode**.
3. Select **Load unpacked**.
4. Choose the intended lane folder.

## After a rebuild

Use the circular **Reload** control on the extension card. The Errors page retains historical errors until you select **Clear all**; clearing an old entry does not hide a current error because a current error returns after the next reload.

The three lane folders have fixed extension identities. A normal rebuild or upgrade does not require removing and re-adding the extension or changing its Microsoft redirect URI.

## Minimum smoke test

1. Open the extension and confirm its expected lane name.
2. Open Settings and confirm all ordinary features are present.
3. Confirm Microsoft 365 connection controls appear when the unpacked lane has been configured.
4. Capture a short synthetic meeting with captions enabled.
5. Open the transcript viewer.
6. Test local history and TXT, Markdown, and DOCX export.
7. If testing Microsoft 365 import, choose a recent meeting whose Teams transcription finished and confirm the imported transcript opens in the same transcript viewer.
