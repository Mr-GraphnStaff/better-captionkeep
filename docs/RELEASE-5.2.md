# Better CaptionKeep 5.2 Development Gate

Status: **historical development record; scope absorbed into the 5.3 next-release line**. This record does not authorize Store submission, tenant-wide deployment, or a release-candidate claim.

Version 5.2 was the parallel enterprise-security hardening line that followed the immutable 5.1.0 Store artifacts. Its completed work is now integrated into 5.3 rather than promoted as a separate release. It cannot reuse, replace, or retroactively describe the 5.1 artifacts.

## Next enterprise feature

The administrator-approved Microsoft Graph transcript connector is the highest-priority feature after the 5.2 hardening scope. A tenant API proof may run during the 5.2 validation window, but the connector is not part of the packaged 5.2 candidate and must not reset or weaken the current release gate. See [Enterprise Microsoft Graph Transcript Connector](GRAPH-TRANSCRIPT-CONNECTOR.md).

Promotion into a packaged release requires a successful Entra/Graph tenant proof, unpacked Chrome and Edge extension UAT, authentication and revocation review, separate provenance for local and Graph transcripts, updated privacy and Store disclosures, and a new frozen-candidate test window. If that evidence is not complete before the next scope lock, the connector moves to the following train.

## Scope freeze

- [x] Source and manifests use version `5.2.0`.
- [x] Security architecture, threat model, enterprise review record, and EUC runbook are maintained in the repository.
- [x] Managed controls are enforced both in the interface and again at the action boundary.
- [x] The hardened local-only profile disables AI handoff, clipboard, evidence email, and attendee capture; forces scrubbed exports; and bounds local history.
- [x] Release automation emits an SBOM and provenance attestations and pins third-party actions to reviewed commits.
- [x] Scope is consolidated on `release/5.2`: long-meeting local BYOAI handoff, durable local archive, cross-session search, reversible corrections/local dictionary, DOCX export, and Intune groundwork.
- [x] Issues #49-#53 are available to every user; no paid tier, activation service, billing, or cloud transcript service is included.
- [x] Scope is frozen on one release branch and this record describes the exact candidate.

## Automated evidence

- [ ] `npm run release:candidate` passes on the exact commit.
- [ ] GitHub validation and CodeQL pass on the pull request.
- [x] Edge and Chrome packages build locally with distinct verified manifests and identities.
- [x] The Intune standard, Chrome, and hardened bundles build locally from the managed schema.
- [ ] Release ZIPs, provenance, checksums, SBOM, and GitHub attestations are retained together.
- [ ] A second reviewer approves security-critical workflow, policy, and runtime changes.

Current blocker: the strict development dependency audit reports high-severity `node-forge` advisory `GHSA-86w9-cpqp-85rv` through `web-ext` → `@devicefarmer/adbkit`. The offered automated fix downgrades `web-ext` to a breaking major version and is not accepted. Do not mark this line Store-ready, suppress the audit, remove the gate, or publish until a reviewed patched dependency path is available. Local package builds passing does not override this blocker.

Local automated checks and package builds are evidence for the exact candidate commit only. Browser UAT, Microsoft Word/LibreOffice DOCX opening, GitHub checks, CodeQL, Store review, and managed-device pilot evidence remain separate unchecked gates.

## Managed-policy UAT

Test on managed Windows devices in both Microsoft Edge and Google Chrome. Record browser version, extension ID, package hash, policy source, tester, and result.

- [ ] Force-install succeeds and the user cannot remove the managed extension.
- [ ] `disableAiHandoff` blocks the handoff interface and the service-worker action.
- [ ] `disableClipboard` blocks popup, viewer, handoff, and Evidence Board copy paths.
- [ ] `disableFileExport` blocks popup, viewer, export-page, automatic, and Evidence Board file paths.
- [ ] `forceScrubbedExport` masks transcript and attendee data at the service-worker boundary.
- [ ] `disableEvidenceEmail` blocks creation of the user-reviewed mail draft.
- [ ] `disableAttendeeCapture` stops roster collection and prevents attendee data from entering new exports.
- [ ] `disableSessionHistory` clears completed local history and prevents new completed-session writes.
- [ ] `maxStoredSessions` and `sessionRetentionDays` prune history as documented.
- [ ] Policy changes made while the extension is open take effect without relying on a page reload.
- [ ] Teams Web/PWA, Google Meet, and Zoom Web capture regressions pass within their documented support boundaries.

## Enterprise pilot

- [ ] Security Architecture accepts or explicitly documents every open risk in `docs/SECURITY-ARCHITECTURE.md`.
- [ ] EUC validates assignment groups, exclusions, rollback, and break-glass ownership.
- [ ] Privacy/Legal approves the intended meeting classes, retention, attendee treatment, and recording/notice obligations.
- [ ] Help desk receives the deployment, diagnostics, rollback, and escalation runbooks.
- [ ] A limited pilot completes without unresolved high-severity security or data-loss findings.
- [ ] The frozen candidate remains unchanged for at least 48 hours while live Edge and Chrome UAT evidence is reviewed.

## Promotion decision

- [ ] Product owner confirms that the prior supported-store update is publicly available to existing users before starting the normal release cadence.
- [ ] Security reviewer signs the enterprise review record.
- [ ] Release owner records exact tag, commit, artifact hashes, and approvals.
- [ ] Edge Store submission is explicitly authorized and verified after upload.
- [ ] Chrome Web Store submission is explicitly authorized and verified after upload.
- [ ] Tenant rollout expands only after Store availability and pilot telemetry are confirmed.

If any checked condition changes, reopen the gate. Store approval, policy assignment, and successful installation are separate facts and must be recorded separately.
