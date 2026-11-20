# Better CaptionKeep 6.0.3 release status

Updated November 20, 2026. **6.0.3 is the current release being submitted to Chrome Web Store and Microsoft Edge Add-ons.** Store review and public availability must be confirmed separately; this page does not claim either is complete.

## Current versions

| Component | Current version and status |
| --- | --- |
| Extension release | 6.0.3 — owner authorized publication; submission receipts pending |
| Signed Windows Administrator Setup | 6.0.3 — downloadable signed installer |
| Public Store baseline | Last recorded observation: 6.0.0; refresh after 6.0.3 approval |

<!-- captionkeep-6.0.3-status:start -->
> **6.0.3 delivery status:** 6.0.3 is candidate on `master`. Candidate frozen: yes.
> Live provider certification outstanding: chrome, edge, brave, firefox, opera.
> Open release gates: fullScopeAcceptance, accessibilityAndFailureUat, unchangedWindow, storeApproval, publicParity, installedUpgrade. Azure Boards epic: **#395**.
> Owner publication exception: David Farris; accepted unfinished gates: fullScopeAcceptance, accessibilityAndFailureUat, unchangedWindow; live certifications: chrome, edge, brave, firefox, opera. These checks remain unpassed.
> This development record does not change prior publication records or inherit prior owner exceptions.
<!-- captionkeep-6.0.3-status:end -->

## Guided Microsoft 365 setup. Deploy Better CaptionKeep with Intune.

Open **All Settings → Microsoft 365 → Open administrator setup**. If prompted to install, download and run the signed Windows installer once, then return to the extension. Downloading alone does not install or launch it. Sign in as an authorized administrator, choose Edge or Chrome and a pilot group, review proposed changes, then approve. Verify the pilot before expanding. Microsoft licensing and administrator authority apply; local caption capture does not require setup.

The locally loaded QA copy has a different identity from the Store editions. Its installed connector rejects that QA identity, tracked in [issue #221](https://github.com/Mr-GraphnStaff/better-captionkeep/issues/221). Production-ID end-to-end setup remains unverified. The owner directed publication with these gaps and incomplete acceptance recorded, not passed.

Use the [6.0.3 machine record](https://github.com/Mr-GraphnStaff/better-captionkeep/blob/master/docs/release-state/6.0.3.json), [release notes](https://github.com/Mr-GraphnStaff/better-captionkeep/blob/master/docs/RELEASE-6.0.3.md), and [publication decision](https://github.com/Mr-GraphnStaff/better-captionkeep/blob/master/docs/release-state/6.0.3-owner-publication.md).

## Historical versions

6.0.1 and 6.0.2 were unpublished development labels, superseded by 6.0.3. [6.0.0](https://github.com/Mr-GraphnStaff/better-captionkeep/blob/master/docs/RELEASE-6.0.md) and [5.4](https://github.com/Mr-GraphnStaff/better-captionkeep/blob/master/docs/RELEASE-5.4.md) remain historical records, not current release instructions.
