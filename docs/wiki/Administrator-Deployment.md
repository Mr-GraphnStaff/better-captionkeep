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

## Microsoft 365 import

Verified Teams Transcript requires a single-tenant Entra application, delegated Microsoft Graph permissions, explicit tenant consent, exact browser redirect URIs, and Teams transcript API access. It is not enabled by a calendar invitation alone and is not currently present in public Store version 5.1.0.

Use [Microsoft 365 connection](Microsoft-365-Connection) for the user workflow and the repository's [Entra registration runbook](https://github.com/Mr-GraphnStaff/better-captionkeep/blob/master/docs/ENTRA-GRAPH-APP-REGISTRATION.md) for controlled pilot setup.

## Deployment gate

Do not deploy a GitHub release solely because it is tagged. Require the exact Store or managed package version, hashes, test evidence, policy review, pilot acceptance, rollback plan, and confirmation that the Store is actually serving the intended version.
