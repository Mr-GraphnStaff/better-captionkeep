# Chrome Web Store submission procedure

The canonical listing copy, privacy answers, permissions and OAuth-scope justifications, artwork inventory, reviewer instructions, developer information, version history, and known limitations are maintained in [`CHROMEWEBSTORE.md`](../CHROMEWEBSTORE.md). Do not copy or independently edit those fields here.

This procedure updates the existing public Chrome item without changing the Microsoft Edge Add-ons submission. Version 5.3 remains a candidate until its live and review gates pass.

## Build and identify the candidate

1. Verify the intended source commit and clean working tree.
2. Run `npm ci` and `npm run release:candidate`.
3. Preserve `dist/prod/release-provenance.json` and the exact ZIP at `dist/prod/better_captionkeep-chrome-5.3.0.zip`.
4. Confirm the provenance commit and the ZIP's SHA-256 match the release record.
5. Load `dist/uat` through `chrome://extensions` and complete the Chrome UAT matrix.
6. Confirm the installed name is **Better CaptionKeep - UAT Release Candidate** and the version is **5.3.0**.

Do not upload anything from `dist/dev` or `dist/uat`; upload only the verified ZIP from `dist/prod`.

## Required pre-upload evidence

- The new delegated `Calendars.ReadBasic` consent is active in the controlled tenant.
- Current-meeting, recent-five, and manual-link imports pass in Chrome and Edge.
- Missing transcript, denied meeting, expired/revoked access, disconnect, disabled transcript access, and unattributed transcript behavior are recorded.
- Teams, Google Meet, Zoom Web, Evidence Board, Scrubby, history, copy, and export regressions pass.
- A second reviewer approves the authentication, storage, provenance, managed-policy, privacy, and Store-disclosure changes.
- The exact candidate remains unchanged for at least 48 hours of live validation.
- `CHROMEWEBSTORE.md` and `PRIVACY.md` still match the packaged behavior.

## Dashboard sequence

1. Run the Chrome publishing preflight and confirm the existing item identity and current public version without uploading.
2. Upload only the verified Chrome Store ZIP through the controlled release pipeline.
3. Copy the reviewed fields from `CHROMEWEBSTORE.md` into **Store listing**, **Privacy**, **Distribution**, and **Test instructions**.
4. Upload the exact reviewed assets listed in `CHROMEWEBSTORE.md`; do not substitute historical artwork or any image containing real meeting data.
5. Confirm the existing verified publisher contact and current regional distribution in the dashboard.
6. Keep automatic publication disabled unless the release owner explicitly authorizes staged automatic publication.
7. Review the uploaded draft version, package hash, privacy disclosures, artwork, and reviewer instructions before selecting **Submit for review**.
8. Verify the submitted version and status after mutation. Store approval, publication, and availability to existing users are separate facts and must each be recorded.

## Authorization boundary

A successful build, preflight, or live test does not authorize upload, submission, publication, tenant-wide consent, or deployment. Those mutations require explicit release-owner approval through the governed release environment.
