# Troubleshooting

Start with what you observed: the control you chose, the result and the installed version if you know it. The extension, Administrator Setup and Intune endpoint app are separate components; their version/status numbers are not interchangeable. See [Support](Support) to report a problem without having to diagnose it yourself.

## Administrator Setup will not open

In an extension build that includes **Open administrator setup**:

- If the helper is missing, choose **Download and install**, run the signed installer on the PC running that browser, then choose **Continue setup**.
- If browser permission was declined, retry and review that permission. Reinstalling is not a substitute for permission approval.
- If setup says another instance is open, close or return to that window before retrying.
- If it did not respond, check for an already-open setup window before starting another copy.

If the public Store build has no setup button, download [Administrator Setup 6.0.3-r2](https://github.com/Mr-GraphnStaff/better-captionkeep/releases/tag/admin-setup-v6.0.3-r2) directly and follow [Administrator deployment](Administrator-Deployment). Installing on a different PC, or merely opening a shared project folder, does not install the browser connection on this PC.

The installer registers the browser connection for the Windows account that runs it. Normal setup does not require a registry command, manual registration script or customer Azure signing configuration.

## Windows blocks the installer

Verify the download source, SHA-256 sidecar and digital signature before proceeding. The expected publisher for 6.0.3 is **DAVID ANTHONY FARRIS**. A valid signed file can still encounter SmartScreen reputation checks or organizational controls. Use your approved software-distribution/support process; do not disable protection or change certificate trust to get past a warning. [Microsoft's reputation guidance](https://learn.microsoft.com/en-us/windows/apps/package-and-deploy/smartscreen-reputation).

## Prerequisite installation or Microsoft sign-in appears stuck

Keep the current setup window open and read its phase/progress message. Microsoft PowerShell or module installation can take time. Review dependency approval and any Windows installer prompts. If installation says a relaunch is needed, close setup and reopen it after installation finishes.

During sign-in, choose **Show Microsoft sign-in** if the account window is behind another application. Use the intended work/school administrator account and complete MFA. Personal Microsoft accounts do not provide the required organizational administration. Capture the displayed error before closing it; do not keep starting duplicate deployments.

An administrator-permission or consent failure needs the appropriate identity/Intune/Teams administrator. It is not evidence that the endpoint install failed. [Permissions guide](Deployment-Security-and-Permissions).

## I did not save a deployment receipt

The primary guided flow saves it automatically. Under the Windows account used for setup, look in:

```text
%LOCALAPPDATA%\DAF-TECH\Better CaptionKeep\Deployments\<operation-id>\receipt.json
```

Use the actual location shown by setup if different. **Check deployment status** and **Continue saved setup** open a receipt picker; choose the original record for that operation. Keep the surrounding folder private and intact. If setup explicitly says no receipt was created, address the preparation/sign-in error from the setup window instead of selecting another attempt's receipt.

After an owner-approved reset, a retired receipt is historical evidence, not the starting point for the new test.

## Intune says Assigned or Installed, but the browser does not have BCK

1. In [Intune](https://intune.microsoft.com), open **Apps → All apps** or the Windows app list and select the exact BCK app from the saved deployment. Check its assignment, device identity and latest report time.
2. Confirm you are looking at the intended physical PC and browser profile. Old apps, other management policies and another profile can produce misleadingly similar results.
3. Inspect `edge://policy` or `chrome://policy` on that device, then the browser's extension list. Confirm the Store ID, version and enabled state. **Added by your organization** indicates management, not which setup operation supplied it.
4. Allow normal device check-in and browser Store delivery. Request sync through your organization's approved tooling if necessary; a completed Sync action still is not proof that the Win32 app or extension installed.
5. If it remains pending/failed, collect the current Intune app error and report time. Your device administrator can inspect the local Intune Management Extension logs under `%ProgramData%\Microsoft\IntuneManagementExtension\Logs`.

The Win32 app's Installed detection establishes the policy worker's recorded configuration state. It does not establish that a browser opened the extension or that an employee signed in. Do not create another deployment simply because device reporting is delayed.

## A managed control is gray or settings cannot be checked

An enforced organizational value cannot be changed by an employee's local preference. Ask the administrator which policy supplies it; another policy can still apply after one BCK assignment is removed.

If your build displays **Organization settings unavailable**, use **Retry settings**. In builds with that recovery state, data-release actions remain paused until policy can be read again. Do not clear managed configuration to make controls editable. Record a repeated failure in [Support](Support).

The new Intune console settings editor/bridge is not included in this release. Experimental source or an uploaded template is not proof of working ongoing settings delivery.

## Microsoft 365 sign-in or recent meetings fail

Open **All Settings → Microsoft 365 / Verified Teams transcripts**. Confirm the organization's connection was supplied and choose its Microsoft 365 Connect action. Browser host permission, Microsoft consent and employee sign-in are separate steps.

For **AADSTS50011**, open **Administrator connection details** in the affected browser and copy its complete **Redirect URI:**. The app owner must compare it with **Entra app registrations → the existing app → Authentication → Single-page application** and add the approved exact URI if absent. Keep other approved callbacks. Follow [the browser-specific guide](Browser-Installation-and-Microsoft-365); Firefox does not use the Chromium callback format. Do not add wildcards or copy another installation's callback.

If sign-in/discovery worked, do not assume import did. Check [Microsoft 365 connection](Microsoft-365-Connection) for official transcription, processing and access requirements. Live captions and a calendar invitation do not create an official transcript.

## A listed meeting has no importable transcript

First check whether that transcript opens in Teams under the intended work account. Confirm the extension is connected to the same approved account and that you selected the intended meeting. Meeting visibility, app consent and transcript access are separate checks.

If it opens in Teams but BCK says it has not finished processing, do not keep waiting on that message alone. Version 6.0.3 can show that explanation when its Graph lookup returns no transcript; it has not checked processing state. [Issue #255](https://github.com/Mr-GraphnStaff/better-captionkeep/issues/255) tracks the misleading message and unresolved retrieval. Use the normal Teams transcript access available to you while the BCK import is investigated.

If no official transcript exists in Teams, check that transcription was actually started and permitted during the meeting. A calendar entry or live captions alone do not create it. Tenant transcript API settings and the signed-in user's permissions must also allow access.

Report the browser, installed version, whether Teams opens the transcript and the sanitized error through [Support](Support). Keep real meeting titles, join links, participants, transcript text and organization identifiers out of public reports. Sign-in/discovery success does not establish successful import.

## Captions are not being captured

Confirm captions are displayed in the supported meeting and local capture is enabled. BCK preserves provider captions; it does not transcribe audio itself. Teams official transcription is a separate control. Native Zoom desktop capture is not supported by the browser extension.

If the provider layout changed or the count does not increase with synthetic speech, report the browser/provider and observed state. A bounded workspace window or active filter can hide older words; check **Full transcript** before diagnosing source loss. Zoom Web can omit speaker attribution; **Unknown speaker** is the honest fallback.

## A transcript did not save, or the viewer did not open

Check browser download prompts and the viewer's History/recovery entries. A canceled download is not a completed save. Preserve needed data before clearing storage or uninstalling. Record whether an import confirmation appeared and whether History contains the new session.

For controlled unpacked testing, load only the designated complete package folder containing its manifest. Mixing old and new files, profiles or helper installations can create false failures. Do not create another workspace or clear evidence before identifying the exact build.

## Theme, translation, Notes or Ask problems

Record the theme, browser zoom and affected control with synthetic content. A generated translation catalog is not proof of language review. Notes/Ask need an existing source and the correct meeting snapshot; generated prose remains a draft until reviewed. Optional handoff failure should be reported separately from local capture.

## Report a bug

Use [Support](Support) or the [bug report form](https://github.com/Mr-GraphnStaff/better-captionkeep/issues/new?template=bug_report.yml). Tell us what you clicked, what happened and what you expected. Sanitized error text and versions help, but an unknown version should not stop you reporting a problem. Do not attach full deployment receipts, real meeting data, private identifiers or sign-in material publicly.
