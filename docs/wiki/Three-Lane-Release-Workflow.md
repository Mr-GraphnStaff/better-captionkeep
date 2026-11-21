# Three-lane release workflow

Better CaptionKeep uses a governed Git promotion route:

```text
Scoped work branch → dev → qa → master → tagged release → Store submission → public/installed verification
```

Branch names, build directories, releases and Store availability are separate states. The customer-facing [Release status](Release-Status) records actual downloads and dated Store observations.

## Development

- Begin a focused change on a scoped branch such as `codex/<task>` and open its pull request into `dev`.
- Validate the exact source and merge preview. Required checks and review must pass; a backup/recovery draft is not merge-ready work.
- Keep unpublished/deferred work out of the released product scope. Record confirmed defects and remaining acceptance without exposing private records.

## QA

- Promote `dev` into `qa` through a pull request; do not skip directly from a feature branch to Production.
- Development must include current Production before QA promotion. Retest the actual candidate and affected browser/provider workflows.
- Record commit, package hashes, permissions, required acceptance and any explicitly authorized source/package-bound exception. A changed candidate needs renewed affected testing.
- Retain unfinished checks as unfinished. The normal unchanged-candidate window and any permitted exception are evidence requirements, not inferred from a branch name or elapsed calendar time.

## Production

- Promote `qa` into `master` through the required pull request, automated checks and QA-acceptance environment decision.
- The proposed Production merge tree must match the reviewed QA candidate. A stale event, changed source or failed check blocks promotion.
- A source merge is not a new product publication. Tagged release packaging and Store actions have their own frozen-source, artifact, approval and identity checks.
- GitHub publication, Store upload/review, Store approval/publication and an installed upgrade must be reported separately. Never mark a failed or unperformed check passed to make a release appear complete.

## Local build directories

The currently published build scripts use `dist/dev`, `dist/uat` and `dist/prod`; these are build targets, not extra Git branches. Work-branch layouts can differ. Follow the exact revision's scripts and [Development and controlled testing](Development-and-UAT), preserve active installations/recovery records and verify the selected extension identity after loading a package.

## Documentation and support

Repository documentation follows reviewed PR/promotion controls. The Wiki has its own version history; verify published page contents after an update and keep its source mirrors aligned. Customer pages should state current user actions and known limitations; retain source-freeze history as clearly labeled maintainer evidence.

Use the [current source release record](https://github.com/Mr-GraphnStaff/better-captionkeep/blob/master/docs/release-state/6.0.3.json), [release process](https://github.com/Mr-GraphnStaff/better-captionkeep/blob/master/docs/RELEASE_PROCESS.md), [Release status](Release-Status) and [Support](Support). Historical tags and records remain evidence of their own versions; deleted development branch names are not current installation or promotion instructions.
