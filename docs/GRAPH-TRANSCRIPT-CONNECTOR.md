# Enterprise Microsoft Graph Transcript Connector

Status: **implemented 5.3 development pilot; first controlled tenant and Edge import validated; remaining negative tests and Chrome UAT pending**. This document does not claim that the connector is included in a Store package or approved for tenant deployment.

Working feature name: **Verified Teams Transcript**.

Administrator setup and rollback are defined in [Microsoft Entra App Registration for Verified Teams Transcript](ENTRA-GRAPH-APP-REGISTRATION.md).

## Product outcome

Better CaptionKeep has a delegated connection to Microsoft Graph that lets a signed-in organizational user choose the active Teams meeting, select from up to five recent eligible calendar meetings, or paste either a current `/meet/` link or legacy `/l/meetup-join/` link before explicitly importing an available official transcript. The imported Graph artifact complements local live-caption capture; it does not silently replace it. Store builds carry the governed public-client identifier and use the organizational authority; tenant consent and Teams transcript policy remain authoritative, and managed deployments may override the packaged configuration.

When the popup opens over an active Teams tab, it attempts to populate the current meeting link locally. Because Teams exposes the canonical link through temporary meeting-information UI, the content script remembers the last valid link observed for that meeting and clears it when a later meeting starts in the same Teams SPA tab. After Microsoft 365 connection, the popup also reads a bounded 30-day calendar view and returns at most five Teams meetings that have already started. Only subject, start/end time, organizer flag, and Teams join information are requested; the result is not stored. Manual current-meeting selection and link paste remain explicit fallbacks. The modern `/meet/<numeric-id>` form is resolved through `joinMeetingIdSettings/joinMeetingId`; the legacy link continues to use `JoinWebUrl`.

The intended enterprise value is:

- no meeting bot joining the call;
- no developer-operated transcript service;
- explicit Microsoft Entra administrator consent;
- direct retrieval from Microsoft Graph on behalf of the signed-in user;
- recent-meeting discovery with the least-privileged read-only basic-calendar scope and no retained calendar index;
- local processing and retention under the extension's existing managed controls;
- independent provenance for the locally captured transcript and the official Teams transcript; and
- tenant-controlled revocation and speaker-attribution policy.

## Trust and consent model

The pilot requires two separate administrator decisions:

1. A Teams administrator enables Microsoft Graph transcript API access and decides whether Graph transcripts may include speaker attribution.
2. A Microsoft Entra administrator grants the Better CaptionKeep app registration the required delegated Microsoft Graph permissions: `Calendars.ReadBasic`, `OnlineMeetings.Read`, and `OnlineMeetingTranscript.Read.All`.

Administrator consent authorizes the capability. It does not initiate collection. A user must still sign in through Microsoft and explicitly request an import.

The extension is a public client. It must use authorization-code flow with PKCE and must never contain a client secret, certificate private key, tenant password, refresh-token export, or application-only credential. A fully unattended or organization-wide application-permission design requires a separately reviewed confidential service and is outside this pilot.

## Source and provenance boundary

The connector creates a second source artifact:

| Source | Meaning | Handling |
| --- | --- | --- |
| Local live capture | Captions Better CaptionKeep observed in the supported Teams page during the meeting | Preserve as the authoritative local-capture source |
| Microsoft Graph import | The Teams transcript Microsoft makes available to the authorized user after transcription | Preserve as an independent official-source import with tenant, meeting, retrieval-time, permission-mode, and attribution-state metadata |
| Comparison or reconciliation | Differences, matches, or derived combined views across the two sources | Treat as a derivative; never rewrite either source |

Teams remains the meeting service for both paths: it processes the meeting and renders live captions. Better CaptionKeep’s local-capture path reads those rendered captions and does not upload its saved browser copy. The official-source path is different: Teams transcription must run, Microsoft notifies participants, and Microsoft 365 retains the resulting transcript under the organization’s tenant controls before Graph can return it. A scheduled meeting, visible live captions, or a successful local export does not by itself prove that an official tenant transcript exists.

For Teams meetings, caption automation also attempts to start and verify Teams transcription and opens the participant roster by default when attendee tracking is enabled. The attempt can fail when the signed-in participant lacks the required meeting role, tenant policy blocks transcription, or Teams changes or withholds the control. The popup must show that state as a caution and must never claim that Microsoft 365 will retain an official transcript unless transcription is verified as running.

The initial pilot must not automatically merge, overwrite, or silently prefer one source. Evidence markers and notes must remain linked to the exact source and source-caption identifiers they reference.

## Release placement

### Now: 5.2 security hardening

Keep the packaged 5.2 scope focused on managed controls, deployment evidence, browser UAT, and the existing local-first trust boundary. Documentation-only Graph discovery may proceed without representing the connector as shipped.

### Now: 5.3 tenant proof and unpacked extension pilot

Run the connector as the highest-priority enterprise discovery item:

1. Register a single-tenant test application in the controlled Microsoft Entra tenant.
2. Enable Graph transcript access for the test environment and record the administrator settings.
3. Grant only delegated `Calendars.ReadBasic`, `OnlineMeetings.Read`, and `OnlineMeetingTranscript.Read.All`.
4. Generate a synthetic Teams meeting transcript with no confidential or personal content.
5. Prove authorized transcript listing and content retrieval independently of Better CaptionKeep.
6. Validate the implemented unpacked-extension proof using interactive PKCE authentication and direct Graph calls.
7. Verify sign-in, explicit import, token expiry, sign-out, consent revocation, tenant-policy denial, missing transcript, disabled attribution, and error handling.
8. Verify that no token, authorization code, transcript text, or meeting identifier enters logs, source control, browser sync, release artifacts, or support evidence.
9. Complete security, privacy, Store-disclosure, and managed-policy review before proposing packaged-release scope.

### First controlled live proof — 2026-09-29

- A scheduled synthetic Teams meeting produced one official transcript artifact.
- The managed Edge 5.3.0 pilot completed interactive Entra sign-in and explicit import.
- Meeting lookup, transcript listing, and attributed WebVTT content retrieval each returned HTTP 200.
- The imported source contained three caption cues and opened in the separate historical viewer with the Microsoft Graph source label.
- Sanitized source SHA-256: `9d62c19b2a1f015de405f660f48d73b37279dfe49139ef45e4bd419ad23930a6`.
- No token, authorization code, meeting identifier, or raw transcript content was added to repository evidence.
- Chrome extension UAT, denial/revocation cases, unattributed tenant behavior, and the uninterrupted candidate window remain open.

### Polished 5.3 candidate scope — 2026-10-01

- Replaces link-first pilot interaction with active-meeting selection, a five-recent-meeting list, and progressively disclosed manual fallback.
- Keeps calendar discovery transient and returns no calendar event identifier or organizer identity to the popup.
- Adds explicit revoked-token cleanup and plain-language recovery states.
- Records every delegated scope in the Store disclosure contract and administrator runbook.
- Adds automated coverage for recent-meeting filtering, future-event exclusion, bounded results, least-privileged scope, and revoked-token failure.

### Release promotion gate

The connector may enter a packaged release only after all of the following are true:

- the tenant proof succeeds using supported Microsoft Graph endpoints;
- the exact delegated permission and administrator-consent behavior are recorded;
- the authentication callback works in supported Chrome and Edge extension identities;
- token storage and service-worker lifecycle behavior pass security review;
- disconnect and administrator revocation fail closed;
- Graph and live-capture sources remain independently recoverable and identifiable;
- new manifest permissions and hosts have minimum-scope justification;
- `PRIVACY.md`, Store disclosures, security architecture, threat model, EUC runbook, and release notes describe the new data path;
- automated tests and live Chrome/Edge UAT cover the connector and existing providers; and
- the frozen candidate completes the normal uninterrupted 48-hour test window.

If these conditions miss scope lock, the feature moves to the following release train. The release gate must not be reduced to fit the feature into a date.

## Explicit non-goals for the first pilot

- Application-only or background tenant-wide transcript collection
- A developer-hosted transcript database or relay
- Live-caption replacement through Microsoft Graph
- Raw audio, video, screen-share, or real-time media-bot access
- Automatic import without a signed-in user's explicit action
- Calendar modification, attendee enumeration, event-body reading, or a persistent calendar index
- Automatic reconciliation that changes either source transcript
- A claim that Graph access is available when Teams transcription was not enabled or no transcript artifact exists

## Evidence to retain

- Entra application ID and tenant ID, but no credential or token
- Exact delegated Graph permission and administrator-consent record
- Teams transcript API and attribution setting evidence
- Sanitized test meeting identity and expected synthetic phrases
- HTTP status and response-shape evidence with transcript content removed
- Chrome and Edge extension IDs and redirect URIs used in the pilot
- Revocation, expiry, sign-out, and denied-access results
- Source/provenance comparison tests
- Candidate commit, package hashes, review approvals, and UAT record if promoted


