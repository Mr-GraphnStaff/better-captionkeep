# Lifecycle routing and evidence gates

## Route by outcome

| Request | Accountable roles | Useful reviewers | Completion evidence |
|---|---|---|---|
| Assess project | Architecture or UX | QA/security/operations as relevant | Inspected sources, prioritized findings, next steps; no unauthorized edits |
| Define product | Product + analysis | Research/architecture | Problem, audience, measurable outcome, scope, testable requirements |
| Design workflow | UX + UI | Accessibility/content/frontend | Main/failure paths, states, implementation criteria |
| Implement feature | Relevant engineers | QA; security/accessibility when affected | Working diff, criterion coverage, checks, disclosed limits |
| Improve quality | QA/security/performance | Affected engineer | Reproduced baseline, justified fix, retest |
| Prepare/execute release | Release + platform | QA/security/reliability/writing | Identified artifact, readiness evidence, rollout/recovery; target verification if deployed |
| Operate/support | Reliability + support | Engineering/security | Diagnosis, recovery evidence, owner/follow-up |

Skip irrelevant stages with a reason. Minor copy edits do not require a full threat model, charter, and launch committee. Authentication changes require more scrutiny than label changes. Apply depth proportional to consequence.

## Lifecycle gates

Treat these as evidence criteria, not automatic permission prompts. Reuse decisions already made and continue within authorized scope.

- Discovery: identify problem/audience/constraints/outcome; distinguish facts from hypotheses and visible research gaps.
- Definition: specify testable behavior/exceptions, dependencies, and non-goals.
- Design: specify main/recovery paths, states, accessibility, and contracts.
- Build: integrate focused changes against the actual repository; preserve conventions/local work and verify meaningful acceptance behavior.
- Review: inspect final artifacts, resolve material findings, retest affected behavior, and disclose independence/unperformed checks.
- Release: identify revision/target, gather readiness evidence, define rollout/stop/rollback, apply authorization for external action.
- Operate: verify target health if released, supply diagnostics/support ownership, feed observations into priorities.

## Traceability and verdicts

For substantial work maintain: requirement ID; behavior; implementation; evidence; result; unresolved finding. Use existing trackers/docs. Revalidate evidence when reviewed builds or relevant behavior change.

Use **ready** only when applicable criteria/material checks pass and no unresolved blocker remains. Use **ready with accepted risks** only when the user explicitly accepted named risks/skipped checks. Use **not ready** for material failures, missing necessary verification, pending risk acceptance, or missing authorization for a consequential step. Separate readiness from publication status.

For non-release tasks use **complete**, **complete with stated limitations**, or **blocked**. Static assessments can be complete with limits; critical unverified implementation is not fully verified. Prioritize by consequence and give the next executable step. Never invent evidence to fill a template.
