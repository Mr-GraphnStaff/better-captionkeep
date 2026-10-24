# Three-Lane Release Workflow

Better CaptionKeep uses one source checkout with `dist/dev`, `dist/uat`, and `dist/prod`, and one lifecycle with three lanes. UAT is the proposed Production behavior; promotion must not silently remove features.

## Development

- Fixes and features begin on a scoped branch.
- `codex/6.0` is a Development branch; `release/6.0` is the 6.0 release integration branch.
- Automated tests, extension validation, security checks, and review run against the exact commit.
- Candidate defects return here for correction.

## UAT/Release Candidate

- The single `release/<version>` integration branch receives approved Development changes through reviewed pull requests. Its presence on GitHub is not proof of promotion; current candidate identity and freeze state belong in the machine release record and Release status.
- Chrome, Edge, Brave, Firefox, and Opera each need recorded live browser/provider acceptance for 6.0. Firefox uses its adapted target under `dist/prod`, not the Chromium UAT manifest.
- Record the frozen candidate commit, package hashes, tester and actual results. The normal rule requires 48 uninterrupted hours on the unchanged candidate. An explicitly authorized, source/package-bound owner exception must remain labeled as an exception; it never establishes elapsed time or a passed test.
- A changed candidate requires renewed affected testing.

## Production

- Production promotes the accepted behavior; it does not become a different feature edition.
- The local Prod lane has a fixed unpacked identity; Store builds keep their separate Store-assigned identities.
- `master`, the release tag, GitHub release artifacts, Azure Boards state, and pipeline evidence must agree.
- Only verified artifacts from `dist/prod` are uploaded as release distributions. `dist/dev` and `dist/uat` are not published.
- Browser Store submission is a separate controlled step.
- Archiving the local 5.4 checkout preserves history; it does not remove GitHub tags, change Store availability, or merge 6.0 into `master`.

## Promotion rule

```text
Development fix -> automated validation -> UAT acceptance -> Production promotion -> Store submission -> public upgrade verification
```

A GitHub tag or release is not proof that a browser Store update is public. The release record must distinguish frozen, uploaded, in review, approved, public, and upgrade verified.

For the exact current status, use [Release status](Release-Status), the [machine release record](https://github.com/Mr-GraphnStaff/better-captionkeep/blob/release/6.0/docs/release-state/6.0.json), and the [6.0 release record](https://github.com/Mr-GraphnStaff/better-captionkeep/blob/release/6.0/docs/RELEASE-6.0.md). Owner GO, artwork approval and accepted exceptions are decisions; candidate freeze, test evidence, Store approval, public listing parity and installed-upgrade verification are separate recorded outcomes.
