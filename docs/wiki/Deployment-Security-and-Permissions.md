# Deployment security and permissions

Review date: November 10, 2026. Audience: administrators, security reviewers, and employees deciding whether to deploy Better CaptionKeep.

## What you are approving

Better CaptionKeep reads displayed meeting captions and keeps a browser-local copy. Optional Microsoft 365 integration retrieves an official Teams transcript using the signed-in user's access. Intune can install the extension and enforce its settings.

The requested automated setup has two choices:

| Choice | Intended result | Microsoft 365 requirement |
| --- | --- | --- |
| Deploy the extension | Install the unchanged Store extension and managed privacy settings for a selected pilot group | No transcript app registration or transcript consent |
| Deploy with Microsoft 365 | Also provision the organization's transcript app, request consent, and populate the extension's tenant/client settings | Organization-owned app, delegated permissions, and Teams transcript API access |

**Status:** managed settings, bundle generation, and the interactive transcript connector exist. The administrator package now has a Windows launcher, guided setup, and receipt-based status/continue entry points. Provisioning and endpoint logic have synthetic tests; the launcher has isolated Windows PowerShell tests. This remains development pilot tooling, not a released or tenant-certified feature, and is not launched from the extension UI. Local tests do not establish tenant deployment, endpoint enforcement, Store availability, or successful rollback. Use [Release status](Release-Status) and exact pilot evidence before production adoption.

## Run the development pilot automation

Build the administrator package from the reviewed checkout with `npm run build:enterprise-setup`, using the repository's required working-area launcher. Its default development output is `output/enterprise-setup-dev/`; it preserves retained Production and stays outside the load-unpacked extension folders. It contains `better-captionkeep-enterprise-setup.zip`, launchers, scripts, profiles, this security page, and SHA-256 file checksums. No Node installation is needed on the administrator's workstation. It contains no extension ZIP, customer credential, meeting content, receipt, or scratch folder. The builder refuses a nonempty destination so prior packages and operational records are not overwritten. Preserve the previous output and select a fresh approved destination for another build.

On the administrator's Windows workstation, extract the complete ZIP and double-click **Start-Setup.cmd**. The launcher requires supported stable PowerShell 7.6 or newer. If missing or outdated, it offers an explicit choice to install or upgrade the current official Microsoft PowerShell package through WinGet or open Microsoft's installation guide. No downloaded script is evaluated, no execution policy is bypassed, and no installation starts without the administrator's choice. Windows elevation and Microsoft installer prompts remain visible. If installation needs a refreshed application path, the launcher explains that setup must be relaunched.

The development package is not an organization-signed release. If Windows download marking or organizational execution policy blocks its administrator scripts, stop and obtain a reviewed, appropriately signed package through the organization's deployment process. Do not use an execution-policy bypass. Signing generated endpoint scripts in the wizard does not sign the downloaded administrator launcher or provisioning script; production package signing and trust distribution require their own qualification.

The guided task is: choose Edge, Chrome, or both; choose whether to include Microsoft 365; sign in to the intended tenant; select an existing deployment group; review a plain-language change summary; then approve the provisioning and rollout. Browser/group selection and permissions stay explicit. The administrator does not create an app or copy tenant/client IDs between portals. Read the privilege explanation here and in the wizard before approving it.

Keep the setup's `receipt.json`. Double-click **Check-Status.cmd** and choose that receipt to check a submitted rollout. Double-click **Continue-Setup.cmd** to select a receipt for an incomplete setup. Continuation must reconcile recorded objects and pending operations; do not start a second deployment merely because the first was interrupted. A status such as assignment submitted or script succeeded does not prove that the extension is installed and usable in a browser. Browser and Microsoft 365 acceptance remain separate until verified on the pilot device.

For an already reviewed pilot, the equivalent commands are:

```powershell
# Install-only: no transcript app, Graph transcript grant, or Teams change.
pwsh -NoProfile -File ./Enterprise-Setup.ps1 -WithoutMicrosoft365

# Install plus customer-owned transcript app, consent, and managed connection IDs.
pwsh -NoProfile -File ./Enterprise-Setup.ps1 -WithMicrosoft365

# View scopes and mode offline without connecting or writing cloud resources.
pwsh -NoProfile -File ./Enterprise-Setup.ps1 -WithoutMicrosoft365 -PlanOnly
```

`-Browser edge` or `-Browser chrome` narrows the browser choice. `-Hardened` selects the existing restrictive privacy profile for either browser. `-EnableSpeakerAttribution` separately opts into enabling attributed transcript access when Microsoft 365 setup is selected. Without that switch the existing attribution setting is preserved. The Microsoft 365 path enables the tenant-wide Graph transcript API setting after approval; it does not change meeting transcription policies or start transcription in meetings.

Choose an organization-approved code-signing certificate in the guided setup, or supply `-SigningCertificateThumbprint` for automation. If no suitable certificate is available, the administrator must explicitly choose the unsigned pilot exception or stop. Unsigned mode is not the recommended production default. The endpoint script runs as 64-bit SYSTEM through Intune; clients must trust the signing chain when signature enforcement is enabled.

The wizard uses the official Microsoft Graph PowerShell administrative client, delegated sign-in, and a process-scoped Graph context. It explains the missing modules together before offering installation of `Microsoft.Graph.Authentication` and, only for Microsoft 365 setup, `MicrosoftTeams` from the official PowerShell Gallery. Module installation changes the workstation's user-module installation. Installed module versions and the package's provenance must be reviewed under the customer's software-supply-chain process. Microsoft Graph and Teams can require separate authentication or consent experiences; the package must not describe this as guaranteed silent sign-in.

The implemented scopes are `GroupMember.Read.All` (existing-group lookup) and `DeviceManagementScripts.ReadWrite.All` (Intune script upload/assignment). The Microsoft 365 option additionally requests `Application.ReadWrite.All` (app/service-principal provisioning) and `DelegatedPermissionGrant.ReadWrite.All` (automated transcript-consent grant). These are administrative scopes granted to the provisioning client, not to the employee transcript app. The wizard does not currently use `DeviceManagementConfiguration.ReadWrite.All`, write group membership, create client secrets, or grant application-only transcript access.

Before resource creation, the wizard displays tenant/account, group ID/name, browser choice, base privacy policies, employee/admin scopes, script-template hash, signature mode, and proposed global Teams changes. It creates the customer app with exact selected Store redirect URIs and a unique deployment identity. After creating the app it automatically fills the tenant/client IDs into both browser policies, generates installation/removal scripts, and displays their hashes. A second approval authorizes upload and assignment of those exact scripts. It never defaults to tenant-wide Intune assignment.

The receipt directory defaults to `receipts/<deployment-id>/` beside the extracted package; `-OutputDirectory` selects a fresh customer-governed location. It records app/service-principal/grant IDs, pre-change Teams settings, script hashes/IDs, assignment progress, and any pending operation. It deliberately omits tokens. **These receipts are customer-specific operational records; do not publish them in the wiki or public issues.**

The endpoint installation writes the official Store force-install entry and replaces only this extension's managed-policy subtree. A registry before-image is retained under `HKLM:\SOFTWARE\DAF-TECH\BetterCaptionKeep\Deployments\<deployment-id>\<browser>`. Existing unrelated force-install entries are preserved. A matching per-extension or wildcard `ExtensionSettings` rule causes a conflict stop rather than an attempt to override another management authority. Configurations on already deployed endpoints therefore need a conflict check before this pilot can replace a prior management method.

Generated `<browser>-Remove.ps1` scripts restore the prior managed-policy tree and remove only a force-install entry created by this deployment. They stop if the current policy differs from the recorded applied state. Deploy removal scripts to the same pilot through the organization's approved Intune script process; they are not executed automatically on unassignment. No removal script deletes transcripts or exported files itself, but subsequent browser uninstall behavior may remove local extension storage. Cloud-app/consent deletion, global Teams rollback, and provisioning-grant revocation remain separate administrative operations, not automated rollback claims.

**Known limits:** Graph Intune script APIs used here are beta; script upload is not endpoint success; a timed-out creation request may have created an object before its ID was returned. The wizard preserves an incomplete receipt and stops instead of blindly retrying or deleting resources. Automatic resume/reconciliation, automatic temporary-consent cleanup, a live Intune pilot, extension-launched setup UI, and automated cloud rollback remain unfinished. At exit it disconnects local sessions, but does not revoke the provisioning client's grants. Removing shared Microsoft Graph PowerShell consent without checking other workflows could disrupt them. These gaps prevent a production-ready claim.

## The administrator experience we require

1. Sign in to Microsoft with the organization's authorized administrative identity. Verify the tenant being targeted.
2. Choose Edge, Chrome, or both; an existing deployment group; privacy settings; and whether Microsoft 365 integration is included.
3. Review the exact app, redirects, permissions, scripts, policy values, group, and tenant-wide settings the automation proposes to change.
4. Approve the Microsoft authorization requests and proposed changes. The automation performs the configuration and transfers the resulting IDs into deployment settings; the administrator does not copy identifiers between portals.
5. Review a completion record that distinguishes objects created, assignments made, endpoint results, and unfinished steps. A partially completed setup must never report successful deployment.
6. Test one managed device before expanding the assignment. Remove temporary provisioning access and verify its removal.

The workflow must also explain how it obtains its initial provisioning identity. An unregistered extension cannot grant itself permission to create its first Entra app. A customer-approved administrative tool or separately approved bootstrap identity is required. The choice, publisher, requested scopes, and cleanup must be visible before approval. Employee transcript access must never silently acquire administrative permissions.

## Three different permission boundaries

### Browser extension permissions: current manifest

These are browser capabilities, not Microsoft Graph consent. Inspect the exact Store build as well as the [source manifest](https://github.com/Mr-GraphnStaff/better-captionkeep/blob/master/teams-captions-saver/manifest.json).

| Permission | Purpose | Exposure and limitation |
| --- | --- | --- |
| `downloads` | Save transcript exports | The extension can initiate browser downloads. Exported copies leave extension retention controls. |
| `activeTab` | User-requested operations on the active tab, including meeting screenshots | A screenshot can contain names, chat, or video imagery. Images are not automatically scrubbed. |
| `storage` | Preferences, transcripts, checkpoints, managed values | People or malware with access to the browser profile may access retained data. |
| `unlimitedStorage` | Avoid the normal extension-storage quota for retained transcripts | Not unlimited physical disk space; configure retention and handle disk-full failures. |
| `sidePanel` | Show the meeting workspace beside the meeting | Workspace text may be visible to someone viewing or sharing the screen. |
| `identity` | Launch interactive Microsoft authentication | Not permission to read all Microsoft 365 data; Graph consent and tenant controls apply separately. |

Required host access covers `teams.microsoft.com`, `teams.cloud.microsoft`, `meet.google.com`, and `app.zoom.us`. This permits access on matching sites, broader than a single caption element. Content-script selectors and feature restrictions are application controls, not a browser-enforced restriction to caption text. The manifest contains no blanket `<all_urls>` permission. Zoom content scripts target `/wc/` and can run in matching frames.

Optional host access covers `login.microsoftonline.com` and `graph.microsoft.com`. The current connection flow requests it when the user chooses Connect Microsoft 365. Managed provisioning of IDs does not prove silent browser-permission approval or silent sign-in.

The extension does not record microphone, tab audio, system audio, or video. Still-image capture is a separate explicit feature. Manifest capabilities and actual behavior must be checked again for every permission-changing release.

### Employee Microsoft 365 access: current connector

The current connector requests these scopes through authorization-code flow with PKCE:

| Scope | Why requested | Risk and boundary |
| --- | --- | --- |
| `Calendars.ReadBasic` | Discover recent calendar meetings and join details | Exposes basic calendar metadata, which can itself be sensitive. |
| `OnlineMeetings.Read` | Resolve the selected online meeting | Exposes meeting details within Microsoft's delegated authorization rules. |
| `OnlineMeetingTranscript.Read.All` | Retrieve an official transcript the signed-in user is authorized to access | Sensitive transcript access; `Read.All` must not be described as a technical restriction to one user-selected meeting. Selection is our product behavior; Microsoft determines the permission boundary. |
| `openid` | Establish authenticated identity | Identifies the signed-in account. |
| `profile` | Obtain basic identity claims | Makes account profile claims available to the connector. |
| `offline_access` | Refresh delegated access without repeating sign-in for every request | A refresh token is a credential. Session storage limits persistence but does not make it harmless. |

These are delegated scopes, not application-only collection. Administrator consent authorizes access; the current product still requires user sign-in and an explicit import. Actual availability depends on meeting type, transcript existence, Microsoft authorization, and tenant settings. See [Microsoft's transcript API permissions](https://learn.microsoft.com/en-us/graph/api/onlinemeeting-list-transcripts?view=graph-rest-1.0) and [Graph permissions reference](https://learn.microsoft.com/en-us/graph/permissions-reference).

The customer app is single-tenant with exact Store redirect URLs, no wildcard redirects, and no client secret or private certificate embedded in the extension. Tenant/client IDs are public configuration identifiers, not passwords. The connector uses state and nonce checks and validates the configured tenant. These controls require negative-path tests; their presence in source is not an independent security audit.

### Administrative provisioning: new workflow requirements

Setup authority is substantially more powerful than employee transcript access. Its exact scopes must be derived from the implemented API operations and displayed before consent. Do not request every scope below merely because it is listed.

| Operation | Microsoft permission considerations | Security consequence |
| --- | --- | --- |
| Create the transcript app | Microsoft's create API currently lists `AppRegistration.Create`; other required operations may need broader permissions | Creation-only permission does not establish permission to configure all properties, owners, or service principals. |
| Update an app or create its service principal with delegated access | Current APIs list `Application.ReadWrite.All` | Can affect other applications subject to the signed-in administrator's authority; our intended object allowlist does not narrow the OAuth scope. |
| Application-owned provisioning alternative | `Application.ReadWrite.OwnedBy` is an application permission, not a delegated scope | Requires a separately secured confidential identity; not a reason to embed a secret in the extension. |
| Grant transcript consent | Prefer Microsoft's explicit administrator consent experience for the completed customer app | If grants are written through Graph instead, `DelegatedPermissionGrant.ReadWrite.All` is powerful authority to alter consent. Do not silently add it to simplify implementation. |
| Create Intune configuration profiles | `DeviceManagementConfiguration.ReadWrite.All`, when that API path is used | Can change device configuration beyond this extension. Require separate justification and approved object targeting. |
| Upload/assign Intune PowerShell or remediation scripts | Current APIs list `DeviceManagementScripts.ReadWrite.All` | Scripts can execute as SYSTEM on assigned endpoints. This is privileged code deployment, not merely saving extension preferences. |
| Discover a deployment group | Use the least read scope supported by the selected group lookup API | Group names and membership can disclose organizational information. No group-write permission should be requested just to choose an existing group. |
| Change Teams transcript settings | Authorized Microsoft Teams administrative session | Transcript API settings can affect the tenant, not just the extension's Intune group. Show and approve this separately. |

Sources: [create app](https://learn.microsoft.com/en-us/graph/api/application-post-applications?view=graph-rest-1.0), [update app](https://learn.microsoft.com/en-us/graph/api/application-update?view=graph-rest-1.0), [create service principal](https://learn.microsoft.com/en-us/graph/api/serviceprincipal-post-serviceprincipals?view=graph-rest-1.0), [write delegated consent](https://learn.microsoft.com/en-us/graph/api/oauth2permissiongrant-post?view=graph-rest-1.0), [Intune configuration](https://learn.microsoft.com/en-us/graph/api/intune-deviceconfigv2-devicemanagementconfigurationpolicy-create?view=graph-rest-beta), and [Intune scripts](https://learn.microsoft.com/en-us/graph/api/intune-devices-devicemanagementscript-create?view=graph-rest-beta).

Delegated permission also requires a supported administrator role and applicable Intune RBAC. Tenant licensing, cloud environment, and API availability must be checked. A role or scope alone does not guarantee an operation will succeed. Prefer stable APIs; explicitly identify beta dependencies and test them for drift. Never make Global Administrator a permanent routine requirement, elevate roles automatically, or add directory-wide permissions as a silent fallback.

## Where data goes

| Data | Destination | Retention boundary |
| --- | --- | --- |
| Displayed captions, local notes, recovery checkpoints | Browser extension storage | Local deletion and configured retention; no additional extension-provided encryption layer |
| Official Teams transcript | Microsoft 365 first, then an explicitly imported browser-local copy | Tenant policy governs Microsoft's copy; local retention governs the imported copy |
| Access/refresh tokens | Current connector's browser session storage | Sign-out/session clearing removes the local copy; revocation and already-issued token lifetime are separate concerns |
| Tenant/client IDs and managed settings | Customer browser policy / Intune configuration | Configuration rather than credentials; still keep customer-specific records out of public support posts |
| File, clipboard, email draft, or optional AI handoff | User-selected destination | Copies are not retracted by deleting local history or uninstalling the extension |
| Setup approval and resource IDs | Customer-controlled change record | No tokens, passwords, transcript text, or private meeting links in logs or public wiki |

Core capture needs no publisher-operated transcript service. Optional Microsoft authentication, Graph retrieval, user-directed handoffs, browser sync of some preferences, and browser-provided model downloads have their own network boundaries. "Local" does not mean "the browser never contacts a service."

## Risks and how they must be controlled

| Risk | Existing control or required mitigation | Residual risk / evidence needed |
| --- | --- | --- |
| Administrative token theft | Required: distinct short-lived provisioning session; no tokens in packages/logs; disconnect after setup | Disconnect is not revocation of consent or proof that all issued tokens stopped working. Verify cleanup independently. |
| Wrong tenant or excessive assignment | Required: verify tenant and exact existing group; preview changes; bind approval to the plan; no default All Users/All Devices | A compromised admin or provisioning tool can exceed our intended scope. Pilot and audit remain necessary. |
| Partial setup or repeated execution | Required: record created object IDs; reconcile before retry; stop on ownership/configuration conflict | Never delete a same-named app or overwrite unrelated policy to get past a failure. |
| Malicious endpoint script | Required: review exact script bytes/hash and SYSTEM context; honor organization's signing rules | Broad script-management permission remains dangerous. Signing establishes origin/integrity, not harmless behavior. |
| Policy conflict or stale settings | Existing bundle validation; required live browser policy inspection and change/removal tests | A generated JSON file or registry write does not prove effective browser enforcement. |
| Tenant-wide transcript exposure | Separately approve any Teams API/attribution changes and preserve prior values | A pilot Intune group does not limit a global Teams setting. Other authorized apps may also benefit. |
| Local data theft or disk growth | Managed retention and endpoint protections | Local history is not additionally encrypted by this extension; disk encryption does not protect an unlocked compromised session. |
| Sensitive exports or AI disclosure | Privacy Scrubber, managed release restrictions, destination review | Pattern masking can miss context and identifiers. Screenshots are not scrubbed. No DLP/compliance guarantee. |
| Incorrect or incomplete evidence | Source-linked captions, separate derivatives and capture-health indicators | Provider captions can be wrong, absent, or incomplete; a source hash does not prove what was spoken. |
| Compromised Store update | Exact Store identity/update source, reviewed release provenance and staged rollout | Hashes of our ZIP do not independently prove the bytes a Store served. Verify installed versions. |
| Removal or rollback loses data | Pilot export/retention decision; staged unassignment; preserve recovery evidence | Uninstall can remove local transcripts; exported and tenant copies remain. Store downgrade is not assumed. |

## What Intune can preconfigure today

The managed schema supports `enableGraphTranscriptImport`, `graphTenantId`, and `graphClientId`. The automation should populate all three from the app it creates when Microsoft 365 is selected. When it is not selected, the deployment must not create a transcript application, seek transcript consent, or enable transcript import. It must explain whether an existing customer configuration will be preserved or changed before approval.

Privacy, export, attendee, retention, locale, and AI-destination policies are documented in the [EUC runbook](https://github.com/Mr-GraphnStaff/better-captionkeep/blob/master/docs/EUC-DEPLOYMENT.md) and [managed schema](https://github.com/Mr-GraphnStaff/better-captionkeep/blob/master/teams-captions-saver/managed-schema.json). Optional Microsoft 365 integration must not become a prerequisite for local caption capture.

## Completion means measured results

Record each item as passed, failed, blocked, or not run, separately for Edge and Chrome:

- App creation/configuration, exact redirects, requested scopes, consent granted/denied, wrong-tenant rejection, and no embedded secrets.
- Intune installation-only path without transcript provisioning; optional Microsoft 365 path with automatic policy population.
- Admin denial/cancellation, missing roles/licenses, API failure, partial creation, retry, and stale/conflicting policy behavior.
- Approved group only, effective browser policy, locked controls, actual Store install/version, and first useful synthetic meeting.
- Sign-in/MFA/Conditional Access, browser permission request, transcript unavailable/denied, token expiry and consent revocation.
- Restart/upgrade preserves settings and retained data; retention, prohibited exports, and AI restrictions work.
- Assignment removal, policy rollback, app disable/revocation, local-data behavior, and provisioning-access cleanup.

Do not treat "uploaded to Intune" as "installed," "registered app" as "consent granted," or "signed out" as "permission revoked." Use the organization's [enterprise review record](https://github.com/Mr-GraphnStaff/better-captionkeep/blob/master/docs/ENTERPRISE-SECURITY-REVIEW.md).

## Disable, revoke, and recover

Stop expanding assignments. Preserve a sanitized record of affected versions and objects. Unassign the deployment in a test ring and verify endpoint results before broad removal. Revoke the specific customer app's delegated grants and follow the organization's Microsoft session-revocation procedure; verify denied access instead of assuming immediate invalidation. Disabling Graph import in the UI alone is not revocation.

Remove temporary provisioning grants separately from the employee transcript app. Restore changed Teams settings only after checking the prior values and other applications' dependencies. Delete only resources proven to belong to this deployment, after reviewing local-data loss and shared-use consequences. Never delete a pre-existing customer app just because its display name matches.

Local sign-out/uninstall does not delete Microsoft's transcript, exported files, clipboard history, backups, mail drafts, or copies submitted to AI. The customer must manage those copies through the corresponding systems.

## Source and disclosure policy

The wiki must change whenever scopes, hosts, defaults, script execution context, data destinations, provisioning identity, or cleanup behavior change. Publish the exact implemented permission inventory and dated pilot results before calling the automated flow production-ready. This page is a security explanation and acceptance contract, not a promise that every risk has been eliminated.

Report security vulnerabilities through the repository's [security policy](https://github.com/Mr-GraphnStaff/better-captionkeep/blob/master/SECURITY.md). Public issues and wiki examples must use synthetic data.
