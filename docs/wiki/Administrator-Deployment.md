# Administrator Deployment

This page is the starting point for organizational deployment. Version 6.0 is in release qualification; use [Release status](Release-Status) to distinguish prepared packages from public Store availability. Test with synthetic meeting data and a pilot group before broad rollout.

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

Use the one source checkout and its `dist/dev`, `dist/uat`, and `dist/prod` build lanes. Only verified artifacts from `dist/prod` are uploaded as release distributions; Development and UAT outputs are not published. Retained 5.4 release records remain historical evidence, not an alternate active source tree.
