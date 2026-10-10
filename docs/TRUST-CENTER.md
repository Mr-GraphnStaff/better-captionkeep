# Better CaptionKeep Trust Center

Last reviewed: October 10, 2026

This public trust summary describes the product boundary and points to the
repository evidence behind it. It is not a certification, legal opinion, or a
substitute for an adopting organization's privacy, security, records, and AI
reviews.

## Product and data boundary

Better CaptionKeep is a Manifest V3 browser extension for Microsoft Teams,
Google Meet, and Zoom Web. It reads captions already displayed to the signed-in
participant; it does not record microphone, tab, system audio, or video. The
core transcript, archive, and Evidence Board markers are stored in the browser
profile. The publisher does not operate a transcript collection or AI service.

Optional Microsoft 365 transcript import uses a customer-owned, single-tenant
Entra registration. The existing AI handoff opens a user-selected AI workspace
and requires the user to review and transfer the prepared material. Better
CaptionKeep does not operate an assistant endpoint or automatic research
service.

Detailed flows and trust boundaries: [Security architecture](SECURITY-ARCHITECTURE.md)
and [security and privacy behavior](SECURITY-PRIVACY.md).

## Permissions

Host access is limited to the supported meeting surfaces and optional
Microsoft Graph access. Browser permissions support local storage, downloads,
the side panel, active-tab screenshots after a user request, and managed
configuration. The current Store values and plain-language justifications are
kept in [the Chrome Web Store dossier](../CHROMEWEBSTORE.md).

## Retention and deletion

Meeting history stays in the browser profile until the user deletes it or an
administrator's managed maximum or retention rule applies. Deleting a saved
session also removes its normalized transcript and bound source artifacts.
Exported files are outside the extension boundary and follow the customer's
endpoint, DLP, backup, and records controls. Removing the extension clears its
browser-owned storage subject to browser behavior; organizations should verify
their own managed-uninstall and rollback path.

## Administrative controls

Managed browser policy can restrict providers, attendee capture, AI handoff,
clipboard, file export, evidence email, saved history, retention, privacy
scrubbing, and approved handoff destinations. Meeting-source actions remain
explicit: opening the side panel does not enable captions, open attendees, or
request a Teams transcript. See the [deployment guide](EUC-DEPLOYMENT.md) and
the versioned [managed schema](../teams-captions-saver/managed-schema.json).

## Build and release integrity

The release pipeline runs automated tests, linting, dependency audit, Store
metadata checks, target-specific builds, and package verification. Governed
releases retain SHA-256 checksums, source/package provenance, a CycloneDX
runtime SBOM, and artifact attestations with the release. See the
[release process](RELEASE_PROCESS.md). These controls reduce supply-chain risk;
they do not make publisher or Store compromise impossible.

## Vulnerability reporting

Do not place vulnerabilities, credentials, or real meeting data in a public
issue. Use the repository **Security** tab and **Report a vulnerability** to
open a private advisory. The requested report contents and supported-version
policy are in [SECURITY.md](../SECURITY.md).

## Known limitations

- Live DOM selectors can change when a meeting provider changes its interface;
  each release requires clean-profile Chrome and Edge live UAT.
- Zoom Web's tested caption surface may not expose speaker identity; the
  product reports `Unknown speaker` instead of inventing attribution.
- Captions and translations can be incomplete or wrong. The captured source
  caption remains authoritative.
- Privacy Scrubber reduces accidental disclosure but is not DLP and cannot
  guarantee removal of every sensitive term.
- Customer-owned Microsoft 365 and AI handoff destinations inherit the customer's licensing,
  tenant policy, retention, audit, and service availability.
- There is no publisher-operated centralized compliance log, cloud retention
  service, or server-side DLP.

Release-specific open checks and accepted evidence remain in the applicable
version record; development material must not be represented as Store approval.
