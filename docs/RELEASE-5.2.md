# Better CaptionKeep 5.2 Development Gate

Status: **unreleased development**. This record does not authorize Store submission, tenant-wide deployment, or a release-candidate claim.

Version 5.2 is the enterprise-security hardening line that follows the immutable 5.1.0 Store artifacts. It cannot reuse, replace, or retroactively describe those artifacts.

## Scope freeze

- [x] Source and manifests use version `5.2.0`.
- [x] Security architecture, threat model, enterprise review record, and EUC runbook are maintained in the repository.
- [x] Managed controls are enforced both in the interface and again at the action boundary.
- [x] The hardened local-only profile disables AI handoff, clipboard, evidence email, and attendee capture; forces scrubbed exports; and bounds local history.
- [x] Release automation emits an SBOM and provenance attestations and pins third-party actions to reviewed commits.
- [ ] Scope is frozen on one integration branch and release notes describe the exact candidate.

## Automated evidence

- [ ] `npm run release:candidate` passes on the exact commit.
- [ ] GitHub validation and CodeQL pass on the pull request.
- [ ] Edge and Chrome packages have distinct verified manifests and identities.
- [ ] The Intune standard, Chrome, and hardened bundles build from the managed schema.
- [ ] Release ZIPs, provenance, checksums, SBOM, and GitHub attestations are retained together.
- [ ] A second reviewer approves security-critical workflow, policy, and runtime changes.

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
