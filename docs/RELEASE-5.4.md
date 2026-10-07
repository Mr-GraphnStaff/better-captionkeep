# Better CaptionKeep 5.4 Development Record

Status: **Development started October 4, 2026**.

Version 5.4 is the active development release. Work may proceed while the
frozen 5.3.2 Store submission completes review because the two releases use
separate branches, artifacts, evidence, and Azure Boards scope.

## Relationship to 5.3.2

Version 5.3.2 remains unchanged. It is not complete until:

1. Chrome Web Store publicly serves 5.3.2;
2. Microsoft Edge Add-ons publicly serves 5.3.2; and
3. an existing installation is proven to upgrade and run successfully in each
   supported browser.

Azure Boards bug **#297** remains active until those conditions pass. No 5.4
change may be added to, substituted for, or used to rebuild the frozen 5.3.2
packages.

## Committed 5.4 scope

| Workstream | User outcome | Azure Boards authority |
| --- | --- | --- |
| Canadian French and Spanish product localization | Users can operate the core product in English, Canadian French, or Spanish, including accessible UI, help, privacy, and Store-facing material. | Feature #308 and tasks #309-#313 |
| Global AI-assisted localization preview | Users can opt into a broad set of clearly labeled, uncertified AI-assisted interface translations with English fallback and a privacy-safe correction path. English, Canadian French, and Spanish remain the reviewed core set. | New Azure Boards feature pending |
| Managed language deployment | Administrators can set an approved UI language through the existing managed-policy model, with documented Intune deployment and fallback behavior. | Feature #308 |
| French and Spanish transcript translation readiness | The viewer exposes reviewed French and Spanish translation choices, makes browser capability/model-download state clear, preserves the original transcript and provenance, and fails explicitly when local translation is unavailable. | Feature #315 |
| Active-meeting and production reliability | Active sessions are protected from accidental loss, production defects discovered after 5.3.2 are triaged into 5.4, and browser-specific upgrade behavior receives repeatable regression coverage. | Feature #316 |
| Permanent release safeguards | Store-equivalent clean-profile UAT, machine-readable evidence, permission-delta review, frozen-digest testing, the uninterrupted candidate window, public-upgrade canaries, a single release-status authority, identity decisions, and release pre-mortems become enforced controls. | Feature #298 and tasks #299-#307 |
| Edge `_metadata` upgrade investigation | Reproduce and document the transient Edge Store loader warning, verify package boundaries, and pursue an upstream/browser resolution when the evidence confirms Store-added metadata is responsible. | Bug #317 |
| Evidence Actions | Users can select precise caption evidence in the Evidence Board, send a reviewed request through either a local or customer-hosted assistant connection, receive and pin cited research, and prepare reviewed work-item actions through the customer's existing connectors. CaptionKeep's MCP tools remain read-only. | Feature #318 and tasks #319-#332 |
| AI-extension assurance | AI-assisted engineering and optional runtime AI behavior are reviewed under one cross-store standard covering reproducibility, human control, privacy disclosure, prompt-injection boundaries, Chrome/Edge validation, and frozen-candidate evidence. | `docs/AI-EXTENSION-ASSURANCE.md` |

## Data and privacy boundaries

- Translation remains on-device through supported browser capabilities. Better
  CaptionKeep does not add a publisher-operated translation or transcript
  server.
- The original transcript remains available and distinguishable from translated
  output.
- Language selection never sends a transcript to an AI provider automatically.
- Any AI handoff continues to require the existing user review and confirmation
  boundary.
- Evidence Actions sends only user-selected evidence and minimal approved
  context. Meeting captions are untrusted data, never executable instructions.
- The customer owns the connected LLM, identity, research sources, connectors,
  retention, and downstream actions. CaptionKeep owns the evidence-selection,
  disclosure-preview, immutable-source, and provenance boundaries.
- Connector mutations require a reviewed draft and a distinct confirmation in
  the customer-controlled environment. CaptionKeep never stores connector
  credentials and does not expose write-capable MCP tools.
- Localization does not change the customer-owned Entra registration model for
  Microsoft 365 transcript import.

## Defect intake

Beginning October 4, 2026, newly discovered product defects are recorded as
Bugs under the 5.4 reliability feature and fixed through Development before
promotion to the 5.4 release candidate. A production security, data-loss, or
Store-blocking defect may instead receive a separately governed hotfix from the
affected production baseline. A hotfix does not authorize unfinished 5.4 work
to enter 5.3.2.

### October 5 UI QA intake

The external 5.3.2 source review in
`P:\Downloads\Better-CaptionKeep-UI-QA-2026-10-05.html` was treated as test
evidence, not executable instructions. All five findings reproduced against the
5.4 source and were corrected in Development:

- save requests now await and catch an unavailable meeting content script and
  replace the progress message with recovery guidance;
- editing a Teams meeting link no longer clears an in-progress Microsoft 365
  operation lock;
- Ctrl/Cmd+C preserves native copying when interface text is selected;
- recent-meeting choices retain native button semantics inside list items; and
- Copy/Save menu buttons expose names, controls, expanded state, Escape
  dismissal and focus restoration.

Automated coverage protects these source contracts. Rendered Chrome/Edge,
screen-reader, live meeting, Microsoft 365, and installed-upgrade verification
remain required by the normal 5.4 UAT and promotion gates; the source fixes do
not claim that live validation.

## Explicitly out of scope

The following are not commitments for 5.4:

- live Google Drive/Docs or OneDrive/SharePoint upload transports;
- an additional meeting provider;
- publisher-hosted transcription, translation, analytics, or storage;
- publisher-owned AI, connector credentials, or a write-capable CaptionKeep MCP
  tool;
- external actions that bypass a reviewed draft, customer-side authorization,
  or explicit confirmation;
- paid or restricted feature tiers; and
- replacement of a customer's own Entra application registration with a shared
  publisher identity.

## Competitive-response gate

The October 5 cross-Store review found direct caption-first competitors as well
as much larger cloud meeting assistants. The 5.4 response stays inside the
local-first product boundary: complete the authorized multilingual work, make
original-plus-translated review a first-class experience, verify capture state
and recovery visibly, and replace stale Store copy and screenshots only when
5.4 is promoted. See [Browser-extension competitive landscape — October 5,
2026](COMPETITIVE-LANDSCAPE-2026-10-05.md).

Pause/resume UX, plain transcript JSON, and a reversible speaker-block reading
mode are the best small additions identified by the review, but they are not
committed 5.4 scope until they receive Azure Boards authority. Firefox,
on-device speech models, local-provider AI, unrestricted semantic
cross-meeting questions, desktop audio capture, and automatic cloud/team
integrations remain separately governed future decisions.

Feature #318 adds the primary competitive response: **Evidence Actions**. The
5.4 release delivers one shared evidence contract, local and customer-hosted
MCP deployments, the Evidence Board research workflow, cited Research Cards,
the optional **Send to my assistant** bridge, and reviewed Jira, Azure DevOps,
Microsoft 365, and other connector actions through the customer's own LLM.
CaptionKeep's MCP surface remains read-only; external mutations occur only
through customer-owned connectors after explicit confirmation. See [Evidence
Actions architecture and release plan](EVIDENCE-ACTIONS.md).

## 5.4 execution schedule

This is the fixed engineering-delivery schedule approved October 5, 2026. It
assumes one product owner/tester and one implementation agent, keeps one
integrated 5.4 candidate, and sets **Saturday, October 24, 2026** as the final
completion and go/no-go boundary. The work must be complete before October 25.

Chrome's 5.3.2 review remains a production observation and upgrade-canary
dependency, but it no longer delays 5.4 development. The October 24 commitment
covers implemented, integrated, documented, and accepted release-candidate
work. Store review time after an authorized submission remains outside the
engineering team's control and is not represented as an October 24 publication
guarantee.

| Sprint | Dates | Planned outcome | Owner | Exit evidence |
| --- | --- | --- | --- | --- |
| Sprint 1 — Evidence Actions Foundation | October 5-11 | Approve the ownership/security ADR; freeze the Evidence Action envelope and read-only MCP contracts; implement the first Evidence Board selection and preview flow; establish the shared local/remote MCP server foundation; continue the already-authorized localization, reliability, UI QA, and release-control work. | Codex implements; David reviews product and security decisions | Tasks #319, #320, #321, #322, and #327 meet their acceptance criteria; focused tests and rendered Evidence Board review; no unresolved architecture blocker |
| Sprint 2 — Dual Deployment and Integration | October 12-18 | Complete local stdio and customer-hosted Streamable HTTP profiles, assistant bridge, All Settings administration, durable action lifecycle, cited Research Cards, managed policy, and integration with the existing Evidence Board and handoff boundaries. | Codex implements; David validates connection and meeting workflows | Tasks #323, #325, and #328-#331 pass contract, policy, accessibility, failure, restart, and local/remote interoperability tests |
| Sprint 3 — Actions, UAT, and Release | October 19-24 | Complete reviewed customer-connector actions, deployment/runbook material, adversarial and privacy testing, and clean-profile Chrome/Edge UAT. Feature work and scope lock complete by October 21; freeze the candidate no later than October 22 so the unchanged window can finish before the October 24 go/no-go. | Codex completes and diagnoses; David performs live acceptance and authorizes promotion | Tasks #324, #326, and #332 complete; full 5.4 regression evidence; immutable hashes; at least 48 unchanged hours; written go/no-go; no unresolved release blocker |

### Azure Boards card queue

This table combines created Azure Boards work with the remaining intake queue
under Epic #314. A numbered card is existing authority; a `pending` label is
still only a proposal and must not be represented as committed work.

| Type | Proposed title | Parent | Release disposition |
| --- | --- | --- | --- |
| Bug | Edge 5.3.2: Teams Start transcription control repeatedly flashes or reopens | Feature #316 | Release-blocking until reproduced, fixed, and live-verified in Edge |
| Feature | Replace automatic Teams transcription with an explicit side-panel action and external-participant guard | Feature #316 | Required 5.4 privacy/reliability change; local caption capture remains independent |
| Feature | Add global AI-assisted preview localization with transparent quality labels | Epic #314 | Expand reach without representing machine-assisted catalogs as professionally certified |
| Task | Add translation-problem report flow with locale and string-key context only | Global localization feature, pending | Must exclude transcripts, meeting titles, participant data, tenant IDs, and browser history |
| Task | Validate right-to-left, CJK, Indic, and text-expansion layout families | Global localization feature, pending | Required before preview catalogs are packaged |
| Bug | Remediate October 5 popup UI QA findings and complete live accessibility UAT | Feature #316 | Code corrections are in Development; rendered and assistive-technology evidence remains |
| Feature | Better CaptionKeep 5.4 competitive UX quick wins | Epic #314 | Container for the three bounded, local-first additions below |
| Task | Add first-class pause and resume with visible paused intervals | Competitive UX feature, pending | Include only with authoritative history preserved and managed-policy review |
| Task | Add plain transcript JSON export with provenance | Competitive UX feature, pending | Include only with source IDs and authentic cue boundaries preserved |
| Task | Add reversible consecutive-speaker reading mode | Competitive UX feature, pending | Include only as a derivative view linked to source caption IDs |
| Task | Refresh 5.4 Store copy and screenshots from verified product evidence | Epic #314 | Required before promotion; must not alter the pending 5.3.2 submissions |
| Feature #318 | Evidence Actions: customer-owned AI research and workflow handoff | Epic #314 | Active and committed for 5.4; target October 24 |
| Task #319 | Evidence Actions ADR: ownership, trust, identity, and data boundaries | Feature #318 | Sprint 1; Closed October 5; accepted ADR-0001 |
| Task #320 | Define read-only CaptionKeep MCP tools and evidence schemas | Feature #318 | Sprint 1; Active; shared contract |
| Task #321 | Add active evidence selection and Research this reference side-panel UX | Feature #318 | Sprint 1; Active; primary user experience |
| Task #322 | Build shared local and customer-hosted CaptionKeep MCP server | Feature #318 | Sprint 1; Closed October 5; stdio and authenticated Streamable HTTP pass one tool contract suite |
| Task #323 | Create cited Research Cards as immutable-evidence derivatives | Feature #318 | Sprint 2; Active October 5; sealed/cited derivative contract, persistence, receipt binding, and Evidence Board rendering implemented; live assistant UAT remains |
| Task #324 | Evidence Actions privacy, injection-resilience, and live browser UAT | Feature #318 | Active October 5; automated injection, tamper, forged-receipt, hostile-link, timeout, oversized-response, duplicate-job, and missing-confirmation cases pass; clean-profile Chrome/Edge and customer-environment UAT remain release blockers |
| Task #325 | Implement the customer-configured Send to my assistant bridge | Feature #318 | Sprint 2; Active October 5; shared native/HTTPS protocol, PKCE session authentication, explicit dispatch, polling, cancellation, and reference SDK/native host implemented; live round trip remains |
| Task #326 | Implement reviewed work-item actions through customer LLM connectors | Feature #318 | Active October 5; structured drafts, distinct customer-side confirmation state, sealed Evidence Board display, and attested external-record receipts implemented; packaged customer-adapter and live connector UAT remain |
| Task #327 | Define the shared Evidence Action envelope and transport contract | Feature #318 | Sprint 1; Active; common local/remote payload |
| Task #328 | Implement the enrolled local assistant bridge and stdio MCP profile | Feature #318 | Sprint 2; Active October 5; stdio MCP, native-host SDK, restart-safe inbox, direct-launch Windows executable, exact Chrome/Edge manifest, and opt-in enrollment/removal helpers implemented; customer-specific adapter and live UAT remain |
| Task #329 | Implement the customer-hosted assistant endpoint and Streamable HTTP MCP profile | Feature #318 | Sprint 2; supported BYO deployment |
| Task #330 | Add Evidence Actions connections and policy to All Settings | Feature #318 | Sprint 2; Active October 5; progressive connection setup, exact optional permissions, local-only identifiers, and managed locks implemented; rendered accessibility review remains |
| Task #331 | Implement durable Evidence Action jobs, cancellation, results, and receipts | Feature #318 | Sprint 2; Active October 5; persistence, idempotency, explicit state transitions, receipts, MV3 alarm recovery, restart resubmission, visible job history, retry/status controls, and cancellation implemented; live restart/browser UAT remains |
| Task #332 | Package and document Evidence Actions deployment, operations, and recovery | Feature #318 | Active October 5; allowlisted Evidence Actions ZIP, SHA-256 provenance, dependency-lock binding, clean extracted production installs, extracted MCP negotiation, Windows launcher round trip, and local/remote deployment and recovery runbooks implemented; customer-managed environment evidence remains |

### Edge transcription flashing defect intake

The first source hypothesis is repeated automation, not yet a confirmed root
cause. `content_script.js:handleMeetingStateChange()` runs every five seconds;
`ensureTeamsTranscription()` retries after sixty seconds; and a `requested`
state does not prevent `inspectTranscriptionMenu()` from reopening Teams controls
and requesting transcription again. Live Edge 5.3.2 reproduction must record
the interval, meeting role, tenant policy, whether Teams already shows
transcription as running, and whether the flash is the More menu, the Start
transcription control, or a Teams notification. The eventual fix must stop
repeated disruptive UI automation without falsely claiming that Microsoft 365
transcription is running.

The scheduled product correction is to remove automatic Microsoft 365
transcription requests and expose **Start Microsoft 365 transcript** as an
explicit Teams-only action in `sidepanel.html` and `sidepanel.js`. The content
script handles that one user-authorized request and reports `running`,
`requested`, `blocked`, or `unavailable` without polling the Teams menus.
Local displayed-caption capture remains separate and may continue without a
tenant-retained transcript.

Before starting, the action checks the Teams participant roster for Microsoft
trust indicators. Microsoft documents `(Guest)`, `(External)`, and
`(Unverified)` labels for outside participants. When any such participant is
present, the side panel requires a second confirmation explaining that Teams
will notify participants and the organizer's tenant may retain the transcript.
When the roster or trust state cannot be verified, the UI must say so and also
require confirmation; it must not silently assume that everyone is internal.
No attendee name, domain, or trust label is sent outside the browser.

Acceptance evidence:

- joining a Teams meeting never opens or flashes the transcription controls;
- the side-panel button is absent or disabled outside Teams and while no Teams
  meeting is active;
- one button activation produces at most one Teams transcription request;
- Guest, External, Unverified, and unknown-roster fixtures exercise the warning
  boundary without relying on a participant name or email-domain guess;
- canceling the warning performs no Teams action;
- running/requested state disables duplicate requests and remains distinct from
  local caption capture status; and
- live Edge and Chrome UAT covers internal-only, external-participant, and
  unverifiable-roster cases.

## Localization quality model

Version 5.4 uses two explicit localization tiers:

1. **Reviewed core:** English, Canadian French, and Spanish. These catalogs
   receive product-owner review and the full release test matrix.
2. **AI-assisted preview:** broad-reach catalogs produced with AI assistance,
   automated catalog validation, representative rendered testing, and user
   correction intake. They are useful previews, not professional or certified
   translations.

The proposed preview set uses locale codes supported by the Chrome extension
internationalization system and shared by the Chromium-based Edge package:

- Europe and the Americas: German (`de`), Latin American Spanish (`es_419`),
  Brazilian Portuguese (`pt_BR`), Portuguese (`pt_PT`), Italian (`it`), Dutch
  (`nl`), Polish (`pl`), Czech (`cs`), Greek (`el`), Romanian (`ro`), Swedish (`sv`),
  Ukrainian (`uk`), Russian (`ru`), and Turkish (`tr`);
- India: Hindi (`hi`), Bengali (`bn`), Gujarati (`gu`), Kannada (`kn`),
  Malayalam (`ml`), Marathi (`mr`), Tamil (`ta`), and Telugu (`te`);
- East and Southeast Asia: Indonesian (`id`), Filipino (`fil`), Malay (`ms`),
  Thai (`th`), Vietnamese (`vi`), Japanese (`ja`), Korean (`ko`), Simplified
  Chinese (`zh_CN`), and Traditional Chinese (`zh_TW`); and
- Middle East and Africa: Arabic (`ar`), Hebrew (`he`), Persian (`fa`), and
  Swahili (`sw`).

This makes 35 preview locales plus the reviewed core experience. A locale may
be deferred before scope lock when catalog completeness, script rendering,
right-to-left behavior, or a dangerous meaning error cannot be resolved. The
count is a test target, not a marketing claim until the packaged catalogs pass.

Every preview language selector and localized help/about surface displays:

> Translation preview: This interface was translated with AI assistance and
> has not been certified by a professional translator. English is the
> authoritative reference for privacy, security, and administrative meaning.
> Found a problem? Report this translation.

The report action collects only the locale, product version, surface name,
message key, displayed translation, and an optional proposed correction. It
must not automatically attach a screenshot, transcript, meeting title,
participant information, tenant identifier, page URL, or browser history. The
user reviews the report before it opens or submits anywhere.

Preview release gates include exact message-key and placeholder parity, valid
UTF-8 catalogs, no executable markup in messages, English fallback for missing
strings, overflow checks at representative narrow and wide layouts, keyboard
and screen-reader smoke tests, bidirectional layout checks for Arabic, Hebrew,
and Persian, and representative rendering for CJK and Indic scripts. Privacy,
consent, security, and managed-administration strings receive an additional
meaning review even in preview catalogs.

### Schedule controls

- A packaged-code, manifest, dependency, or artifact change after the Day 9
  freeze resets the affected UAT evidence and the 48-hour clock.
- The sprint/release clock cannot start while Chrome 5.3.2 remains in review or
  until an existing Chrome installation receives and runs the public update.
- Security, data-loss, capture-loss, privacy, upgrade, and accessibility defects
  block promotion. Copy polish and non-critical enhancements may be explicitly
  deferred with an owner and target release.
- The three competitive quick wins are a bounded lane, not permission to add
  cloud upload, automatic AI, another provider, desktop audio, or a new
  permission surface to 5.4.
- Daily status uses four states only: `not started`, `in progress`, `blocked`,
  and `verified`. “Implemented” is not “verified” until its listed evidence
  exists.

## Promotion gates

The 5.4 candidate cannot enter Production until all committed work is complete
and the normal release process passes, including automated validation,
permission/privacy review, clean-profile Chrome and Edge UAT, multilingual
accessibility testing, managed-policy validation, an unchanged 48-hour
candidate window, immutable artifact evidence, and explicit publication
approval.

## Lifecycle authority

- Azure Boards Epic **#314**: Better CaptionKeep 5.4 - Multilingual Enterprise
  and Reliability, retitled **Global Access, Reliability, and Evidence Actions**
- Azure Boards Feature **#318**: Evidence Actions - customer-owned AI research
  and workflow handoff
- Engineering delivery target: **October 24, 2026**
- Development: topic branches and pull requests
- UAT / Release Candidate: `release/5.4`
- Production: protected `master` and immutable Store artifacts
- Release process: [RELEASE_PROCESS.md](RELEASE_PROCESS.md)
