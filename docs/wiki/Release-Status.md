# Release Status

Last verified: **October 4, 2026**.

| Channel | Version | Status |
| --- | --- | --- |
| Chrome Web Store | 5.1.0 public; 5.3.1 draft | The verified package is uploaded. Google rejected submission until the Developer Dashboard listing and privacy metadata are completed for the new permissions and Microsoft hosts. |
| Microsoft Edge Add-ons | 5.1.0 public; 5.3.1 submitted | Microsoft accepted 5.3.1 for certification in Azure run 590. |
| GitHub `v5.3.1` | 5.3.1 | Published immutable release; source commit, checksums, provenance, and Store ZIPs verified. |
| GitHub `v5.3.0` | 5.3.0 | Retained for audit; withdrawn from further promotion |

## Why `v5.3.0` is not the current authority

The immutable release was published from commit `c17aed7e7805f18bafe982e7558e8b5a0a6aeed2`. Subsequent testing found production-lane identity, local configuration, and Microsoft 365 visibility defects. The corrected code merged through [PR #67](https://github.com/Mr-GraphnStaff/better-captionkeep/pull/67) and is frozen separately as `v5.3.1`.

The original tag, hashes, provenance, and ZIPs remain unchanged for auditability. They were not replaced or submitted to a Store. The corrected 5.3.1 release moved through the single Azure pipeline for both Chrome and Edge.

## Current promotion evidence

- Azure run 589 uploaded the verified `v5.3.1` packages as drafts to the existing Chrome and Edge products.
- Azure run 590 passed the protected production approval and Microsoft accepted the Edge package for certification.
- [PR #68](https://github.com/Mr-GraphnStaff/better-captionkeep/pull/68) corrected the Chrome pipeline's handling of Google's short-lived upload-status field; 180 automated tests passed.
- Chrome retry run 594 reached Google's publish endpoint and returned `INVALID_ITEM_METADATA`. The package remains a draft. Dashboard listing and privacy fields must be completed before another submission attempt.
- The private release VM was deallocated after the Store operations.

## Release terminology

- **Frozen:** source commit and package hashes are fixed.
- **Uploaded:** package exists as an unpublished Store draft.
- **In review:** Store certification is running.
- **Approved:** certification passed but publication may still be held.
- **Public:** the Store listing serves the version.
- **Upgrade verified:** an existing installation received and ran the public version.

See the repository's [5.3.1 release record](https://github.com/Mr-GraphnStaff/better-captionkeep/blob/master/docs/RELEASE-5.3.1.md) and [withdrawn 5.3.0 record](https://github.com/Mr-GraphnStaff/better-captionkeep/blob/master/docs/RELEASE-5.3.md).
