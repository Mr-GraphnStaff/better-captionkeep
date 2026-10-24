# Troubleshooting

This page covers the 6.0 qualification build. First identify the installed version, package/lane and browser; see [Release status](Release-Status) for historical public releases.

## Captions are not being captured

Confirm the supported provider's captions are displayed and that **All Settings → Capture controls** has not paused local capture. Better CaptionKeep does not transcribe audio itself. The popup distinguishes Waiting, Starting, Live, Off and Attention; use its recovery action when captions are unavailable. Test with invented content and record whether the caption count increases.

Provider policy or a changed meeting layout can block capture. Teams transcription is separate from displayed live captions. Native Zoom desktop capture is not supported.

## The transcript did not save

Open the full viewer's **History** and check for a completed session or recovery entry. Confirm save behavior, download permissions and browser-wide prompts. Cancelling a download is not a save. Do not clear extension storage or uninstall until you have checked recovery and preserved required data.

## Older words are missing from the workspace

The workspace may show a bounded window. Open **Full transcript** for earlier text, check active filters, and deliberately choose **Follow latest** to follow new captions again. Report actual source loss separately from a filtered/displayed window.

## Theme, zoom or translation looks wrong

Open **All Settings → Appearance** and record the selected theme, browser scale and page zoom. High contrast is an optional black/white/yellow preset; the default remains dark teal DAF-TECH. Report clipped controls, unreadable text or untranslated states with synthetic content. A catalog's presence does not establish a reviewed translation.

## Notes or Ask cannot complete

Check that the source still exists, the correct meeting snapshot is selected, and any returned answer includes valid caption references. Generated or pasted prose remains a draft until reviewed. Optional handoff failure should not stop local caption capture. 6.0 has no MCP helper/service connection to repair.

## Zoom captions have no speaker names

The Zoom Web overlay may omit attribution. **Unknown speaker** is the intended honest label.

## Microsoft 365 controls are missing or disabled

Open **All Settings → Microsoft 365**. Your organization supplies its own valid tenant and public client IDs; administrator consent and provider permission may be required. Verify the installed version before changing configuration. Do not put credentials into support reports.

For **AADSTS50011**, an administrator compares the exact redirect under **Administrator connection details** with the Entra app registration. Do not add wildcard redirects or repeatedly create path-generated identities. An invitation alone does not establish that a recent Teams meeting has an official transcript; transcription must have run and processing may take time.

## Manifest missing during controlled testing

For the current Chromium qualification build select `P:\Projects\better-captionkeep-dev\dist\uat` itself, containing `manifest.json`; do not select the parent `dist` folder or a ZIP. The retained `dist/dev` is not the next qualification package, and `dist/prod` contains separate distribution targets. Firefox requires its own Firefox package and installation method.

## Unknown script-fetch error after loading a package

Reload the supplied canonical package and refresh test meeting tabs. Preserve the error's sanitized details before clearing old errors. If it returns, report a stale/mixed-package possibility rather than creating a new folder or treating the cause as proven.

## Imported meeting does not open

Record the selected card position, whether import confirmation appeared, and whether local History contains the session. Treat a reproduced failure as a defect; keep meeting titles, participants and transcript content private.

Still stuck? See [Support](Support). The [historical incident and corrective action record](https://github.com/Mr-GraphnStaff/better-captionkeep/blob/master/docs/INCIDENT-2026-10-04-EDGE-5.3.1.md) remains preserved; 5.4 local archival does not remove it.
