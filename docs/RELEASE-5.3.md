# Better CaptionKeep 5.3 Release Candidate Gate

Status: **polished unreleased candidate; official transcript import is validated in controlled Edge testing; new calendar consent, cross-browser UAT, and release gates remain open**. This record does not authorize Store submission, production consent, or tenant-wide deployment.

Version 5.3 carries the isolated **Verified Teams Transcript** candidate. It recognizes the current Teams meeting, shows up to five recent eligible Teams meetings, preserves manual link fallback, and explicitly imports one available official transcript after organizational sign-in. Version 5.2 remains a separate security-hardening candidate and no promoted Store artifact is changed by this branch.

## Implemented scope

- [x] Single-tenant, managed opt-in using `graphTenantId`, `graphClientId`, and `enableGraphTranscriptImport`.
- [x] Authorization-code flow with PKCE through `chrome.identity`; no client secret or application credential.
- [x] Session-only token storage and explicit disconnect.
- [x] Exact Teams join-link validation and delegated lookup of one meeting.
- [x] Popup attempts current-meeting auto-fill, retains temporary Teams meeting-info links only for the active meeting, and resolves modern numeric meeting links without another permission.
- [x] Five-recent-meeting selector uses delegated `Calendars.ReadBasic`, requests bounded basic fields, excludes future and non-Teams events, and does not retain calendar results.
- [x] Link entry remains available through a progressively disclosed fallback rather than leading the normal workflow.
- [x] Compact launcher keeps app-open controls separate from familiar quick-start actions directly below: Teams Meet now, Zoom New meeting, and Google Meet Start meeting.
- [x] Revoked Graph tokens clear session authentication and return the interface to reconnection.
- [x] Latest available transcript import with governed unattributed fallback.
- [x] Separate immutable raw Graph source, normalized captions, and hashed provenance in local history.
- [x] Chrome, Edge, and Chrome Store manifests declare the identity permission and exact Microsoft hosts.
- [x] Administrator registration, consent, validation, and rollback runbook.
- [x] Internal Chrome/Edge test builds may use an ignored local Graph configuration overlay generated only after packaging.
- [x] The service worker accepts that overlay only for exact development test manifests; Store builds continue to require managed organizational policy.

## Automated gate

- [x] Unit and reliability tests pass on the exact commit.
- [x] Syntax, manifest, host, package, and Store-metadata checks pass.
- [x] Dependency audit reports no high-severity vulnerability.
- [x] Chrome and Edge unpacked and ZIP artifacts build successfully.
- [x] Graph packages contain no configured tenant identifier, client identifier, token, secret, or test account.
- [x] Store packages contain no local dev/UAT overlay or configured Microsoft identifier.
- [ ] A second reviewer approves authentication, storage, provenance, managed-policy, and permission changes.

### Code-complete candidate evidence — 2026-10-01

The full `release:candidate` gate passed against source commit `86f7daba1ccc28e569b965155c9e5f1dd75a0450`: 120 of 120 tests passed, including the frozen-policy Graph overlay regression, extension validation passed, the canonical Chrome publication dossier matched every permission, host, delegated scope, version, description, and Store asset, and the high-severity dependency audit reported zero vulnerabilities. The repository has no unresolved runtime `TODO` or `FIXME` marker. These are reproducible code-complete candidate artifacts, not authorization to upload or publish.

| Target | SHA-256 |
| --- | --- |
| Chrome unpacked-test ZIP | `B22B633FD67F877E0F75D797F16D2E64625D8A67413FD7430DF7A532817806B2` |
| Edge unpacked-test ZIP | `393D9FC5880CC93494A303FD00857A470DB8B16CDC5FC2A825E9364C7F4E9819` |
| Edge Store ZIP | `44CE03F149615503AF6EE6DC92E480AF076B5132E9C8FCD9E781EDB7A49B4FE8` |
| Chrome Store ZIP | `8C80FDED18DA1DFFDE5EFF80D58AE901DBDEC518DD8B360ACD329388B32DECF8` |

The machine-readable local evidence is `dist/release-provenance.json`. It binds the generated packages to the source commit above; generated artifacts remain outside Git.

## Tenant and browser gate

- [x] Create the controlled single-tenant Entra app registration from [the runbook](ENTRA-GRAPH-APP-REGISTRATION.md).
- [ ] Grant and verify only delegated `Calendars.ReadBasic`, `OnlineMeetings.Read`, and `OnlineMeetingTranscript.Read.All`. The two transcript permissions are verified; the new basic-calendar scope requires updated tenant consent and live proof.
- [x] Enable and record the Teams transcript API control and attribution decision for the controlled test tenant.
- [ ] Register and verify the exact unpacked Chrome and Edge callback URIs. Edge is verified; Chrome remains open.
- [ ] Import a synthetic transcript successfully in current Chrome and Edge. Edge 5.3.0 succeeded on 2026-09-29; Chrome remains open.
- [ ] Confirm the recent-five selector returns only the controlled synthetic meetings and that current-meeting/manual-link fallbacks remain functional in Chrome and Edge.
- [ ] Verify attributed and unattributed behavior, missing transcript, unauthorized meeting, expired token, disconnect, revoked consent, and disabled Teams API access.
- [ ] Confirm tokens and meeting data do not enter logs, sync, settings export, repository evidence, or packages.
- [ ] Confirm session deletion and managed retention remove both normalized and raw imported source artifacts.

## Promotion decision

Promotion requires the tenant/browser gate, privacy and security approval, Store disclosure review, existing Teams/Google Meet/Zoom regression UAT, a frozen commit, and at least 48 unchanged hours of live Chrome/Edge validation. Missing evidence moves the feature to a later release; it does not reduce the gate.

No Store upload or tenant production rollout is authorized by a successful local build.
