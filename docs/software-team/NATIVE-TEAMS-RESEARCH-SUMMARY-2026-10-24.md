# Native Teams live captions: research summary

October 24, 2026. Status: desk research and experiment design, not implemented native support. This work is separate from the published Better CaptionKeep 6.0 packages.

The required outcome is **live captions plus source-linked investigation tools while a native Teams meeting continues**. Official post-meeting transcript review is complementary; it does not establish live parity. One product remains the working hypothesis, with additional installation, update, identity and support obligations to assess.

## Routes being compared

| Route | Established foundation | Unresolved evidence |
|---|---|---|
| Teams app | Microsoft documents personal tabs and meeting app surfaces. | A suitable live caption source has not been established. The reviewed Teams meeting APIs did not expose a read feed for built-in captions; this is a research finding, not proof that every possible interface was exhausted. |
| Windows companion | Accessibility interfaces offer a possible displayed-text investigation route. | Actual Teams caption exposure, revisions, speaker identity, minimized behavior, lifecycle and compatibility remain untested. No broad desktop capture or privilege bypass is proposed. |
| Hybrid | A companion could supply a live source to a Teams investigation surface. | Source feasibility, authenticated transport, account/session binding, storage and coordinated installation/update remain unproved. |

Sources reviewed for the underlying assessment: [Teams meeting APIs](https://learn.microsoft.com/en-us/microsoftteams/platform/apps-in-teams-meetings/meeting-apps-apis), [tabs](https://learn.microsoft.com/en-us/microsoftteams/platform/tabs/what-are-tabs), [meeting app surfaces](https://learn.microsoft.com/en-us/microsoftteams/platform/apps-in-teams-meetings/build-tabs-for-meeting). Official transcript access is a separate [Graph artifact path](https://learn.microsoft.com/en-us/graph/api/calltranscript-get?view=graph-rest-1.0).

## Acceptance to establish

1. Text arrives during a native meeting through an appropriate source, demonstrated with a controlled synthetic experiment.
2. Investigation remains usable as captions change: source identity, stable references, corrections and uncertainty remain visible.
3. Gaps, cancellation, rejoin and recovery are explicit; no cross-meeting mixing or silent completeness claims.
4. Enterprise installation, app availability, consent, tenant controls and user entitlement are evaluated separately.
5. Data flow, storage, account changes, permissions and operating costs are understandable and bounded.

Ishan owns source/interface feasibility; Mara owns the investigation experience; Nadia owns market/adoption evidence; Morgan's security team and Lena provide distinct architecture and independent assurance; Heike assesses costs. Role ownership is not evidence that any experiment has passed.

Initial experiments should use local synthetic fixtures and explicit session/revision contracts. Fixture success would not prove native integration. Audio/STT activation, telemetry, real meeting content, paid services, infrastructure or tenant-policy changes require their own authorized scope; none was performed by this assessment.

## Current limits

No native caption prototype, actual customer study or native-source compatibility run has been completed. Installation events do not establish active use, retention or the cause of slow adoption. Current work must compare reach, comprehension, first useful capture, repeat value and native-client mismatch without prematurely selecting one explanation.

The [Teams app assessment](TEAMS-APP-ASSESSMENT-2026-10-24.md) records the complementary post-meeting option and its identity/consent limits. Neither document modifies submitted 6.0 code, packages or tags, or predicts Store approval timing.
