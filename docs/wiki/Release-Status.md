# Release Status

Last verified: **October 6, 2026**.

| Channel | Version | Status |
| --- | --- | --- |
| Chrome Web Store | 5.3.2 public; installed upgrade pending | The public listing and Google's update service both serve 5.3.2. An existing 5.1.0 installation must still be observed upgrading and pass the production smoke test. |
| Microsoft Edge Add-ons | 5.3.2 public; installed upgrade pending | Microsoft's public update service served the signed 5.3.2 CRX at 17:25 UTC on October 4. The upgrade from an existing 5.3.1 installation still requires verification. |
| Frozen production release | 5.3.2 | Public in both Stores. GitHub release, hashes, SBOM, provenance, Store packages, PR checks, protected approval, and Store submissions are complete; installed-upgrade verification remains open. |
| Active development release | 5.4.0 | Development began October 4 under the governed concurrent-release boundary. Scope is tracked in Azure Boards Epic #314 and the repository 5.4 development record. |
| GitHub `v5.3.1` | 5.3.1 | Published immutable release; source commit, checksums, provenance, and Store ZIPs verified. |
| GitHub `v5.3.0` | 5.3.0 | Retained for audit; withdrawn from further promotion |

## Why `v5.3.0` is not the current authority

The immutable release was published from commit `c17aed7e7805f18bafe982e7558e8b5a0a6aeed2`. Subsequent testing found production-lane identity, local configuration, and Microsoft 365 visibility defects. The corrected code merged through [PR #67](https://github.com/Mr-GraphnStaff/better-captionkeep/pull/67) and is frozen separately as `v5.3.1`.

The original tag, hashes, provenance, and ZIPs remain unchanged for auditability. They were not replaced or submitted to a Store. The corrected 5.3.1 release moved through the single Azure pipeline for both Chrome and Edge.

## Current promotion evidence

- Azure run 589 uploaded the verified `v5.3.1` packages as drafts to the existing Chrome and Edge products.
- Azure run 590 passed the protected production approval and Microsoft accepted the Edge package for certification.
- [PR #68](https://github.com/Mr-GraphnStaff/better-captionkeep/pull/68) corrected the Chrome pipeline's handling of Google's short-lived upload-status field; 180 automated tests passed.
- Chrome retry run 594 identified the two missing Dashboard Privacy justifications. After they were saved, the product owner submitted 5.3.1; that review was later cancelled when the Microsoft 365 defect was confirmed, leaving Chrome 5.1.0 public.
- Redundant Chrome run 597 was canceled during cleanup without changing the submitted package.
- The private release VM was deallocated after the Store operations.

## 5.3.1 production incident

Edge began serving 5.3.1 on October 4, 2026. The Store identity and signed CRX are valid, but the package hides Microsoft 365 unless managed policy supplies the Graph configuration. Dev and UAT had been tested with a local overlay, which was not Store-equivalent evidence.

The canonical [after-action report and corrective action plan](https://github.com/Mr-GraphnStaff/better-captionkeep/blob/master/docs/INCIDENT-2026-10-04-EDGE-5.3.1.md) records the customer impact, timeline, five-whys analysis, accountability statement, permanent release gates, and tracked remediation work.

Azure Boards bug **#297** tracks the critical recovery. The earlier live tenant proof covered optional-permission approval, Microsoft sign-in, recent-meeting discovery, verified transcript import/viewer, live capture, and export. The final architecture requires a customer-owned single-tenant registration and stores its public tenant/client identifiers locally or through managed policy. Public resolution now requires Store approval, public availability, and upgrade verification.

Azure run **619** completed the protected workflow on October 4, 2026. Edge returned a successful certification submission, and Microsoft's public update service independently served the signed production CRX for extension `edefcbdhahfolgkoamkbknjppojpaffk` at 17:25 UTC. On October 6, the Chrome listing began serving 5.3.2; Google's public update service independently returned version 5.3.2 with SHA-256 `fc4dc4a94e6e63660c35d3b5d8a043395450702dd27834b2e120bcfc6e245c10`. The release VM remains deallocated. Bug #297 remains active only for installed-upgrade and post-upgrade smoke-test evidence.

## 5.4 development has started

Version 5.4 development began October 4, 2026 without modifying the frozen
5.3.2 artifacts. Its committed scope covers Canadian French and Spanish
localization and translation readiness, managed language deployment,
active-meeting reliability, production-defect remediation, and the permanent
release controls created after the 5.3.1 incident. Azure Boards Epic **#314**
is the lifecycle authority. See the repository's
[5.4 development record](https://github.com/Mr-GraphnStaff/better-captionkeep/blob/master/docs/RELEASE-5.4.md).

## Release terminology

- **Frozen:** source commit and package hashes are fixed.
- **Uploaded:** package exists as an unpublished Store draft.
- **In review:** Store certification is running.
- **Approved:** certification passed but publication may still be held.
- **Public:** the Store listing serves the version.
- **Upgrade verified:** an existing installation received and ran the public version.

See the repository's [5.3.2 recovery record](https://github.com/Mr-GraphnStaff/better-captionkeep/blob/master/docs/RELEASE-5.3.2.md), [5.3.1 release record](https://github.com/Mr-GraphnStaff/better-captionkeep/blob/master/docs/RELEASE-5.3.1.md), and [withdrawn 5.3.0 record](https://github.com/Mr-GraphnStaff/better-captionkeep/blob/master/docs/RELEASE-5.3.md).
