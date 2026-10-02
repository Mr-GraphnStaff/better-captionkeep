# Better CaptionKeep 5.3 Release Candidate Gate

Status: **consolidated unreleased development candidate; automated integration is passing, while dependency audit, new calendar consent, cross-browser UAT, and release gates remain open**. This record does not authorize Store submission, production consent, or tenant-wide deployment.

Version 5.3 is the single next-release line. It combines the existing **Verified Teams Transcript** QA candidate with the enterprise-security controls, complete BYOAI handoff, durable local archive and search, reversible transcript corrections and terminology dictionary, DOCX export, and same-artifact entitlement/Intune groundwork previously developed on the parallel 5.2 line. No promoted Store artifact or installed QA extension is changed by this source reconciliation.

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
- [x] Complete long-meeting BYOAI handoff preserves the full local evidence set and requires explicit user sharing.
- [x] Durable local transcript history, bounded paged search, and managed retention preserve recovery and provenance boundaries.
- [x] Reversible caption corrections and the local terminology dictionary retain the immutable raw transcript separately.
- [x] DOCX export uses the shared Scrubby and managed-export boundary; SRT/VTT remain excluded without trustworthy cue timing.
- [x] Same-artifact local entitlement and Intune groundwork preserve user data and defer to managed policy.

## Automated gate

- [x] Unit and reliability tests pass on the exact commit.
- [x] Syntax, manifest, host, package, and Store-metadata checks pass.
- [ ] Dependency audit is blocked by `node-forge` GHSA-86w9-cpqp-85rv through `web-ext` / `@devicefarmer/adbkit`; the offered force fix is a breaking tooling downgrade and is not accepted.
- [x] Chrome and Edge unpacked and ZIP artifacts build successfully.
- [x] Graph packages contain no configured tenant identifier, client identifier, token, secret, or test account.
- [x] Store packages contain no local dev/UAT overlay or configured Microsoft identifier.
- [ ] A second reviewer approves authentication, storage, provenance, managed-policy, and permission changes.

### Consolidated integration evidence - 2026-10-02

The reconciled source passes 151 of 151 automated tests, extension validation, and the canonical Chrome metadata/dossier check. This includes the existing Graph authentication, calendar, official-transcript, source-provenance, and dev-overlay coverage plus a combined service-worker/import/archive regression and the new archive, search, correction, DOCX, entitlement, policy, and recovery coverage. Package builds and exact-commit CI must be regenerated after the integration commit. The strict high-severity dependency audit remains a visible blocker; no audit suppression, forced downgrade, or vendored crypto change is authorized.

| Target | SHA-256 |
| --- | --- |
| Prior isolated 5.3 Chrome unpacked-test ZIP | `E3E2A3D8C42C842743A0BCA5B4D81C0FD49630A641CA26D046937C6A381CF57B` |
| Prior isolated 5.3 Edge unpacked-test ZIP | `999769A97718A3A213818D4B7D331F50A0BBB862F8BE3370A5110398B43AE8D8` |
| Prior isolated 5.3 Edge Store ZIP | `C42E21BA528ED4A7B63256119F461D1B3BAA463DAEFB8156FD47C6163006A363` |
| Prior isolated 5.3 Chrome Store ZIP | `AE88929CD94B01BB9E575DC36B95749DF4FCF0ED9C7C60F95EDEC8EB860E241C` |

Those hashes describe the earlier isolated Graph candidate and are retained only as lineage evidence. New consolidated hashes belong in the frozen 5.3 snapshot after the integration commit; generated artifacts remain outside Git.

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
