# Enterprise Microsoft Graph Transcript Connector

Status: **implemented 5.3 development pilot; tenant validation pending**. This document does not claim that the connector is included in a Store package or approved for tenant deployment.

Working feature name: **Verified Teams Transcript**.

Administrator setup and rollback are defined in [Microsoft Entra App Registration for Verified Teams Transcript](ENTRA-GRAPH-APP-REGISTRATION.md).

## Product outcome

Better CaptionKeep now has an administrator-approved pilot connection to Microsoft Graph that lets a signed-in organizational user explicitly import an available Microsoft Teams transcript. The imported Graph artifact complements local live-caption capture; it does not silently replace it. The implementation remains unavailable unless valid tenant and application identifiers are supplied through managed policy.

The intended enterprise value is:

- no meeting bot joining the call;
- no developer-operated transcript service;
- explicit Microsoft Entra administrator consent;
- direct retrieval from Microsoft Graph on behalf of the signed-in user;
- local processing and retention under the extension's existing managed controls;
- independent provenance for the locally captured transcript and the official Teams transcript; and
- tenant-controlled revocation and speaker-attribution policy.

## Trust and consent model

The pilot requires two separate administrator decisions:

1. A Teams administrator enables Microsoft Graph transcript API access and decides whether Graph transcripts may include speaker attribution.
2. A Microsoft Entra administrator grants the Better CaptionKeep app registration the required delegated Microsoft Graph permission.

Administrator consent authorizes the capability. It does not initiate collection. A user must still sign in through Microsoft and explicitly request an import.

The extension is a public client. It must use authorization-code flow with PKCE and must never contain a client secret, certificate private key, tenant password, refresh-token export, or application-only credential. A fully unattended or organization-wide application-permission design requires a separately reviewed confidential service and is outside this pilot.

## Source and provenance boundary

The connector creates a second source artifact:

| Source | Meaning | Handling |
| --- | --- | --- |
| Local live capture | Captions Better CaptionKeep observed in the supported Teams page during the meeting | Preserve as the authoritative local-capture source |
| Microsoft Graph import | The Teams transcript Microsoft makes available to the authorized user after transcription | Preserve as an independent official-source import with tenant, meeting, retrieval-time, permission-mode, and attribution-state metadata |
| Comparison or reconciliation | Differences, matches, or derived combined views across the two sources | Treat as a derivative; never rewrite either source |

The initial pilot must not automatically merge, overwrite, or silently prefer one source. Evidence markers and notes must remain linked to the exact source and source-caption identifiers they reference.

## Release placement

### Now: 5.2 security hardening

Keep the packaged 5.2 scope focused on managed controls, deployment evidence, browser UAT, and the existing local-first trust boundary. Documentation-only Graph discovery may proceed without representing the connector as shipped.

### Now: 5.3 tenant proof and unpacked extension pilot

Run the connector as the highest-priority enterprise discovery item:

1. Register a single-tenant test application in the controlled Microsoft Entra tenant.
2. Enable Graph transcript access for the test environment and record the administrator settings.
3. Grant only the delegated transcript permission required by the tested endpoint.
4. Generate a synthetic Teams meeting transcript with no confidential or personal content.
5. Prove authorized transcript listing and content retrieval independently of Better CaptionKeep.
6. Validate the implemented unpacked-extension proof using interactive PKCE authentication and direct Graph calls.
7. Verify sign-in, explicit import, token expiry, sign-out, consent revocation, tenant-policy denial, missing transcript, disabled attribution, and error handling.
8. Verify that no token, authorization code, transcript text, or meeting identifier enters logs, source control, browser sync, release artifacts, or support evidence.
9. Complete security, privacy, Store-disclosure, and managed-policy review before proposing packaged-release scope.

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


