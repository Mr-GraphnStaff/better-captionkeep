# Release Status

<!-- captionkeep-6.0-status:start -->
> **6.0 delivery status:** 6.0.0 is development on `codex/6.0-repair-96`. Candidate frozen: no.
> Live provider certification outstanding: chrome, edge, brave, firefox, opera.
> Open release gates: fullScopeAcceptance, accessibilityAndFailureUat, unchangedWindow, storeApproval, publicParity, installedUpgrade. Azure Boards epic: **#335**.
> This status does not change historical 5.4 publication records.
<!-- captionkeep-6.0-status:end -->

6.0 preparation updated: **October 24, 2026**. Historical Store observations below
were last verified **October 14, 2026**; they are not a fresh Store inspection.

The owner has given GO for release preparation, reported positive UAT, and
approved the bold DAF-TECH artwork. The artwork gate is complete. The owner requested repair of issue #96 and continuation of publication; the repaired candidate is being requalified with fresh hashes. The owner explicitly
authorized publication with the named acceptance and test-window exceptions;
those checks remain unpassed. Store rollout evidence is tracked separately above.
6.0 is already in the existing repository on `codex/6.0`; local 5.4 archival
did not delete GitHub history or promote `master`. Only production distribution
artifacts under `dist/prod` are published; Development and UAT builds stay local.


| Channel | Version | Status |
| --- | --- | --- |
| Chrome Web Store | 5.4.0 public; installed-upgrade smoke pending | Google's official listing serves version 5.4.0, updated October 11, 2026, with the corrected title and BYOAI summary. Existing-install upgrade and post-upgrade functional smoke verification remain open. |
| Microsoft Edge Add-ons | 5.4.0 and DAF-TECH listing refresh public; post-upgrade smoke pending | Microsoft's official listing serves version 5.4.0 and, as verified October 14, the refreshed description plus all five 5.4 screenshots. A managed Edge installation received 5.4.0, but the vendor `_metadata` warning recurred during the update; functional smoke verification remains open. |
| Frozen production release | 5.4.0 | GitHub release, hashes, SBOM, provenance, Store packages, Production checks, protected approval, and Store submissions are complete. Chrome and Edge are public; both installed-upgrade smoke tests remain open. |
| Repair and candidate requalification | 6.0.0 | Issue #96 is being repaired under the owner’s “Repair and continue” decision. The authoritative record identifies the repaired candidate and fresh hashes. Original package evidence is preserved; artwork approval and named acceptance exceptions remain. Store submission and public availability remain separate rollout outcomes. |
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

## 5.4.0 Store submission

Version 5.4.0 was frozen and published as an immutable GitHub release on
October 10, 2026. Production PR
[\#86](https://github.com/Mr-GraphnStaff/better-captionkeep/pull/86) merged commit
`515819599bcd0c9e3d6d97852d36ef3517e68ac8`. The Chrome Store ZIP SHA-256 is
`71B9E7A7BC504BEED19FE53A0B0E92CB2DB7E7CCB1E8BD1A30D7F0904291D39D`; the
Edge Store ZIP SHA-256 is
`EF52646237380B6812091ABE90E9C8D7775879506C671DE7061E23CDAFF83CD7`.

Azure run **716** downloaded and reverified those immutable assets, passed the
protected Production approval, submitted Chrome for immediate publication
after review, and submitted Edge for Microsoft certification. Chrome returned
`PENDING_REVIEW`; the Edge certification submission operation returned
`Succeeded`.

After the product owner corrected the Chrome listing, Azure run **731**
reverified and resubmitted the unchanged package for automatic publication.
On October 12, Google's official listing was verified serving **Version 5.4.0**
with an **Updated October 11, 2026** date, the corrected product title, and the
BYOAI summary. Chrome public availability is verified; successful
existing-install upgrade and post-upgrade functional smoke testing remain open.

Later on October 10, Microsoft's public Edge Add-ons listing independently
served **Version 5.4.0** with an **Updated October 10, 2026** date. A managed
Edge installation also received 5.4.0 after the user selected **Update**, but
Edge again displayed the Store-generated `_metadata` reserved-name warning
tracked in [Microsoft issue #820](https://github.com/microsoft/MicrosoftEdge-Extensions/issues/820).
The immutable submitted ZIP contains no `_metadata` entry. Public availability
is verified; successful post-upgrade functional smoke testing remains open.

On October 14, Microsoft's official Edge Add-ons listing was verified serving
the refreshed DAF-TECH description and all five 5.4 screenshots. The public
listing now presents the three supported meeting platforms, explicit meeting
controls, On the Fly research, reviewed BYOAI handoff, and enterprise controls.
The listing refresh is public; the installed-upgrade smoke gate remains open.

The product owner accepted clean UAT and explicitly authorized an early
full-pipeline release. The normal unchanged 48-hour observation window was
shortened; the release record does not represent that gate as completed. Azure
Boards Epic **#314**, release task **#333**, discovery task **#334**, and canary
task **#304** remain the lifecycle authority. See the repository's
[5.4 release record](https://github.com/Mr-GraphnStaff/better-captionkeep/blob/master/docs/RELEASE-5.4.md)
and [immutable GitHub release](https://github.com/Mr-GraphnStaff/better-captionkeep/releases/tag/v5.4.0).

## Release terminology

- **Frozen:** source commit and package hashes are fixed.
- **Uploaded:** package exists as an unpublished Store draft.
- **In review:** Store certification is running.
- **Approved:** certification passed but publication may still be held.
- **Public:** the Store listing serves the version.
- **Upgrade verified:** an existing installation received and ran the public version.

See the repository's [5.3.2 recovery record](https://github.com/Mr-GraphnStaff/better-captionkeep/blob/master/docs/RELEASE-5.3.2.md), [5.3.1 release record](https://github.com/Mr-GraphnStaff/better-captionkeep/blob/master/docs/RELEASE-5.3.1.md), and [withdrawn 5.3.0 record](https://github.com/Mr-GraphnStaff/better-captionkeep/blob/master/docs/RELEASE-5.3.md).

## October 24 owner publication exception

David Farris explicitly selected “Publish with a documented owner exception.”
The source/package-bound [authorization report](https://github.com/Mr-GraphnStaff/better-captionkeep/blob/release/6.0/docs/release-state/6.0-owner-exception.md)
records positive owner UAT, missing exact-case evidence, unchanged permissions
and the waived unchanged-window requirement. No missing certification becomes
a passed test. Promotion continues through PR174 and existing Store review.
