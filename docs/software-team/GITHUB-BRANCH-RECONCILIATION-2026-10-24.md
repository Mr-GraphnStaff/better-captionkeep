# GitHub branch reconciliation — October 24, 2026

Baseline: `master` at `1aaba1c3d41d3dd8dede5685db5bd27bf340b345`. Ishan audited branch history and actual implementation changes; Lena independently reviews disposition and preservation. This is repository housekeeping and documentation, not a product release.

## Branch dispositions

| Historical work branch | Preserved head | Disposition evidence |
|---|---|---|
| `codex/security-architecture-enterprise` | `a5262502dad4c6dd3ff06cb5ffbae59cd71651f1` | Ancestor of master; later integrated through PR #61. |
| `codex/teams-caption-stabilization` | `0c72982775f1404ebaced8ddb70d3028f222467a` | Runtime superseded by `a1ca80e`; focused-test retention difference tracked separately. |
| `codex/zoom-web-discovery` | `408add751f154a5b0bcb11eb2fd2a52177925bbf` | Reapplied as `9468ed8` and `d5c77ef`; inspected provider/content/fixture payload retained. |
| `feature/archive-search` | `c91a7c111bf3e6b5a996ab338a726356a511c5ae` | Ancestor of master; later integrated through PR #61. |
| `feature/complete-ai-handoff` | `f65ba934c1c74cacfb0eac7c8455674797923018` | Reapplied as `4d98c58`; handoff module and regression test identical at landing. |
| `feature/docx-export` | `a58f7ce871964b588c7dda49c3ffcef3db7afbda` | Ancestor of master; later integrated through PR #61. |
| `feature/local-transcript-archive` | `57cd22efce0d9ad105d4bb18026ddb3c34f70a35` | Ancestor of master; later integrated through PR #61. |
| `feature/transcript-corrections` | `5e0dcc842ca5a46af2c0dd2d44135d7347657e65` | Ancestor of master; later integrated through PR #61. |

Closed original PRs and nonzero branch-only commit counts were not treated as proof of missing work. Rebased/adapted implementations were inspected rather than merging obsolete branches wholesale.

## Preservation and verification

Before retirement, all ten original remote branch tips and the full available Git history were captured in a verified recoverable local bundle. The working tree was separately preserved with a binary patch and per-file SHA-256 inventory. No branch protection or release-tag protection is changed by this cleanup.

The original Teams buffer tests are a real retention difference: their five unchanged definitions were run against the pinned master module and passed 5/5, but they are not currently retained as five focused tests in master. [Issue #183](https://github.com/Mr-GraphnStaff/better-captionkeep/issues/183) records restoration acceptance alongside existing checkpoint/recovery tests. This result does not certify live Teams behavior or identify a newly confirmed production defect.

## Retained branches and active work

- `master`: protected production source.
- `release/5.0`: protected historical baseline, not an active 6.0 development lane.
- `codex/market-research-nadia`: the scoped active work branch for the portable Software Team and bounded research documentation PR.

The public change contains the portable Software Team 1.0.11 / roster 1.0.6 package and bounded research documents. Internal personnel evaluations, candidate comparisons, account-specific host details and unrelated local configuration are excluded. Public research distinguishes desk findings from implementation and live acceptance.

## Execution status

Preservation and branch audit are complete. Lena independently restored all ten original remote tips from the bundle, verified reachable objects and repository integrity, checked the branch dispositions, and reran the five historical buffer assertions successfully. Codex then retired exactly the eight work branches through one atomic operation with exact-head preconditions. The post-operation inventory contained only protected `master` and `release/5.0`, both at their original tips.

The scoped active work branch is published only for its reviewed PR and is eligible for normal deletion after merge. Required PR checks are recorded on that PR; this document does not predeclare them passed.

The frozen v6.0.0 tag and published release assets are outside the change. No runtime source or Store package is edited.

## Nonshipping validation boundary

The initial PR validation passed 454 product tests but rejected the committed skill/research changes as differences from the frozen candidate. [Issue #178](https://github.com/Mr-GraphnStaff/better-captionkeep/issues/178#issuecomment-6385508664) records this related CI-routing defect; Azure work item 346 retains the linked release tracking.

The correction separates narrowly classified nonshipping changes from candidate qualification. Only the portable team skill, software-team documentation and the three explicit routing-control files can select nonshipping validation. That route still runs release-status checks, the complete shipping test selection, lint, surface/security audits and Store metadata validation. Changed runtime, dependencies, build inputs, release state, unknown inputs and release branches retain the complete candidate gate. The release packaging workflow, frozen identity/hash verifiers, Store controls, permissions and action pins remain unchanged.

Classification compares pinned Git history rather than only the last commit, and disables rename detection so a moved runtime file cannot disappear from the changed-path set. These are CI routing controls, not permission to publish a changed frozen candidate. Passing this route does not establish runtime host compatibility or a new release certification.

The router classifies committed history in the CI checkout; it is not a verifier of arbitrary dirty local workspaces. Router/workflow changes themselves require independent review. The release and Store identity controls remain separate from this editable validation policy.
