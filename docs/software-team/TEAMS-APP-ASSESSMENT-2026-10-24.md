# Teams app / Marketplace assessment

Date: October 24, 2026. Lead: David Farris. Research lead: Nadia. Integration: Codex.
Status: coordinated desk assessment completed; native capture, authentication and customer demand are not validated by execution.

> Owner clarification after this assessment: live captions plus investigation tools are central. The post-meeting-first concept below is a complementary option, not an adopted replacement. See the [public live-research summary](NATIVE-TEAMS-RESEARCH-SUMMARY-2026-10-24.md) for the current requirement and unresolved evidence.

## Recommendation

Keep one Better CaptionKeep product, and assess a Teams personal app as its enterprise delivery channel. The smallest credible concept is **authorized official-transcript review and export after a meeting**. A meeting side panel is a possible later surface. This is a different job from keeping live captions in native Teams; it must not be described as live-capture parity.

Do not commit to a Windows companion, a publisher transcript service or a Marketplace launch yet. First establish whether the post-meeting job delivers meaningful value beyond built-in Recap, and whether the required identity/access path works in an authorized test tenant. If the unmet requirement is exclusively live caption keeping, this concept does not resolve it; retain a separate capture-feasibility investigation.

All five specialists supplied actual independent research: Nadia market/adoption; Ishan architecture; Mara UX; Lena security/QA; Heike economics. Their review is documentation/source inspection, not customer interviews or app tests. No fictitious consensus meeting or credentials are evidence.

## Capability and uncertainty

| Capability | What is established | What remains unproved |
|---|---|---|
| Personal app, tabs, meeting panel | Teams supports these app surfaces | CaptionKeep implementation and client compatibility |
| Authorized official transcript import | Graph exposes post-meeting artifacts; current connector is a reuse foundation | Exact pilot consent/access/client matrix |
| Direct client-to-Graph authentication | NAA documents MSAL.js SPA access without mandatory OBO middle tier | Our host support, fallback and conditional-access behavior |
| Read native live captions through TeamsJS | No read feed was found in the reviewed current meeting API pages; CART sends captions | Any suitable separate live source |
| Browser/Teams shared history | No implementation exists | Storage, identity, consent, durability and synchronization design |
| Native Windows UIA capture | General accessibility APIs exist | Actual caption exposure and fidelity, especially minimized |

Sources: [tab scopes](https://learn.microsoft.com/en-us/microsoftteams/platform/tabs/what-are-tabs), [meeting surfaces](https://learn.microsoft.com/en-us/microsoftteams/platform/apps-in-teams-meetings/build-tabs-for-meeting), [meeting APIs](https://learn.microsoft.com/en-us/microsoftteams/platform/apps-in-teams-meetings/meeting-apps-apis).

## Nadia: opportunity and adoption

Proposed users are operational/technical meeting participants preparing evidence-backed follow-up. A team lead may sponsor adoption; Teams administrators, security/privacy reviewers and records owners are gatekeepers. These are segment hypotheses, not measured market size or verified customers. External guests and internal organizers require different access research.

Teams Store publication also lists an app in Microsoft's commercial marketplace, but organizational app availability and transcript authorization remain separate. A free app still consumes enterprise approval and support effort. [Publishing](https://learn.microsoft.com/en-us/microsoftteams/platform/concepts/deploy-and-publish/appsource/publish), [app-centric management](https://learn.microsoft.com/en-us/microsoftteams/app-centric-management).

The market is not empty. Read documents a Teams meeting dashboard whose live experience depends on Read being in the meeting. Fireflies documents a Teams channel-notification integration, with meeting recording configured separately. These are vendor claims, not tested behavior; a Marketplace badge does not reveal the capture mechanism. [Read setup](https://support.read.ai/hc/en-us/articles/33598666148371-How-to-install-Read-s-app-for-Teams), [Fireflies integration](https://guide.fireflies.ai/articles/8966445661-how-to-set-up-fireflies-microsoft-teams-integration).

Microsoft's Meeting Recaps already exposes permitted transcripts/recordings; advanced recap features have separate licensing. Therefore importing a transcript into Teams is not enough differentiation. Test a specific task: select an authorized source, review exact supporting passages, and prepare useful editable follow-up with source identity. [Meeting Recaps](https://support.microsoft.com/en-us/teams/meetings/meeting-recap-app-teams).

Validate that task against the user's current Recap/export workflow, with internal organizers, participants and an IT gatekeeper. Record recent behavior, permission constraints, needed help and whether the output changes real work. No outreach or participant sessions have occurred. Continue the existing-offering adoption investigation in parallel: discovery → listing → install → first useful transcript → repeat value. Install events alone cannot identify native-client mismatch or prove retention.

## Ishan: data and hosting architecture

A Teams package is not an extension-manifest conversion. The existing Graph connector can contribute discovery/parsing/provenance logic, but browser identity, chrome.storage.session, archives and export/download behavior require Teams host adapters. Native app context must not be treated as Graph authorization.

Teams tabs need hosted HTTPS pages and supported embedding/SDK configuration. Current NAA permits a client SPA to obtain delegated Graph tokens without a middle-tier exchange server; it does not remove app registration, consent or host testing. No publisher transcript database is inherently required for that design. [NAA](https://learn.microsoft.com/en-us/microsoftteams/platform/concepts/authentication/nested-authentication), [tab requirements](https://learn.microsoft.com/en-us/microsoftteams/platform/tabs/how-to/tab-requirements).

Current Graph v1 documentation supports work/school delegated transcript access and excludes personal Microsoft accounts. Calendar-event association, meeting expiry and tenant controls matter. The get endpoint documents invited users; guest/cross-tenant behavior still needs direct verification. OnlineMeetingTranscript.Read.Chat is application RSC for scheduled private-chat meetings, not a delegated personal-tab scope or a universal channel permission. [Get/content API](https://learn.microsoft.com/en-us/graph/api/calltranscript-get?view=graph-rest-1.0).

Delegated OnlineMeetingTranscript.Read.All requires administrator consent. NAA dynamic consent does not make it user-consent-only. App availability, Entra consent, meeting entitlement, tenant transcript API setting and artifact existence are separate checks. [Graph permissions](https://learn.microsoft.com/en-us/graph/permissions-reference#onlinemeetingtranscriptreadall).

## Mara: first-value experience

Proposed journey: find/request app → identify organization and access requirements → select an eligible meeting → explicitly import an available official transcript → review source-linked evidence → export deliberately.

Show distinct states for unavailable app, consent required, no transcript, still processing, disabled access and missing speaker attribution. A meeting panel can offer personal notes and source status without claiming to listen. Do not expose private history in a meeting tab, automatically publish to chat or treat a personal tab as an authorization boundary. Sign-out, account switching, deletion and client storage durability need defined semantics before persistence is promised.

## Lena: proposed assurance acceptance

These are acceptance requirements to verify, not passed tests:

- Tokens and transcript content stay out of publisher logs, URLs, analytics, crash reports and diagnostic exports; no embedded client secret.
- Validate identity and access using the actual chosen authentication flow, not untrusted Teams context fields.
- Denial, revocation, conditional access and disabled transcript API fail with clear recovery; no alternate capture bypass.
- Account/tenant changes cannot expose a previous user's source or derived work.
- Transcript format and speaker-attribution restrictions are respected; preserve source and uncertainty.
- Test guest/external accounts, meeting type, lifecycle and supported clients explicitly; do not extrapolate tab support to transcript entitlement.
- Memory-only initial review and explicit export reduce persistence assumptions. Hosted UI delivery introduces requests/logging and must be disclosed accurately even if transcript processing remains client-side.
- Keyboard, focus, narrow layout and themes support the task; no implicit sharing or AI submission.

A publisher-owned multitenant identity, application/RSC backend, shared archive or live media bot each needs its own design review. They are not silently included in this proposal.

## Heike: economics

No prices, account allowances or staffing hours were verified. NAA may avoid a token backend for the delegated SPA scope; HTTPS hosting, delivery security, registration support, tenant onboarding, compatibility testing and incident/support work remain. A customer-owned single-tenant pilot limits initial identity scope but carries setup friction; a multitenant publisher app introduces cross-tenant trust and support obligations, not necessarily a transcript backend.

Microsoft says the listed transcript/recording APIs stopped being metered on August25,2025. That does not make every Graph API, user license, hosting or storage free. Do not use obsolete per-minute transcript pricing from historical documentation. [Current API notice](https://learn.microsoft.com/en-us/microsoftteams/platform/graph-api/meeting-transcripts/overview-transcripts).

A Windows companion substitutes signing, updates and Windows/Teams compatibility obligations for some hosted-UI obligations. Neither route is zero-cost. Identify the account, workload and cost envelope before any paid activation.

## Decision gates and next experiment

1. **Research preparation:** synthetic task storyboard and neutral comparison with built-in Recap/current connector. No customer results are fabricated if participants are unavailable. Owner Nadia; Mara reviews.
2. **Offline feasibility preparation:** a personal-tab fixture/import/export contract, host-adapter seams, NAA compatibility/fallback design and denied/unavailable states. Owner Ishan; Lena reviews. This can precede live tenant proof and does not require a completed product to justify the experiment.
3. **Authorized tenant proof:** validate supported-host authentication, exact consent, synthetic official transcript retrieval and export. Requires an appropriate test tenant, registration and HTTPS origin; none was created in this assessment.
4. **Pilot investment decision:** advance only when a recurring unmet job, plausible enterprise approval path and required technical data access are demonstrated. If Recap is sufficient, prioritize a better-supported adoption improvement. If only live access matters, post-meeting success cannot count as solving it.

## Execution boundary

No app prototype, registration, tenant-policy change, new service, paid test, real meeting inspection, telemetry deployment, customer outreach, Store publication or6.0 package change occurred. Sources were inspected October24,2026. The 6.0 owner exception is release-specific and does not waive acceptance for this future app. Research lives on codex/market-research-nadia, separately from published6.0.
