# Administrator Deployment

This page is the starting point for organizational deployment. Test with synthetic meeting data and a pilot group before broad rollout.

## Public Store identities

| Browser | Extension ID | Update source |
| --- | --- | --- |
| Chrome | `nabjdlnkkaonnbnimnmnhjcbigceebml` | Chrome Web Store |
| Edge | `edefcbdhahfolgkoamkbknjppojpaffk` | Microsoft Edge Add-ons |

Use Store identities for managed production deployment. Do not force-install a local unpacked identity.

## Managed policy

Better CaptionKeep supports browser-managed configuration for privacy, retention, export, attendee capture, approved AI destinations, and optional Microsoft 365 transcript import. The repository contains the authoritative [managed schema](https://github.com/Mr-GraphnStaff/better-captionkeep/blob/master/teams-captions-saver/managed-schema.json), [EUC deployment guide](https://github.com/Mr-GraphnStaff/better-captionkeep/blob/master/docs/EUC-DEPLOYMENT.md), and [security architecture](https://github.com/Mr-GraphnStaff/better-captionkeep/blob/master/docs/SECURITY-ARCHITECTURE.md).

English is the current product interface. Canadian French, Spanish, and Intune-enforced language assignment are approved roadmap requirements, not shipped capabilities. The implementation and legal-review gates are tracked in the repository's [multilingual privacy and enterprise adoption plan](https://github.com/Mr-GraphnStaff/better-captionkeep/blob/master/docs/FRENCH-GDPR-ADOPTION-GATE.md) and Azure Boards Feature 308. The design uses one signed Store package: Quebec assignments will enforce Canadian French through managed policy without creating a separate extension ID, Entra redirect URI, or release pipeline.

## Microsoft 365 import

Verified Teams Transcript requires an organization-owned single-tenant Entra app registration, the documented delegated Microsoft Graph permissions, tenant consent, exact browser redirect URIs, and Teams transcript API access. Enter the tenant/client IDs locally or deploy all three managed Graph policies; managed values take precedence. It is not enabled by a calendar invitation alone. Chrome and Edge publicly serve the corrected 5.3.2 package.

Use [Microsoft 365 connection](Microsoft-365-Connection) for the user workflow and the repository's [Entra registration runbook](https://github.com/Mr-GraphnStaff/better-captionkeep/blob/master/docs/ENTRA-GRAPH-APP-REGISTRATION.md) for controlled pilot setup.

## Deployment gate

Do not deploy a GitHub release solely because it is tagged. Require the exact Store or managed package version, hashes, test evidence, policy review, pilot acceptance, rollback plan, and confirmation that the Store is actually serving the intended version.
