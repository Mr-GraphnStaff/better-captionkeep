# Development and UAT

This page is for contributors and controlled testers. Version 6.0 is in release qualification; a build in `dist/prod` does not by itself mean that the version is public or approved by a Store.

## One source checkout, three build lanes

The active source checkout is `P:\Projects\better-captionkeep-dev`. Do not create separate source folders for Development, UAT, or Production.

| Lane | Folder beneath the source checkout | Purpose |
| --- | --- | --- |
| Development | `dist/dev` | Current fixes and features |
| UAT / Release Candidate | `dist/uat` | The Chromium candidate being accepted |
| Production | `dist/prod` | Production-target packages and release evidence |

The three Chromium lane roots have fixed extension identities and separate local storage. Browser-specific packages under Production are target artifacts, not additional lifecycle lanes. Only verified `dist/prod` artifacts are uploaded as release distributions. Development and UAT builds are not published.

## Build and load Chromium UAT

1. Use Node.js 22 or newer, as required by `package.json`.
2. Run `npm ci` in the source checkout.
3. Run `npm run build:uat` for UAT, or `npm run build:dev` for Development. Each command rebuilds its selected lane.
4. Open `chrome://extensions`, `edge://extensions`, `brave://extensions`, or `opera://extensions` in the intended browser profile.
5. Enable Developer mode and select **Load unpacked**.
6. Choose `P:\Projects\better-captionkeep-dev\dist\uat` for UAT, or the corresponding `dist/dev` folder for Development.

Choose the folder containing `manifest.json`, not a ZIP or the `dist` parent. After rebuilding, use the extension card's **Reload** control and verify the loaded path and version. Avoid rebuilding a frozen candidate; changes must be reconciled with its recorded source and hashes.

## Firefox target

Firefox requires the adapted Firefox package. Do not load the Chromium `dist/uat` manifest into Firefox. Release preparation creates `dist/prod/firefox-unpacked`; controlled temporary testing uses `about:debugging` → **This Firefox** → **Load Temporary Add-on**, selecting that target's `manifest.json`. A temporary installation is not a signed Mozilla Store installation or proof of live provider certification.

## Acceptance and promotion

Chrome, Edge, Brave, Firefox, and Opera each require their own recorded live browser/provider acceptance for 6.0. Positive owner UAT is recorded separately from exact candidate identity and full certification. See [Release status](Release-Status).

```text
Development -> automated validation -> live UAT -> accepted candidate -> Production promotion -> Store submission -> public upgrade verification
```

A changed candidate requires renewed affected testing. Record the frozen commit, package hashes, tester, browser and provider results, and the normal unchanged-candidate window or an explicitly documented owner exception. See the [6.0 release record](https://github.com/Mr-GraphnStaff/better-captionkeep/blob/codex/6.0/docs/RELEASE-6.0.md), [release process](https://github.com/Mr-GraphnStaff/better-captionkeep/blob/codex/6.0/docs/RELEASE_PROCESS.md), and [three-lane workflow](Three-Lane-Release-Workflow).
