# Three-Lane Release Workflow

Better CaptionKeep uses one source checkout with `dist/dev`, `dist/uat`, and `dist/prod`, and one lifecycle with three lanes. UAT is the proposed Production behavior; promotion must not silently remove features.

## Development

- Fixes and features begin on a scoped branch.
- Automated tests, extension validation, security checks, and review run against the exact commit.
- Candidate defects return here for correction.

## UAT / Release Candidate

- The single `release/<version>` integration branch receives approved Development changes through reviewed pull requests. Version 6.0 work is currently on `codex/6.0`; its presence on GitHub is not proof of promotion.
- Chrome, Edge, Brave, Firefox, and Opera each need recorded live browser/provider acceptance for 6.0. Firefox uses its adapted target under `dist/prod`, not the Chromium UAT manifest.
- The frozen candidate commit, package hashes, tester and results are recorded. The exact candidate must complete the required 48 uninterrupted hours of testing before publication.
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

For the exact current status, use [Release status](Release-Status) and the [6.0 release record](https://github.com/Mr-GraphnStaff/better-captionkeep/blob/codex/6.0/docs/RELEASE-6.0.md). Owner GO and artwork approval are decisions; candidate freeze, test evidence, Store approval, public listing parity, and installed-upgrade verification are separate recorded outcomes.
