# Better CaptionKeep 5.3 Release Record

Status: **withdrawn from further promotion on October 4, 2026**. The immutable GitHub `v5.3.0` tag and release remain as historical evidence, but production-lane identity, local configuration, and Microsoft 365 visibility defects were discovered after publication. Do not use the `v5.3.0` ZIPs for Store submission, new unpacked installation, or tenant rollout. Recovery is tracked in [PR #67](https://github.com/Mr-GraphnStaff/better-captionkeep/pull/67); a new patch tag and artifacts require renewed live acceptance.

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
- [x] Store packages contain only the inert local-configuration placeholder and no configured Microsoft identifier.
- [x] Product owner completed the original live UAT and approved the October 3 promotion.
- [ ] Revalidate the corrected production lane after the post-release defects and create a new patch release; the original acceptance does not carry forward automatically.

### Production automation evidence - 2026-10-03

Release source commit `c17aed7e7805f18bafe982e7558e8b5a0a6aeed2` is tagged `v5.3.0`. It passed 177 automated tests, extension validation, the dependency audit with zero findings, the Chrome metadata/dossier check, GitHub validation, CodeQL, Azure Development validation, Azure UAT / Release Candidate build 561, and Azure production-baseline build 564. The product owner then accepted live UAT. The published GitHub release contains the two verified Store ZIPs, `SHA256SUMS.txt`, release provenance, and a runtime SBOM. Package workflow run 37168595228 completed successfully after PR #64 aligned artifact collection with the governed `dist/prod` lane; this release-control fix did not change tagged extension source.

| Target | SHA-256 |
| --- | --- |
| Published Edge Store ZIP | `EF51B9509FFC437C38BC601B96C5A6F1EC4A6EAFE2AAE5D61594BF63ECBC4069` |
| Published Chrome Store ZIP | `BE10ECB91DF0BFF2AE7DE455BF6A1D591099AA768D9031F5B72D5538B139F105` |

These hashes are recorded in the published `v5.3.0` release and verified by its checksum manifest and provenance record. Hash integrity proves which bytes were published; it does not make the now-superseded runtime behavior suitable for promotion.

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

The product owner accepted the original universal-access candidate and authorized production promotion on October 3, 2026. PR #61 merged that line into protected `master`; tag `v5.3.0` freezes exactly what was tested and published. Post-release defects invalidate it as the current production artifact authority. The tag and assets remain unchanged for auditability while the corrected candidate moves through Development, UAT, and Production again.

No Chrome Web Store upload, Edge Add-ons upload, Store submission, or tenant-wide rollout is authorized merely by this GitHub release. Those actions retain their separate approval gates.
