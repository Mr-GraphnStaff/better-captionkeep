# Dev -> QA -> Production

Owner direction, November 11, 2026. One repository, three source branches:

This control-plane setup changes executable promotion workflows, policy
checks/tests, validation routing, and supporting documentation. Review and QA
acceptance cover those controls. It changes no extension runtime source,
published package, or Store submission.

| Source branch | Build folder | Promotion |
| --- | --- | --- |
| `dev` | `Dev` | Reviewed feature/fix PR -> `dev` |
| `qa` | `QA` | PR from `dev` only |
| `master` | `Production` | PR from `qa` only, after QA acceptance |

Generated build folders stay ignored. Switching branches does not refresh them.
Commit changes before creating a candidate; test and record the exact candidate
commit and package hashes. Never treat an old folder's contents as a new build.

## Normal work

1. Start a scoped `codex/*`, `feature/*`, or `fix/*` branch from current `dev`.
   Keep unrelated work separate. Submit a PR to `dev`; automated checks must pass.
2. Open `dev` -> `qa`. Passing automated validation is required. Build and test
   the exact merged QA commit, recording the commit, artifacts, hashes, results,
   tester, and remaining acceptance in the release record.
3. Open `qa` -> `master`. Review the candidate evidence, then approve the
   `qa-acceptance` environment deployment on that PR's workflow run. This is an
   explicit QA decision, not automatic approval from unit tests. Only the owner
   is configured as approver. A new push invalidates the old candidate and needs
   fresh approval; final revalidation rejects approval of an obsolete revision.
4. Merge only when required checks pass. Production's merge-result source tree
   must equal the tested QA source tree. Resolve divergence in Development and
   repeat QA; never resolve it only in the production PR.
5. Tag the approved production commit and follow the existing immutable release
   packaging, hash verification, Azure approval and browser Store process.
   Source promotion alone neither publishes nor changes an installed extension.
6. Before the next candidate, create a scoped sync branch from `dev`, merge the
   latest `qa` and `master` histories into it, and submit it to `dev`. Direct
   lane back-merges are rejected. This also keeps strict up-to-date checks happy.

## Controls and limits

The required native `route-<branch>` and `promote-<branch>` Actions checks reject skipped lanes, foreign-repository heads,
changed head/base revisions and production merge results differing from QA.
It runs the base branch's trusted policy, with read-only permissions and no PR
code execution. Merge-bound `lane-*` commit statuses provide additional audit
evidence. `validate` and existing CodeQL checks remain required.

Active server rules must require PRs/checks on `dev`, `qa`, and `master`, block
deletion/force pushes, and give no routine administrator bypass. The QA approval
environment must require the owner and disable admin bypass. Configuration is
not considered active until read back from GitHub. A repository administrator
can still deliberately change repository settings; these controls do not make
that impossible. Local commands can still write build folders, so retained
Production must not be rebuilt just to inspect a development change.

Existing 6.0 release evidence and owner exceptions remain historical records;
they do not approve future candidates. Existing unrelated uncommitted changes
must be preserved and reviewed separately, not swept into workflow setup.
