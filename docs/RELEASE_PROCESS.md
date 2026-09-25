# Release Process

This process keeps the Microsoft Edge Add-ons production package separate from unfinished development.

## Two-week release cadence

Better CaptionKeep uses a rolling two-week release cadence. Day 0 is the date
the latest approved extension update is publicly available and an existing
installation can receive it. Creating a tag, publishing a GitHub release, or
submitting a package for store certification does not start the clock.

When the same version reaches supported stores on different dates, use the
later public-availability date as Day 0. This prevents work on the next train
from consuming the validation and rollout window of the release still becoming
available. Record the public dates and upgrade evidence in the release record.

Each cycle follows this rhythm:

1. **Days 0-1:** confirm the public upgrade, review feedback and dependency
   alerts, and select the next train's issues.
2. **Days 2-8:** implement scoped work through topic-branch pull requests.
3. **Day 9:** lock scope and cut or refresh `release/<version>`.
4. **Days 10-12:** run automated validation, browser UAT, package inspection,
   privacy review, and affected enterprise-deployment checks.
5. **Day 13:** hold the go/no-go review and record the approved source commit,
   artifact hashes, known limitations, and release owner.
6. **Day 14:** publish the immutable GitHub release and submit the exact
   verified artifact to the applicable browser stores.

Store certification is asynchronous. The next cycle does not begin until the
submitted update becomes public under the Day 0 rule above. If no change
satisfies the release gate, skip the train rather than lowering the gate or
publishing an empty release. Work that misses scope lock moves to the following
train. An urgent security or production fix may use a narrow hotfix branch
outside the train, but it must still pass the applicable gate and preserve
artifact evidence.

### Minimum release-candidate test window

The exact release candidate must complete at least 48 uninterrupted hours of
testing before publication. Record the candidate commit, packaged-artifact
hashes, test-window start and end times, browsers tested, results, and tester.
Any source, manifest, dependency, packaging, or release-artifact change resets
the 48-hour clock. Documentation-only evidence updates do not reset the clock
when they do not alter the packaged extension.

Automated checks may run before or during the window, but they do not replace
live browser testing. The final go/no-go review must confirm that the same
candidate completed the full window with no unresolved release-blocking defect.

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
