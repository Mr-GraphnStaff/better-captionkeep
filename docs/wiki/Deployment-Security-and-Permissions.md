# Deployment security and permissions

Reviewed November 16, 2026. This page describes the public **Administrator Setup 6.0.3** guided Win32 route and the existing extension capability boundaries. It does not certify a larger fleet, every tenant policy or the unreleased Intune settings editor/bridge.

For the practical procedure, see [Administrator deployment](Administrator-Deployment). Review the actual prompts and package version before approving access.

## Three components, three different boundaries

| Component | Where it runs | Authority and purpose |
| --- | --- | --- |
| Browser extension | Employee's browser profile | Local displayed-caption capture and review; optional employee Microsoft 365 access. |
| Administrator Setup | Administrator's Windows account | Interactive Microsoft administrator sign-in, approved app provisioning and Intune deployment. Employees do not need it. |
| Signed endpoint worker | Intune-managed pilot device, as SYSTEM | Applies the selected browser's force-install entry and extension policy; records policy beforeimages and detection state. |

The normal public installer supplies a pre-signed endpoint worker. Customers do not need an Azure signing account, signing tools, private key or a pilot certificate imported into a trusted-root store. Customer-specific configuration is validated data delivered with the deployment; it is not a customer signing key.

## What the administrator approves

The installation-only path deploys the Store extension and reviewed browser settings. The Microsoft 365 path additionally creates the organization's transcript app, grants delegated access and enables the approved Teams transcript API setting.

The guided route uses Microsoft's Graph PowerShell administrative client with a process-scoped session. Its implemented delegated scopes are:

| Scope | When | Purpose and reach |
| --- | --- | --- |
| `GroupMember.Read.All` | Setup | Find/select an existing deployment group. This is directory read access, not permission to change membership. |
| `DeviceManagementApps.ReadWrite.All` | Win32 setup/continuation | Create, upload and assign Intune Win32 apps. This is broader app-management authority than one BCK deployment. |
| `Application.ReadWrite.All` | Microsoft 365 setup | Provision the employee transcript application and service principal. This is broad application-management authority. |
| `DelegatedPermissionGrant.ReadWrite.All` | Microsoft 365 setup | Write the employee app's delegated consent grant. This can change consent beyond the selected application. |
| `DeviceManagementApps.Read.All` | Status-only operation | Read the existing Win32 deployment and device reports. |

The public Win32 route does not require `DeviceManagementScripts.ReadWrite.All` or `DeviceManagementConfiguration.ReadWrite.All`. Those belong to different workflows and must not be added merely to make a failed sign-in succeed. Device-status reporting uses a Microsoft Graph beta endpoint; report availability and API behavior can change.

A selected pilot group limits the authored assignment. It does not narrow these OAuth scopes or turn them into per-deployment permissions. The review must identify the correct tenant, exact group, browsers, application configuration and proposed changes.

### Administrator roles and prerequisites

The guided route accepts delegated sign-in to the commercial Microsoft cloud (`Global`) and uses `graph.microsoft.com`. Government and other sovereign-cloud endpoints are not supported by this route.

An Intune role alone does not provide Entra consent or Teams administrative authority. Arrange the approved capabilities before starting:

| Capability | What your organization must authorize |
| --- | --- |
| Intune Win32 app management | Read, create, update and assign apps within the permitted scope. Intune's Application Manager is an example role family; scope and any custom role still matter. |
| Entra app provisioning and delegated consent | A supported Entra role/custom role for the actual operations and consent policy. Application Administrator or Cloud Application Administrator may cover the relevant operations; validate the full permission set with your identity team. |
| Teams transcript API setting | An authorized Teams administrative session for the tenant-wide meeting configuration change. |

Microsoft documents the [Intune role permissions](https://learn.microsoft.com/en-us/intune/fundamentals/role-based-access-control/ref-built-in-roles) and [delegated consent operation/role requirements](https://learn.microsoft.com/en-us/graph/api/oauth2permissiongrant-post?view=graph-rest-1.0). A scope grant, role name or license alone is not a guarantee that a tenant's Conditional Access and administrative policy permit the whole workflow. Do not turn permanent Global Administrator access into a routine prerequisite.

The administrator PC needs supported stable PowerShell 7.6 or newer. The wizard explains installation/update of Microsoft Graph Authentication and, for Microsoft 365 setup, Microsoft Teams modules from the official PowerShell Gallery. These are workstation prerequisite changes, separate from tenant deployment approval. The helper installer is per-user; prerequisite installation can require additional Windows approval under organizational policy.

### Teams changes are tenant-wide

With Microsoft 365 selected, the approved workflow enables `EnableGraphTranscriptAccess`. Speaker attribution is a separate explicit choice; otherwise its previous value is preserved. The record retains the prior values. These settings are not limited by the Intune pilot group, and other authorized apps can also be affected. They do not start transcription in a meeting or replace meeting transcription policy. See [Microsoft's transcript API access controls](https://learn.microsoft.com/en-us/microsoftteams/meeting-transcript-api-access).

## Employee Microsoft 365 permissions

The employee connector uses authorization-code flow with PKCE against the organization's single-tenant public-client app. It requests:

| Scope | Use |
| --- | --- |
| `Calendars.ReadBasic` | Discover recent calendar meetings and join information. |
| `OnlineMeetings.Read` | Resolve the selected online meeting. |
| `OnlineMeetingTranscript.Read.All` | Retrieve an official transcript Microsoft authorizes the signed-in user to access. |
| `openid`, `profile` | Establish the signed-in identity and profile claims. |
| `offline_access` | Refresh delegated access during the browser session. |

These are delegated permissions, not an unattended application-only transcript collector. The product asks the employee to connect and select a meeting. That selection is application behavior, not an OAuth restriction to one meeting; Microsoft's authorization and tenant settings determine actual access. Calendar discovery does not prove transcript retrieval is permitted. See [Microsoft's transcript API permissions](https://learn.microsoft.com/en-us/graph/api/onlinemeeting-list-transcripts?view=graph-rest-1.0).

The customer app uses exact browser redirect URIs. The extension contains no customer client secret. Tenant/client IDs are configuration identifiers, not passwords. Concealing their display is a presentation feature, not encryption or an access-control boundary; confirm that feature in the installed extension version.

## Browser permissions

The existing extension uses `downloads`, `activeTab`, `storage`, `unlimitedStorage`, `sidePanel` and `identity` for its save, user-requested tab operations, local history, workspace and Microsoft sign-in features. Required site access covers the supported Teams, Meet and Zoom Web sites. That site access is broader than one caption element. There is no blanket `<all_urls>` permission in the reviewed manifest.

Microsoft identity/Graph host access is requested when the employee chooses to connect. Supporting administrator-launch builds also request optional `nativeMessaging` when the administrator opens setup. That connection launches the installed administrator application; it does not grant Microsoft 365 access or send transcript content to the helper. Store build availability of that entry point must be verified separately from publishing the installer.

The extension does not record microphone, tab audio, system audio or video. An explicit still-image screenshot feature is separate and may include information visible in the meeting tab. Check the exact installed manifest and release notes after any permission-changing update.

## Signing and distribution

The 6.0.3 release was downloaded anonymously and checked against its SHA-256 sidecar and valid public timestamped signature. Windows publisher: **DAVID ANTHONY FARRIS**, for this DAF-TECH release. Obtain the installer only from the [versioned release](https://github.com/Mr-GraphnStaff/better-captionkeep/releases/tag/admin-setup-v6.0.3) or an approved organizational distribution.

A valid signature identifies the publisher and protects signed bytes. It is not a promise of harmless code, permission approval or an absence of Windows warnings. SmartScreen also evaluates reputation, including a new file's history. Follow your organization's software approval process when Windows blocks execution. [Microsoft's explanation](https://learn.microsoft.com/en-us/windows/apps/package-and-deploy/smartscreen-reputation).

The signed endpoint code runs as SYSTEM, which is privileged code execution. It applies the extension-specific policy tree and Store force-install entry, preserving unrelated force-install entries. Its ownership record contains the prior extension policy. Conflicting management or policy drift can prevent installation/removal rather than silently overwrite another administrator's state.

## Where information goes

| Information | Destination and retention boundary |
| --- | --- |
| Captions, local transcripts, notes and checkpoints | Browser extension storage. No additional extension-provided encryption layer is claimed. |
| Official Teams transcript | Microsoft 365 first; an explicit import creates a separate local browser copy. |
| Employee access/refresh tokens | Connector session storage. Disconnect/session clearing and tenant revocation are different operations. |
| Connection identifiers and managed settings | Organization-controlled deployment/browser configuration; they are not client secrets. |
| Setup record | The administrator's private deployment folder, normally `%LOCALAPPDATA%\DAF-TECH\Better CaptionKeep\Deployments\<operation-id>\receipt.json`. It records object identities and progress, not authentication tokens. |
| Exports, clipboard, mail drafts or optional AI handoffs | The user's chosen destination, subject to policy. Local deletion cannot recall these copies. |

Core capture does not require a publisher-hosted transcript service. Optional Microsoft sign-in, Graph access, browser sync of preferences and deliberate external handoffs have their own network boundaries. Local-first does not mean the browser never contacts another service.

## Verify results without conflating them

Record app creation/consent, Intune assignment, worker detection, browser installation, employee sign-in, discovery and transcript import separately. An Intune Installed result for the policy worker does not prove browser runtime or employee import.

The recorded pilot verified Chrome/Edge Installed reporting plus employee sign-in and calendar discovery. Transcript import, broad fleet operation and the new ongoing settings-management bridge remain outside that acceptance. See [Administrator deployment](Administrator-Deployment) for the device checks.

## Removal and access cleanup

1. Stop expanding the assignment and preserve permitted local data and the private setup record.
2. Use the original Win32 app's approved Uninstall assignment and wait for endpoint reports. The recorded removal command restores the prior extension policy and removes a force-install entry only if this deployment created it. Ownership or policy drift requires investigation.
3. Verify the browser's effective policy and extension state. A previously installed or independently managed extension can remain. Removing an assignment or deleting an Intune app is not proof of endpoint rollback.
4. Separately review the employee Entra app, its delegated grants and the prior Teams settings. Disable/remove only resources proven to belong to this deployment, after checking shared dependencies.
5. If no longer needed, uninstall **Better CaptionKeep Administrator Setup** through Windows installed-app management. That removes this account's helper files and matching browser connection; it does not perform cloud or endpoint rollback.

Closing setup disconnects its local Microsoft sessions. It does **not** prove provisioning consent was revoked: the primary workflow preserves existing provisioning-client grants when ownership cannot be established. Have the identity administrator review those grants without breaking shared Microsoft Graph PowerShell workflows. An issued token's lifetime and revocation remain separate concerns.

Neither uninstall nor local sign-out deletes Microsoft's transcript, exports, backups, clipboard history, mail drafts or AI submissions. Extension removal can affect local browser history, so decide retention before removing it.

## Feedback and security reports

Use [Support](Support) for ordinary problems and the repository's [security policy](https://github.com/Mr-GraphnStaff/better-captionkeep/blob/master/SECURITY.md) for vulnerabilities. Public examples must be synthetic. Keep full receipts, private app/tenant/device identifiers, tokens, authentication codes and meeting content out of public reports.
