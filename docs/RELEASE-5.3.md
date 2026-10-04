# Better CaptionKeep 5.3 Release Candidate Gate

Status: **next release candidate in the UAT / Release Candidate lane; dependency validation is cleared, while new calendar consent, cross-browser UAT, independent review, and promotion gates remain open**. This record does not authorize Store submission, production consent, or tenant-wide deployment.

Version 5.3 is the single next-release line. It combines the existing **Verified Teams Transcript** QA candidate with the enterprise-security controls, complete BYOAI handoff, durable local archive and search, reversible transcript corrections and terminology dictionary, DOCX export, universal feature access, and Intune groundwork previously developed on the parallel 5.2 line. No promoted Store artifact is changed by this source reconciliation.

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
- [x] The service worker accepts that overlay only for the exact UAT release-candidate manifest; Store builds continue to require managed organizational policy.
- [x] Complete long-meeting BYOAI handoff preserves the full local evidence set and requires explicit user sharing.
- [x] Durable local transcript history, bounded paged search, and managed retention preserve recovery and provenance boundaries.
- [x] Reversible caption corrections and the local terminology dictionary retain the immutable raw transcript separately.
- [x] DOCX export uses the shared Scrubby and managed-export boundary; SRT/VTT remain excluded without trustworthy cue timing.
- [x] Every shipped feature is available to every user; no commercial entitlement or feature-tier gate ships.
- [x] Intune groundwork preserves user data and defers to managed security and privacy policy.

## Automated gate

- [x] Unit and reliability tests pass on the exact commit.
- [x] Syntax, manifest, host, package, and Store-metadata checks pass.
- [x] Dependency audit passes after replacing the vulnerable `web-ext` packaging chain with the narrowly scoped `archiver` build dependency; no advisory suppression or forced downgrade is used.
- [x] Chrome and Edge unpacked and ZIP artifacts build successfully.
- [x] Graph packages contain no configured tenant identifier, client identifier, token, secret, or test account.
- [x] Store packages contain no local dev/UAT overlay or configured Microsoft identifier.
- [ ] A second reviewer approves authentication, storage, provenance, managed-policy, and permission changes.

### Candidate automation evidence - 2026-10-03

Candidate commit `4d98c5863f16f38d0d45a0c156fb39bea9f9fb31` passed 178 of 178 automated tests, extension validation, the dependency audit with zero findings, and the canonical Chrome metadata/dossier check. GitHub validation and CodeQL passed. Azure lifecycle runs 545 and 546 passed the Development and UAT / Release Candidate stages against that earlier candidate. The later universal-access decision removes the entitlement machinery and requires a fresh Dev and UAT evidence set before production promotion.

| Target | SHA-256 |
| --- | --- |
| Candidate Chrome unpacked-test ZIP | `2BD88A15DF9A5885F19CA73CABABBA19FDAF03CFD7FCA911EB73829419E88B32` |
| Candidate Edge unpacked-test ZIP | `A972A710B3BD0AA3BFE472D4777CFDD608BF606775E2C5887DAFA24019A6C814` |
| Candidate Edge Store ZIP | `50C3D64B1B7A1A23EA6305CDD9404510D139340EDD7A0D416894C84039DE74C8` |
| Candidate Chrome Store ZIP | `AA7501CE29B5FEF4005DAB96DF5200713DA8B88DD493FAD1248B0B97B3ACC348` |

These locally generated hashes record the automated candidate evidence. The UAT / Release Candidate lane will freeze and retain its final pipeline artifacts after the remaining browser and review gates identify the exact unchanged candidate; generated artifacts remain outside Git.

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
