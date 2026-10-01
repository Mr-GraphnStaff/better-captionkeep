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
- [x] Revoked Graph tokens clear session authentication and return the interface to reconnection.
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

### Code-complete candidate evidence — 2026-10-01

The full `release:candidate` gate passed against source commit `9cd46b3d24df54c8a244f723623b9fb74fd7fc98`: 117 of 117 tests passed, extension validation passed, the canonical Chrome publication dossier matched every permission, host, delegated scope, version, description, and Store asset, and the high-severity dependency audit reported zero vulnerabilities. The repository has no unresolved runtime `TODO` or `FIXME` marker. These are reproducible code-complete candidate artifacts, not authorization to upload or publish.

| Target | SHA-256 |
| --- | --- |
| Chrome unpacked-test ZIP | `B4D9FACC969C079B831A4DA9343F0C7965B3AFB10BCD951E1FBC12E28C1EF5EF` |
| Edge unpacked-test ZIP | `22E020459402C831490BA831EE3D2F85E351B573C272AD072A885B69E10683EC` |
| Edge Store ZIP | `FD9DA3E9301BBE2727EDC975A198FB0FC46D5361AB93F8A729D552007B017FE5` |
| Chrome Store ZIP | `8BD577A7A32190A1886DA88FE8C3D867A2F2118A73A9E5D778B0EF0B6C3E668B` |

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
