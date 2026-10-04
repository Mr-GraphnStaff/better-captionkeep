# Release Status

## 5.3.0

- The immutable GitHub tag and release exist publicly.
- The GitHub release is not proof of public Chrome Web Store or Microsoft Edge Add-ons availability.
- Production-lane regressions discovered after UAT are being corrected through [PR #67](https://github.com/Mr-GraphnStaff/better-captionkeep/pull/67) and Azure Boards Bug 295.
- Store submission must use a newly accepted, verified artifact. Existing public release assets are not silently replaced.

## Store terminology

- **Frozen:** source commit and package hashes are fixed.
- **Uploaded:** package exists as an unpublished Store draft.
- **In review:** Store certification is running.
- **Approved:** certification passed but publication may still be held.
- **Public:** the Store listing serves the version.
- **Upgrade verified:** an existing installation received and ran the public version.

The current authoritative release evidence is maintained in the repository's [release records](https://github.com/Mr-GraphnStaff/better-captionkeep/tree/master/docs).
