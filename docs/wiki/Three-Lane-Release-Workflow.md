# Three-Lane Release Workflow

Better CaptionKeep uses one lifecycle with three lanes. UAT is the proposed Production behavior; promotion must not silently remove features.

## Development

- Fixes and features begin on a scoped branch.
- Automated tests, extension validation, security checks, and review run against the exact commit.
- Candidate defects return here for correction.

## UAT / Release Candidate

- One candidate line receives the approved Development changes.
- Chrome, Edge, and affected provider behavior are tested live.
- The candidate commit and package hashes are recorded.
- A changed candidate requires renewed affected testing.

## Production

- Production promotes the accepted behavior; it does not become a different feature edition.
- `master`, the release tag, GitHub release artifacts, Azure Boards state, and pipeline evidence must agree.
- Browser Store submission is a separate controlled step.

## Promotion rule

```text
Development fix -> automated validation -> UAT acceptance -> Production promotion -> Store submission -> public upgrade verification
```

A GitHub tag or release is not proof that a browser Store update is public. The release record must distinguish frozen, uploaded, in review, approved, public, and upgrade verified.
