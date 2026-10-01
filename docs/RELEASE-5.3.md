# Better CaptionKeep 5.3 Graph Pilot Gate

Status: **unreleased development; first controlled tenant and Edge import validated; remaining pilot gates pending**. This record does not authorize Store submission, production consent, or tenant-wide deployment.

Version 5.3 carries the isolated **Verified Teams Transcript** pilot. It imports one available official Teams transcript after an organizational user signs in and supplies the meeting join link. Version 5.2 remains a separate security-hardening candidate and no promoted Store artifact is changed by this branch.

## Implemented scope

- [x] Single-tenant, managed opt-in using `graphTenantId`, `graphClientId`, and `enableGraphTranscriptImport`.
- [x] Authorization-code flow with PKCE through `chrome.identity`; no client secret or application credential.
- [x] Session-only token storage and explicit disconnect.
- [x] Exact Teams join-link validation and delegated lookup of one meeting.
- [x] Popup attempts current-meeting auto-fill, retains temporary Teams meeting-info links only for the active meeting, and resolves modern numeric meeting links without another permission.
- [x] Latest available transcript import with governed unattributed fallback.
- [x] Separate immutable raw Graph source, normalized captions, and hashed provenance in local history.
- [x] Chrome, Edge, and Chrome Store manifests declare the identity permission and exact Microsoft hosts.
- [x] Administrator registration, consent, validation, and rollback runbook.

## Automated gate

- [x] Unit and reliability tests pass on the exact commit.
- [x] Syntax, manifest, host, package, and Store-metadata checks pass.
- [x] Dependency audit reports no high-severity vulnerability.
- [x] Chrome and Edge unpacked and ZIP artifacts build successfully.
- [x] Graph packages contain no configured tenant identifier, client identifier, token, secret, or test account.
- [ ] A second reviewer approves authentication, storage, provenance, managed-policy, and permission changes.

## Tenant and browser gate

- [x] Create the controlled single-tenant Entra app registration from [the runbook](ENTRA-GRAPH-APP-REGISTRATION.md).
- [x] Grant only delegated `OnlineMeetings.Read` and `OnlineMeetingTranscript.Read.All`.
- [x] Enable and record the Teams transcript API control and attribution decision for the pilot tenant.
- [ ] Register and verify the exact unpacked Chrome and Edge callback URIs. Edge is verified; Chrome remains open.
- [ ] Import a synthetic transcript successfully in current Chrome and Edge. Edge 5.3.0 succeeded on 2026-09-29; Chrome remains open.
- [ ] Verify attributed and unattributed behavior, missing transcript, unauthorized meeting, expired token, disconnect, revoked consent, and disabled Teams API access.
- [ ] Confirm tokens and meeting data do not enter logs, sync, settings export, repository evidence, or packages.
- [ ] Confirm session deletion and managed retention remove both normalized and raw imported source artifacts.

## Promotion decision

Promotion requires the tenant/browser gate, privacy and security approval, Store disclosure review, existing Teams/Google Meet/Zoom regression UAT, a frozen commit, and at least 48 unchanged hours of live Chrome/Edge validation. Missing evidence moves the feature to a later release; it does not reduce the gate.

No Store upload or tenant production rollout is authorized by a successful local build.
