# Better CaptionKeep public project context

Updated November 20, 2026. This document records public product state, team ownership and evidence limits. Release records govern release identity and distribution; a role assignment is not a completed test or independent approval.

## Active 6.0.3 launch review

Nadia owns English Store/release messaging; Mara owns DAF-TECH brand consistency and setup presentation; Lena independently reviews QA/accessibility; Morgan independently reviews security. Four separate reviewer agents executed these assignments. Codex owns integration and publication. Their actual findings, corrections and acceptance limits are recorded in the [6.0.3 team release review](../release-state/6.0.3-team-release-review-2026-11-20.md). A release-role assignment alone does not establish approval.

The English copy promotes guided Microsoft 365/Intune setup with licensing, administrator and Windows prerequisites. Download is distinct from installation; organization setup is optional for local capture. Preserve the approved DAF-TECH sphere and company themes. Existing translated preview entries are not certified by the English review. The signed Administrator Setup 6.0.3-r2 helper is public; the corrected 6.0.3 extension is awaiting package requalification and Store submission. The last recorded public extension baseline is 6.0.0. Historical sections below do not override this status.

## Current product and distribution

Better CaptionKeep 6.0 is a local-first caption and meeting-evidence extension for Microsoft Teams web/PWA, Google Meet and Zoom Web. It preserves raw caption source separately from reviewed Moments, Notes, Answers, templates and shareable summaries. BYOMCP and Safari are deferred from shipping 6.0. Native Teams desktop capture is a separate research effort, not a supported capability of the published extension.

[GitHub v6.0.0](https://github.com/Mr-GraphnStaff/better-captionkeep/releases/tag/v6.0.0) was published October 24, 2026. Tag `v6.0.0` identifies `7470bbf1fe2347ce9c850ed7666ac326e79e7278`; repaired source is `9dabe8174ad51ef07662e739ab0ee2affec5cd75`. Published package hashes and provenance are recorded with the release. GitHub server immutability is disabled; the assets are operationally frozen and hash-verified, not server-enforced immutable assets.

The 6.0 submission history and its [machine release state](../release-state/6.0.json) are historical. Current 6.0.3 preparation is governed by [Release Status](../wiki/Release-Status.md), its [machine state](../release-state/6.0.3.json) and the linked current team review. Named unfinished checks remain unpassed; the 6.0 owner exception does not automatically authorize later releases.

Use the [6.0 release record](../RELEASE-6.0.md), [preparation evidence](../release-state/6.0-preparation.md), [roadmap](../ROADMAP-6.0.md) and [release process](../RELEASE_PROCESS.md) for detailed requirements and history. Earlier preparation-stage authorization limits are historical; they do not revoke later recorded publication decisions.

## One active source checkout

The approved source checkout is `P:/Projects/Better CaptionKeep`. Verify the actual branch and working tree at the start of each assignment. Preserve the owner's existing uncommitted work; the scoped 6.0.3 correction branch is `codex/6.0.3-team-launch-review`, prepared in a retained managed worktree under this checkout's `working/`. Historical research and release branch names are not current checkout instructions.

The owner uses real `Dev`, `QA` and `Production` build folders inside the neutral project root. Build scripts also generate target-specific distribution outputs:

- `dist/dev`: Development.
- `dist/uat`: UAT/Release Candidate.
- `dist/prod`: Production distribution packages and release evidence.

Publish only the exact qualified release artifacts identified by the release record. Preserve existing development and QA material. Owner-required `working/` is the only permitted scratch location and all development/test/research commands use the checked launcher; older sandbox guidance is superseded by AGENTS.md. Temporary browser profiles, logs and screenshots remain in managed runs unless deliberately retained as release evidence.

## Confirmed team and ownership

The repository-linked portable skill is [Software Team 1.0.13](../../.agents/skills/software-team/SKILL.md), with [roster 1.0.7](../../.agents/skills/software-team/references/team-roster.md). Twelve named teammates are confirmed: eleven employees and one external contractor. The human lead retains product, appointment, spending and accepted-risk decisions. Named specialist identities and approved character biographies do not establish real employment, qualifications or executed work.

| Member | Accountable scope | Review and handoff |
| --- | --- | --- |
| Codex | Engineering management, product/delivery integration and accurate final reporting | Relevant specialists independently review consequential delivery; lead escalation remains available. |
| Ishan | Architecture, backend/runtime contracts, persistence, packaging and destination inventory | Independent QA/security acceptance; no self-approval of implementation. |
| Mara | UX/frontend, readable source-linked workflows, content and invocation usability | Lena supplies independent accessibility/QA review. |
| Lena | QA, accessibility and independent functional acceptance | Separately staffed review of work Lena authors; not a substitute for the whole InfoSec function. |
| Heike | FinOps, billing attribution, workload and operating-cost evidence | Proposed estimates are separate from actual account/billing verification and spending authorization. |
| Ellis | Payroll/recognition, roster, reporting-line and handoff/review coverage reconciliation | Coverage is not technical sign-off; no payroll payment or balance follows from roster membership. |
| Nadia | Market/adoption evidence, search intent and listing research | Mara reviews research methods; engineering owns technical feasibility and technical SEO. |
| Jun Park | Localization/internationalization source, review and generation contracts; reports to Codex | Nadia supplies language-priority evidence; engineering implements; independent language/accessibility acceptance remains necessary. |
| Morgan Hale | Security Architect and InfoSec lead; reports to Codex | Independent verification and direct escalation remain available. |
| Elena Voss | AI Security Architect; reports to Morgan | Separate implementation and adversarial-review ownership. |
| Samir Rahman | Security Engineer; reports to Morgan | Work Samir authors receives a separate reviewer. |
| Camila Reyes | External HR / People Operations contractor; reports directly to the lead | Coordinates recruiting and private personnel/review records; technical reviewers retain technical acceptance. Codex is the administrative liaison and cannot approve closure of findings about Codex. |

Release/DevOps is covered by Codex with Ishan; documentation/support preparation is covered with the relevant specialists. These assignments do not imply separately staffed DevOps, writing or support hires. Every position receives on-the-spot and quarterly peer review under the portable policy; an assigned review is not an executed review or advance approval.

## Current native Teams and adoption research

The central requirement is **live captions plus source-linked investigation while a native Teams meeting continues**. Post-meeting official-transcript review is complementary and cannot substitute for live-source feasibility. Compare a Teams app, a Windows displayed-caption companion and a hybrid only against that requirement.

The [public native Teams research summary](NATIVE-TEAMS-RESEARCH-SUMMARY-2026-10-24.md) records current alternatives, source/session requirements and limits. The [Teams app assessment](TEAMS-APP-ASSESSMENT-2026-10-24.md) records the complementary post-meeting route and its authentication, consent and client constraints. Neither document changes submitted 6.0 code, assets or tags.

Nadia owns adoption and market evidence; Ishan source/interface feasibility; Mara the live investigation workflow; Morgan's team security architecture and verification; Lena independent assurance; Heike operating economics; Jun localization contracts; Ellis coverage; Codex integration. These are owners, not claims of completed experiments.

Current evidence is desk research and experiment design. No native caption prototype, actual customer study or native-source compatibility run has been completed. Installation events do not establish active use, retention or the cause of slow adoption. Investigate reach, listing comprehension, first useful capture, repeat value and native-client mismatch as competing explanations. Geographic install counts do not establish preferred language.

Local synthetic preparation may establish bounded contracts, but cannot certify native caption access or customer demand. Real meeting capture, audio/STT activation, paid services, new telemetry, infrastructure, identity/tenant-policy changes and external outreach retain their own scoped authorization requirements. No such operation is implied by this context or the research assessment.

## Skill delivery: verified state and limits

Software Team 1.0.11 / roster 1.0.6 previously received independent local review comparing the 28-file sets and hashes across authoring, installed plugin, repository-linked skill and portable export. This establishes that dated local artifact parity, not automatic cross-host synchronization. The subsequent 1.0.13 appointment update requires its own destination/hash verification. The ChatGPT editor connection is currently unavailable, so its saved 1.0.11 copy remains behind the local update; do not report it as synchronized.

The earlier 1.0.10 ChatGPT update has saved/reloaded readback evidence for 25 text files under documented text normalization. Three additional uploaded files persisted by path but their content was not exposed for web-preview comparison. The 1.0.11 policy update has changed-text readback comparisons; independent saved-artifact comparison is distinct from independently observing the editor operation. No fresh ChatGPT conversation runtime acceptance has been completed. Keep authored, uploaded, persisted, read back and execution-tested states separate.

Ishan owns packaging/version/destination inventory; Lena independent functional acceptance; Samir security/control acceptance through Morgan; Mara invocation usability; Ellis roster/handoff coverage; Codex integrated delivery claims. No member independently approves their own work. Keep project-specific evidence and unresolved exceptions explicit without claiming broader global runtime completion.

## Historical review and release evidence

The following records are retained as dated evidence. Their prior source paths, branches, partial acceptance and authorization limits describe the identified stage; they do not override current release records or current team appointments.

| Historical record | Scope and interpretation |
| --- | --- |
| [October 13 Software Team review](../SOFTWARE-TEAM-REVIEW-6.0-2026-10-13.md) | Review baseline `360cae2` and the original requirements/findings; not a current-build certification. |
| [6.0 execution ledger](EXECUTION-6.0.md) | Dated implementation, regression and independent-review evidence; synthetic, rendered, loaded-runtime and live-provider results remain distinct. |
| [MCP removal record](MCP-REMOVAL-6.0.md) | October 16 lead scope decision and removal evidence; earlier helper/onboarding work remains deferred history, not active 6.0 acceptance. |
| [Release acceptance matrix](RELEASE-ACCEPTANCE-6.0.md) | Applicable acceptance criteria and dated gaps; use the release-state record for later owner decisions and distribution outcomes. |
| [6.0 preparation record](../release-state/6.0-preparation.md) | Historical preparation, positive owner UAT, package and workspace-preservation evidence; later publication/submission outcomes are in Release Status. |
| [Public defect register](PUBLIC-DEFECTS-6.0.md) | Links and dated fix/acceptance status; local tests alone do not establish deployment or justify closing applicable live acceptance. |

Raw caption source remains authoritative. Reviewed derivatives preserve source/session identity and do not silently replace the transcript. Future work starts from verified source, artifact and tracker state; a historical label, browser URL, role name or matching skill version is insufficient evidence by itself.
