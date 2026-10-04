# Better CaptionKeep 5.3.1 Release Record

Status: **In review in both Stores**. Version 5.3.1 replaces the withdrawn 5.3.0 promotion candidate. Microsoft accepted it for Edge certification, and Google accepted the existing verified Chrome draft for review after the required Dashboard Privacy justifications were saved.

## Purpose

Version 5.3.1 retains the reviewed 5.3 feature set while correcting the post-release defects found in the production lane:

- Dev, UAT, and local Prod use separate stable unpacked identities.
- The authorized local Microsoft Graph configuration is available consistently across those three controlled test lanes without entering Store packages.
- Production labeling and directly loadable `dist/prod` output remain separate from UAT.
- Microsoft 365 connection controls remain visible only when the approved configuration is present.
- The public Wiki and Store dossier distinguish local live-caption capture from tenant-retained Microsoft 365 transcription.

## Artifact and promotion path

1. Merge the approved recovery pull request to protected `master`.
2. Tag the exact merge commit `v5.3.1`.
3. Let the GitHub release workflow run the complete release-candidate gate and create a draft release containing both Store ZIPs, checksums, provenance, and runtime SBOM.
4. Review and publish the immutable GitHub release without replacing its generated assets.
5. Queue **Better CaptionKeep Store Release** with `releaseTag: v5.3.1`, `chromePrepare: upload-only`, and `edgePrepare: upload-only`.
6. Review the resulting Chrome and Edge drafts against the recorded hashes and Store metadata.
7. Queue the approved Chrome and Edge submission actions through the `bck-store-production` environment.
8. Record **In review**, **Approved**, **Public**, and **Upgrade verified** separately for each Store.

The Store pipeline downloads and verifies the frozen GitHub release. It does not rebuild the extension and does not create a second Store product.

## Required evidence

- Complete automated tests, lint, security audit, Store metadata validation, package inspection, and release verification.
- Live Chrome and Edge testing of Teams, Google Meet, Zoom Web, history, Evidence Board, Scrubby, settings, and exports.
- Controlled Microsoft 365 sign-in and synthetic official-transcript import using the exact registered redirect for the installed identity.
- Candidate commit, Store ZIP hashes, browser versions, tester, and unchanged-candidate window.
- Release-owner approval at the production Store environment.

## Store identity

This release updates the existing public products:

- Chrome extension ID: `nabjdlnkkaonnbnimnmnhjcbigceebml`
- Edge CRX ID: `edefcbdhahfolgkoamkbknjppojpaffk`
- Edge Product ID: `0e48419c-ed3f-4a9c-808b-5578a195c81b`

The existing Edge 5.1.0 draft is a submission attached to the same product. The Azure pipeline replaces its package with the verified 5.3.1 artifact; it does not create another extension.

## Promotion record

- GitHub release `v5.3.1` was published from merge commit `945cbb34df94e41e17189ba2389b8dbc9955c951` after release verification.
- Azure run 589 uploaded both verified Store packages as drafts without submitting them.
- Azure run 590 passed the `bck-store-production` approval. Edge submission succeeded and Microsoft accepted 5.3.1 for certification.
- Chrome submission in run 590 exposed an incorrect local guard when Google omitted the completed upload state. [PR #68](https://github.com/Mr-GraphnStaff/better-captionkeep/pull/68) fixed the helper and added regression coverage without changing the Store package.
- Chrome-only retry run 594 reached Google successfully and identified missing Dashboard justifications for `identity` and `unlimitedStorage`. After those fields were saved, the product owner submitted the existing verified 5.3.1 draft and Google accepted it for review.
- Redundant Chrome run 597 was canceled during cleanup without changing the submitted package, and the private release VM was deallocated.
- Public Store listings continue to serve 5.1.0 until their respective reviews and publication steps finish.
