# Better CaptionKeep 5.3.2 Recovery Record

Status: **public in Microsoft Edge Add-ons and the Chrome Web Store; installed-upgrade verification remains separate evidence.**

## Incident

The complete root-cause analysis and corrective action plan are recorded in the [Edge 5.3.1 after-action report](INCIDENT-2026-10-04-EDGE-5.3.1.md).

Microsoft Edge Add-ons began serving 5.3.1 on October 4, 2026. The Store-installed extension identity and signed CRX were valid, but the packaged runtime Graph configuration was inert. Microsoft 365 controls were therefore hidden for ordinary Store users unless a managed browser policy supplied `enableGraphTranscriptImport`, `graphTenantId`, and `graphClientId`.

The 5.3.1 update also changed Microsoft identity and Graph origins from absent in 5.1 to mandatory host permissions. Edge could therefore restrict or disable the updated extension pending approval of the expanded site access, presenting **allow only when clicked** and preventing the expected background meeting workflow. The recovery keeps supported meeting origins required and requests Microsoft identity and Graph access only from the user gesture on **Connect Microsoft 365**.

Dev and UAT had passed against an authorized local overlay. That evidence did not prove the Store package because the Store source still set its Graph runtime configuration to `undefined`. Treating the local overlay as Store-equivalent evidence was the release-control failure.

The `_metadata/verified_contents.json` file observed in the signed Edge CRX is Store-generated integrity metadata. It is valid in the Store-delivered CRX but cannot be loaded from an extracted directory through **Load unpacked**. It did not cause the missing Microsoft 365 controls.

## Recovery requirements

5.3.2 cannot advance from Dev until all of the following are true:

1. The Store source contains no shared tenant or Entra application identity.
2. The Microsoft 365 setup remains visible and accepts a customer's valid tenant/client identifiers locally or through managed policy.
3. Tenant-managed Graph settings override and lock the local setup.
4. Automated tests reject a Store build that embeds a tenant/client identity or hides the setup path.
5. Release verification rejects files or directories whose names begin with `_`; Store-injected integrity metadata is never copied into an unpacked or uploaded source package.
6. Microsoft identity and Graph are optional host permissions requested only when the user selects **Connect Microsoft 365**; an upgrade must not expand mandatory site access beyond the supported meeting origins.
7. The exact Store-equivalent UAT package displays Microsoft 365 setup, saves the customer-owned identifiers locally, completes sign-in, lists recent eligible meetings, imports a transcript, and opens the standard transcript viewer.
8. Chrome and Edge UAT use the Store identities or a documented identity-equivalent validation path; an unpacked overlay alone is insufficient release evidence.
9. Store metadata, the GitHub wiki, Azure Boards, and release status are updated before promotion.

## Current Dev evidence

- Store runtime defaults are intentionally inert and carry no tenant or client identity.
- The authentication layer requires a concrete configured tenant GUID and rejects a token issued by another tenant.
- Users can save an organization-owned tenant/client pair in browser-local storage; managed settings retain precedence and lock those fields.
- Regression tests cover visible setup, configuration isolation, managed precedence, wrong-tenant rejection, and Store-package identity exclusion.
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
- The earlier live proof used the developer tenant registration and exact delegated permissions. That proof validates the Graph workflow, but the release architecture now requires each customer to own a single-tenant registration; no developer registration is shipped.

## Governed submission evidence

- PR #70 merged to `master` at `2e7145bf66a8b8bf7d5b66af1366e542c20909f8` after GitHub validation, CodeQL, and Azure lifecycle checks passed.
- GitHub release `v5.3.2` was generated by the pinned release workflow with Store ZIPs, checksums, SBOM, provenance, and attestation.
- Azure Store run 615 proved immutable release verification and successfully prepared the Edge draft. Its Chrome job stopped safely because the publisher initially treated Google's terminal `CANCELLED` 5.3.1 revision as active.
- PR #71 corrected that release-tool state classifier and added regression coverage: only `PENDING_REVIEW` and `STAGED` are active; `CANCELLED` and `REJECTED` may be replaced.
- Azure Store run 619 verified the same frozen `v5.3.2` assets, uploaded both drafts, passed the protected production approval, and submitted both existing Store products.
- Chrome accepted 5.3.2 for review as `PENDING_REVIEW` with automatic publication after approval, and the public listing reported version 5.3.2 updated October 6, 2026.
- Microsoft completed the Edge submission operation as `Succeeded` and accepted 5.3.2 for certification.
- At 17:25 UTC on October 4, 2026, Microsoft's public Edge update service returned the signed production CRX for extension `edefcbdhahfolgkoamkbknjppojpaffk`; its root `manifest.json` reports version `5.3.2` and the expected Microsoft Edge Add-ons update URL.
- The private release VM was deallocated after the pipeline completed.

Public availability is verified in both Stores. Installed-upgrade verification remains separate evidence and is not implied by the public listings.
