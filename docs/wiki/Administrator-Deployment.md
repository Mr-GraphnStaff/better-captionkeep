# Administrator deployment

Use Administrator Setup to deploy the Store extension to a small Windows pilot group, with optional Microsoft 365 transcript access. Employees use the browser extension; they do not need the administrator application.

**Release context:** the signed [Administrator Setup 6.0.3 pilot installer](https://github.com/Mr-GraphnStaff/better-captionkeep/releases/tag/admin-setup-v6.0.3-r2) is public. Helper and extension versions are separate. An Administrator Setup button in a development build does not establish that the public Store build has that button. Check [Release status](Release-Status) for extension publication and acceptance evidence.

The recorded Chrome and Edge pilot reported Installed in Intune, and employee sign-in and recent-meeting discovery worked. Official transcript import remains unverified. These results do not establish large-fleet readiness.

## Before you start

- The guided route supports the commercial Microsoft cloud. Government and other sovereign-cloud tenants are not supported by this route.
- Use a supported Windows x64 administrator PC and an Intune-licensed organization with enrolled Windows x64 pilot devices. Follow Microsoft's [Win32 app prerequisites](https://learn.microsoft.com/en-us/intune/app-management/deployment/win32#prerequisites).
- Choose an existing, limited pilot group. Know which devices and users it contains.
- Have an approved work administrator account with the required Intune, Entra and, for Microsoft 365 setup, Teams authority. See [Security and permissions](Deployment-Security-and-Permissions).
- Allow your organization's approved access to GitHub downloads, Microsoft sign-in/Graph/Teams, the PowerShell Gallery and the relevant browser Store.
- Plan to install the administrator application on the PC running the browser you are using for setup. A shared project folder does not install the helper on another PC.

The public route includes a pre-signed endpoint worker. **You do not need your own Azure Artifact Signing account, code-signing certificate, Azure CLI, Node.js or .NET SDK.** Setup checks its Microsoft PowerShell prerequisites and explains any installation it needs.

## 1. Download and install Administrator Setup

If your installed extension offers **Open administrator setup**, choose it. A compatible build launches the installed helper or presents **Download and install** when it is missing. After running the installer, choose **Continue setup** to reconnect.

If that entry point is absent from your extension build, use the same signed installer directly:

**[Download Administrator Setup 6.0.3 for Windows x64](https://github.com/Mr-GraphnStaff/better-captionkeep/releases/download/admin-setup-v6.0.3-r2/BetterCaptionKeep-AdministratorSetup-6.0.3-win-x64.exe)**

The [release page](https://github.com/Mr-GraphnStaff/better-captionkeep/releases/tag/admin-setup-v6.0.3-r2) includes the SHA-256 sidecar. The installer SHA-256 is:

```text
a007f49ad1709d57ec63c49dff16ce7382127ef5e99e6396ca4cae5c476185f5
```

Check that Windows reports a valid digital signature from **DAVID ANTHONY FARRIS**, the verified publisher for this DAF-TECH release. A signature establishes publisher identity and file integrity; it does not guarantee that SmartScreen or an organization's policy will allow execution. See [Troubleshooting](Troubleshooting) if Windows blocks it.

Run the installer under the Windows account that will perform setup. It installs the application and its browser connection for that account. No separate browser-registration script is part of this flow. Close an existing Administrator Setup window before updating it.

If you downloaded directly and have no extension launch button, open the installed application in File Explorer:

```text
%LOCALAPPDATA%\Programs\DAF-TECH\Better CaptionKeep Administrator Setup\BetterCaptionKeep.AdminSetup.exe
```

## 2. Review and deploy to the pilot

1. In the application, choose **Set up Microsoft 365** and follow the browser and deployment choices. Choose installation with Microsoft 365 access, or installation only if official transcript retrieval is not needed.
2. Review any prerequisite prompt. The wizard requires supported stable PowerShell 7.6 or newer and may offer Microsoft's installation route. It explains installation of `Microsoft.Graph.Authentication` and, for Microsoft 365 setup, `MicrosoftTeams` from the official PowerShell Gallery. Keep the progress window open while this completes.
3. Complete Microsoft work-administrator sign-in and MFA yourself. If the account window is behind another window, use **Show Microsoft sign-in**. Confirm the intended organization.
4. Select the existing pilot group and the browsers to receive the extension: Edge, Chrome or both.
5. Review the tenant, group, browser Store identities, proposed managed settings, permissions and any tenant-wide Teams changes. Microsoft sign-in/consent and deployment approval are separate decisions.
6. Approve the displayed deployment only when those details are correct. Setup submits an Intune **Windows app (Win32)** for each selected browser. Its signed worker runs as SYSTEM and applies that browser's Store force-install and extension configuration.
7. Keep the setup window open until it records the result. Follow the status and recovery guidance below rather than starting another copy to retry an uncertain result.

Installation-only does not create the employee transcript app or enable Teams transcript API access. With Microsoft 365 selected, setup provisions the organization's single-tenant transcript app and supplies its connection identifiers to the browser policy; administrators do not need to copy those identifiers between portals.

## 3. Check the deployment

Open the [Intune admin center](https://intune.microsoft.com), then **Apps → All apps** (or the Windows app list). Find the entries named `Better CaptionKeep edge <deployment-id>` and/or `Better CaptionKeep chrome <deployment-id>`. Match their identities and assignments to your saved setup record. Select an app and inspect its device installation status and latest report time.

The application also provides **Check or continue an earlier setup → Check deployment status**. Select the saved `receipt.json` for the same deployment.

| Result | What it establishes | What to check next |
| --- | --- | --- |
| `AssignedPendingEndpointValidation` | Intune accepted the selected group assignment | Wait for the intended devices to check in and report. |
| Intune Installed / `PolicyConfigurationApplied` | The policy worker's detection requirements were reported satisfied | Inspect the actual browser profile, Store extension and effective policy. |
| Extension installed and enabled in the intended browser | The browser obtained the extension | Test local capture; if enabled, test employee Microsoft 365 access separately. |
| Sign-in and recent meetings work | Authentication and calendar discovery worked | Verify an authorized official transcript can actually be imported. |

For each pilot browser, confirm the installed extension ID/version, organization policy, enabled runtime and a useful synthetic meeting. Sign-in, meeting discovery and transcript import are different checks. A gray managed toggle alone does not identify which deployment supplied it.

## Your setup record is saved automatically

The primary guided flow saves its operational record under the Windows account that ran Administrator Setup:

```text
%LOCALAPPDATA%\DAF-TECH\Better CaptionKeep\Deployments\<operation-id>\receipt.json
```

You do not need to choose Save As for this record. Use the location displayed by setup if it differs from the default. When the status/continue file picker opens, navigate to that folder and choose the original `receipt.json`. Other Windows accounts have different application-data folders.

Keep the surrounding operation folder and the matching administrator package available during the pilot. It contains deployment identities, approval and progress information needed to reconcile an interruption. It is a private operational record, not a public support attachment.

If setup says no receipt was created, sign-in or preparation stopped before that record existed. Return to the application and address the reported prerequisite or sign-in problem. Do not invent a receipt or use one from a different attempt.

## Continue, update or remove

- **Continue an interrupted deployment:** choose **Continue saved setup** with that deployment's original receipt. Continuation checks recorded resources before proceeding. An ownership, configuration or package mismatch needs investigation, not another fresh deployment.
- **Update the administrator application:** close it, install the newer approved signed release, then reopen it. Supporting extension builds provide **Update setup** and **Continue setup**. An updated helper does not by itself update the Store extension or migrate an existing deployment.
- **Remove a deployment:** preserve any local transcripts that policy allows you to retain; use the recorded Win32 app's approved Uninstall assignment for the pilot. Verify policy restoration and browser results before deleting the Intune app. Simply removing its Required assignment or deleting the cloud app does not undo already-applied endpoint policy. See [removal boundaries](Deployment-Security-and-Permissions#removal-and-access-cleanup).
- **Retire a failed attempt for a clean test:** complete and verify the agreed cloud and endpoint cleanup first. Once an attempt is retired, do not continue its old receipt into the new test.

## Ongoing settings management

This release's guide covers initial deployment and the existing managed browser policies. The new Intune console settings editor, additional preferences and persistent policy bridge are **not included in this release**; they remain under testing. Do not assign experimental templates or assume that their presence in a repository/package establishes a working endpoint management path.

Use your organization's approved browser-policy process for subsequent changes to the currently supported settings, and test precedence on a limited group. Local employee preferences cannot override an enforced organizational value.

## Get help

Start with [Troubleshooting](Troubleshooting). For a repeatable problem, use [Support](Support) or the [bug report form](https://github.com/Mr-GraphnStaff/better-captionkeep/issues/new?template=bug_report.yml). A short description of what you clicked and what happened is enough to start. Share sanitized errors and versions, not full receipts, tenant identifiers, sign-in codes or meeting content.
