# Release Status

Last verified: **October 4, 2026**.

| Channel | Version | Status |
| --- | --- | --- |
| Chrome Web Store | 5.1.0 | Public and installable |
| Microsoft Edge Add-ons | 5.1.0 | Public and installable |
| GitHub `v5.3.0` | 5.3.0 | Retained for audit; withdrawn from further promotion |
| Corrected 5.3 patch | 5.3.1 candidate | PR #67; unified Azure Store pipeline promotion pending |

## Why `v5.3.0` is not the current authority

The immutable release was published from commit `c17aed7e7805f18bafe982e7558e8b5a0a6aeed2`. Subsequent testing found production-lane identity, local configuration, and Microsoft 365 visibility defects. The corrected code is in [PR #67](https://github.com/Mr-GraphnStaff/better-captionkeep/pull/67), not in the tag or published ZIPs.

The original tag, hashes, provenance, and ZIPs remain unchanged for auditability. They must not be silently replaced or submitted to a Store. The corrected 5.3.1 candidate must produce a new immutable GitHub release and move through the single Azure pipeline for both Chrome and Edge.

## Release terminology

- **Frozen:** source commit and package hashes are fixed.
- **Uploaded:** package exists as an unpublished Store draft.
- **In review:** Store certification is running.
- **Approved:** certification passed but publication may still be held.
- **Public:** the Store listing serves the version.
- **Upgrade verified:** an existing installation received and ran the public version.

See the repository's [5.3.1 release record](https://github.com/Mr-GraphnStaff/better-captionkeep/blob/master/docs/RELEASE-5.3.1.md) and [withdrawn 5.3.0 record](https://github.com/Mr-GraphnStaff/better-captionkeep/blob/master/docs/RELEASE-5.3.md).
