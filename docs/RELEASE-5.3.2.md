# Better CaptionKeep 5.3.2 Recovery Record

Status: **Development recovery — not a release candidate and not approved for Store submission.**

## Incident

Microsoft Edge Add-ons began serving 5.3.1 on October 4, 2026. The Store-installed extension identity and signed CRX were valid, but the packaged runtime Graph configuration was inert. Microsoft 365 controls were therefore hidden for ordinary Store users unless a managed browser policy supplied `enableGraphTranscriptImport`, `graphTenantId`, and `graphClientId`.

Dev and UAT had passed against an authorized local overlay. That evidence did not prove the Store package because the Store source still set its Graph runtime configuration to `undefined`. Treating the local overlay as Store-equivalent evidence was the release-control failure.

The `_metadata/verified_contents.json` file observed in the signed Edge CRX is Store-generated integrity metadata. It is valid in the Store-delivered CRX but cannot be loaded from an extracted directory through **Load unpacked**. It did not cause the missing Microsoft 365 controls.

## Recovery requirements

5.3.2 cannot advance from Dev until all of the following are true:

1. The Store source contains an enabled public-client Graph configuration without secrets.
2. The Entra application accepts accounts from organizational directories and retains the exact Chrome and Edge Store redirect URIs.
3. Tenant-managed Graph settings override the packaged defaults.
4. Automated tests reject a Store build with an inert or missing Graph configuration.
5. The exact Store-equivalent UAT package displays Microsoft 365, completes sign-in, lists recent eligible meetings, imports a transcript, and opens the standard transcript viewer.
6. Chrome and Edge UAT use the Store identities or a documented identity-equivalent validation path; an unpacked overlay alone is insufficient release evidence.
7. Store metadata, the GitHub wiki, Azure Boards, and release status are updated before promotion.

## Current Dev evidence

- Store runtime defaults enable Verified Teams Transcript with the Microsoft Entra public client ID.
- The authentication layer accepts the `organizations` authority while requiring a concrete tenant GUID in returned tokens.
- Managed tenant/client settings retain precedence over packaged defaults.
- Regression tests cover public Store configuration and multi-tenant token validation.
- Active local capture is presented as working even when Teams role or organization policy makes an official Microsoft 365 transcript unavailable; the popup no longer labels that expected policy outcome as a capture failure.

This record does not authorize publishing, changing the Entra sign-in audience, or promoting the build to UAT.
