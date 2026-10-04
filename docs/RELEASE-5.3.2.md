# Better CaptionKeep 5.3.2 Recovery Record

Status: **UAT passed — production promotion remains blocked on Microsoft publisher verification and the governed release workflow.**

## Incident

Microsoft Edge Add-ons began serving 5.3.1 on October 4, 2026. The Store-installed extension identity and signed CRX were valid, but the packaged runtime Graph configuration was inert. Microsoft 365 controls were therefore hidden for ordinary Store users unless a managed browser policy supplied `enableGraphTranscriptImport`, `graphTenantId`, and `graphClientId`.

The 5.3.1 update also changed Microsoft identity and Graph origins from absent in 5.1 to mandatory host permissions. Edge could therefore restrict or disable the updated extension pending approval of the expanded site access, presenting **allow only when clicked** and preventing the expected background meeting workflow. The recovery keeps supported meeting origins required and requests Microsoft identity and Graph access only from the user gesture on **Connect Microsoft 365**.

Dev and UAT had passed against an authorized local overlay. That evidence did not prove the Store package because the Store source still set its Graph runtime configuration to `undefined`. Treating the local overlay as Store-equivalent evidence was the release-control failure.

The `_metadata/verified_contents.json` file observed in the signed Edge CRX is Store-generated integrity metadata. It is valid in the Store-delivered CRX but cannot be loaded from an extracted directory through **Load unpacked**. It did not cause the missing Microsoft 365 controls.

## Recovery requirements

5.3.2 cannot advance from Dev until all of the following are true:

1. The Store source contains an enabled public-client Graph configuration without secrets.
2. The Entra application accepts accounts from organizational directories and retains the exact Chrome and Edge Store redirect URIs.
3. Tenant-managed Graph settings override the packaged defaults.
4. Automated tests reject a Store build with an inert or missing Graph configuration.
5. Release verification rejects files or directories whose names begin with `_`; Store-injected integrity metadata is never copied into an unpacked or uploaded source package.
6. Microsoft identity and Graph are optional host permissions requested only when the user selects **Connect Microsoft 365**; an upgrade must not expand mandatory site access beyond the supported meeting origins.
7. The exact Store-equivalent UAT package displays Microsoft 365, completes sign-in, lists recent eligible meetings, imports a transcript, and opens the standard transcript viewer.
8. Chrome and Edge UAT use the Store identities or a documented identity-equivalent validation path; an unpacked overlay alone is insufficient release evidence.
9. Store metadata, the GitHub wiki, Azure Boards, and release status are updated before promotion.

## Current Dev evidence

- Store runtime defaults enable Verified Teams Transcript with the Microsoft Entra public client ID.
- The authentication layer accepts the `organizations` authority while requiring a concrete tenant GUID in returned tokens.
- Managed tenant/client settings retain precedence over packaged defaults.
- Regression tests cover public Store configuration and multi-tenant token validation.
- Mandatory site access is again limited to the supported meeting origins; Microsoft identity and Graph access is requested at the user-initiated connection boundary.
- Permission approval resumes Microsoft sign-in from the service worker, so the browser closing the small popup does not require a second **Connect Microsoft 365** click.
- Active local capture is presented as working even when Teams role or organization policy makes an official Microsoft 365 transcript unavailable; the popup no longer labels that expected policy outcome as a capture failure.

## Live promotion evidence

- A clean Edge Dev installation requested Microsoft identity and Graph origins only after **Connect Microsoft 365** was selected.
- Permission approval automatically continued to Microsoft sign-in without requiring a second Connect action.
- Recent eligible meetings appeared after the documented **Refresh** action.
- A verified Teams transcript created October 4, 2026 at 7:56:45 AM Central was imported at 8:25:54 AM Central with speaker attribution and source fingerprint `276fc89ddf90964e7f99d98dd436f076a56c9adc4dfe74d65671a30a072dac86`.
- The stable UAT identity repeated the connection, meeting discovery, transcript import/viewer, live-caption capture, and export path successfully.
- GitHub validation, JavaScript analysis, CodeQL, Azure lifecycle validation, and the full local release-candidate gate passed for commit `c385d3bdf03e5e3afb2d16d2cb07f8c41ef99380`.
- The existing Entra registration was renamed **Better CaptionKeep**, converted to `AzureADMultipleOrgs`, and updated to declare exactly `Calendars.ReadBasic`, `OnlineMeetings.Read`, and `OnlineMeetingTranscript.Read.All`. Existing redirect URIs and the home-tenant grant were preserved.

This record does not authorize Store publication. Microsoft publisher verification and the frozen GitHub release/Azure production approval remain required.
