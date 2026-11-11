# Administrator Deployment

This page is the starting point for organizational deployment. Version 6.0 is in release qualification; use [Release status](Release-Status) to distinguish prepared packages from public Store availability. Test with synthetic meeting data and a pilot group before broad rollout.

Read [Deployment security and permissions](Deployment-Security-and-Permissions) before approving access. It explains browser permissions, employee Microsoft 365 access, the separate administrative authority needed for automated provisioning, data destinations, residual risks, and rollback. The development administrator wizard supports Intune installation with or without Microsoft 365 provisioning. It is locally simulated pilot tooling, not a verified deployed feature; the page includes commands and unfinished acceptance requirements.

## Guided administrator setup (development pilot)

1. Obtain the reviewed `better-captionkeep-enterprise-setup.zip` and extract the complete folder.
2. Double-click **Start-Setup.cmd**. If supported stable PowerShell 7.6 or newer is missing, choose the official Microsoft install/upgrade route offered by the launcher.
3. Choose the browser(s), optional Microsoft 365 setup, and existing deployment group. Review the displayed tenant and change summary, then approve the required privileged actions.
4. Keep the generated receipt. **Check-Status.cmd** checks rollout status; **Continue-Setup.cmd** selects an incomplete setup's receipt for guided continuation.

The setup creates the approved app/managed settings and submits Intune installation scripts; the administrator does not shuttle identifiers between portals. A submitted assignment is not a verified endpoint installation. Pilot-device extension behavior and Microsoft 365 access still require their own acceptance. Temporary provisioning consent is not removed merely by closing the setup window; follow the completion record's cleanup steps.

Developers build this pilot into `output/enterprise-setup-dev/` using the checked working-area launcher and `npm run build:enterprise-setup`. This does not replace retained Production or place privileged administrator tooling inside the unpacked extension. The package contains no Node runtime, extension ZIP, tenant credential, or meeting transcript.

### Optional Azure Artifact Signing

An organization with an existing Azure Artifact Signing Private Trust profile can use `-AzureSigningConfigPath` instead of a local certificate. This is optional; the wizard does not buy a signing account or create its trust policy. The configuration contains exactly `Endpoint`, `CodeSigningAccountName`, `CertificateProfileName`, `ExpectedTenantId`, `ExpectedEnhancedKeyUsages`, `SignToolPath`, and `DlibPath`. Keep it outside the distributed package and include no credentials. Obtain both expected private tenant/profile EKUs from the approved profile's Azure certificate record; the general code-signing EKU alone is insufficient.

Install Microsoft's supported SignTool and Artifact Signing dlib on the signing workstation, and sign Azure CLI in as the same administrator and tenant used for Microsoft Graph setup. Grant that administrator the Certificate Profile Signer role on the intended profile. The wizard verifies Microsoft tool signatures, previews the provider, timestamps each generated script, and requires a valid trusted signature with all pinned service/profile EKUs before submitting its original bytes to Intune with signature enforcement enabled.

For Private Trust, configure and verify the signing workstation's and target devices' chain/publisher trust first. Azure rotates short-lived signing certificates; trusting one publisher leaf once does not cover future leaf certificates. The wizard does not install trusted roots or publishers. A saved completed set of signed files can continue without the original Azure configuration or tools. An ambiguous signing attempt stops for reconciliation instead of automatically issuing another signature. See [Microsoft's signing integrations](https://learn.microsoft.com/en-us/azure/artifact-signing/how-to-signing-integrations) and [the security guide](Deployment-Security-and-Permissions).

## Public Store identities

| Browser | Extension ID | Update source |
| --- | --- | --- |
| Chrome | `nabjdlnkkaonnbnimnmnhjcbigceebml` | Chrome Web Store |
| Edge | `edefcbdhahfolgkoamkbknjppojpaffk` | Microsoft Edge Add-ons |

Use Store identities for managed production deployment. Do not force-install a local unpacked identity.

## Configuration portability

Users can export and import bounded Better CaptionKeep preferences from **All Settings → Configuration portability**. Transcript content, Microsoft authentication tokens, and customer tenant/client identifiers are excluded from the portable preference file. Managed browser policy always takes precedence after import. Administrators should distribute policy through the documented Edge or Chrome management path rather than sharing a user preference file as enforcement.

## Managed policy

Better CaptionKeep supports browser-managed configuration for privacy, retention, export, attendee capture, approved AI destinations, and optional Microsoft 365 transcript import. The repository contains the authoritative [managed schema](https://github.com/Mr-GraphnStaff/better-captionkeep/blob/master/teams-captions-saver/managed-schema.json), [EUC deployment guide](https://github.com/Mr-GraphnStaff/better-captionkeep/blob/master/docs/EUC-DEPLOYMENT.md), and [security architecture](https://github.com/Mr-GraphnStaff/better-captionkeep/blob/master/docs/SECURITY-ARCHITECTURE.md).

Language resources in the 6.0 source do not establish legal approval or managed-language deployment acceptance. Canadian French, Spanish, and Intune-enforced language assignment require the implementation and legal-review evidence in the [multilingual privacy and enterprise adoption plan](https://github.com/Mr-GraphnStaff/better-captionkeep/blob/codex/6.0/docs/FRENCH-GDPR-ADOPTION-GATE.md). Validate the exact pilot package and policy behavior before promising a language rollout.

## Microsoft 365 import

Verified Teams Transcript requires an organization-owned single-tenant Entra app registration, the documented delegated Microsoft Graph permissions, tenant consent, exact browser redirect URIs, and Teams transcript API access. Open **All Settings** for Microsoft 365 connection and import. Enter the tenant/client IDs locally or deploy all three managed Graph policies; managed values take precedence. It is not enabled by a calendar invitation alone. The last documented public baseline is 5.4.0; local archival of its checkout does not withdraw the Store release. Version 6.0 qualification does not establish public availability.

Use [Microsoft 365 connection](Microsoft-365-Connection) for the user workflow and the repository's [Entra registration runbook](https://github.com/Mr-GraphnStaff/better-captionkeep/blob/master/docs/ENTRA-GRAPH-APP-REGISTRATION.md) for controlled pilot setup.

## Deployment gate

Do not deploy a GitHub release solely because it is tagged. Require the exact Store or managed package version, hashes, test evidence, policy review, pilot acceptance, rollback plan, and confirmation that the Store is actually serving the intended version.

## Release distributions

Use the one source checkout and its `Dev`, `QA`, and `Production` build lanes. Only verified artifacts from `Production` are uploaded as release distributions; Development and UAT outputs are not published. Retained 5.4 release records remain historical evidence, not an alternate active source tree.
