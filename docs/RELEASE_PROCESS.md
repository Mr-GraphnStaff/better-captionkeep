# Release Process

This process keeps the Microsoft Edge Add-ons production package separate from unfinished development.

## Branch roles

- `master`: protected production baseline; no direct development.
- `release/<version>`: temporary integration and release-candidate branch.
- Topic branches: individual fixes, features, documentation, or maintenance changes.

Contributors submit pull requests from topic branches. Work for an upcoming version normally merges into its release branch. The release branch reaches `master` only after the complete release gate passes.

## Preserve a pending store submission

Record the submitted ZIP hash, manifest version, source commit, and Partner Center status. Do not replace or cancel a submission under certification merely to include unrelated development.

If Microsoft requests a narrow correction, create a hotfix branch from the exact submitted source commit. Do not merge unfinished next-version work into the correction.

## Release gate

Before opening the release pull request:

1. Confirm the intended issue list and permission changes.
2. Run `npm ci`, `npm run lint`, and `npm run build` from a clean checkout.
3. Confirm local-only files, signing keys, archives, and sensitive meeting data are absent from Git and the package.
4. Load the packaged extension in Microsoft Edge.
5. Test capture, recovery, TXT and Markdown exports, Save As, session history, and any changed settings.
6. Test the supported Teams web/PWA domains and all affected window states, including minimized and restored behavior when relevant.
7. Update the README, privacy disclosure, store copy, and certification notes when behavior or data handling changed.
8. Review the exact diff and package contents before approval.

After approval, merge the release pull request into `master`, tag the release, and build the store package from that tag. Save the package hash and submitted commit in the release record.
