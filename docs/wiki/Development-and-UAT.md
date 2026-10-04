# Development and UAT

This page is for contributors and controlled testers—not ordinary Store installation.

## Three governed lanes

| Lane | Folder | Purpose |
| --- | --- | --- |
| Development | `dist/dev` | Current fixes and features |
| UAT / Release Candidate | `dist/uat` | Exact candidate being accepted |
| Local Production | `dist/prod` | Promoted behavior and release artifacts |

Do not create extra ad hoc build folders. Each unpacked lane has a fixed extension identity and separate local storage.

## Build and load

1. Install Node.js 20 or newer.
2. Run `npm install`.
3. Run `npm run build:targets`.
4. Open `chrome://extensions`, `brave://extensions`, or `edge://extensions`.
5. Enable Developer mode.
6. Select **Load unpacked** and choose exactly one lane folder containing `manifest.json`.

After a rebuild, use the extension card's circular **Reload** button. Do not select a ZIP or the `dist` parent folder.

## Promotion rule

```text
Development fix -> automated validation -> live UAT -> Production promotion -> Store submission -> public upgrade verification
```

A changed candidate returns to UAT. A GitHub release is not proof of Store publication.

See the repository's [release process](https://github.com/Mr-GraphnStaff/better-captionkeep/blob/master/docs/RELEASE_PROCESS.md) and [three-lane workflow](Three-Lane-Release-Workflow).
