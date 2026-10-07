# Better CaptionKeep 5.4 Development Record

Status: **Development started October 4, 2026**.

Version 5.4 is the active development release. Work may proceed while the
frozen 5.3.2 Store submission completes review because the two releases use
separate branches, artifacts, evidence, and Azure Boards scope.

## Relationship to 5.3.2

Version 5.3.2 remains unchanged. It is not complete until:

1. Chrome Web Store publicly serves 5.3.2;
2. Microsoft Edge Add-ons publicly serves 5.3.2; and
3. an existing installation is proven to upgrade and run successfully in each
   supported browser.

Azure Boards bug **#297** remains active until those conditions pass. No 5.4
change may be added to, substituted for, or used to rebuild the frozen 5.3.2
packages.

## Committed 5.4 scope

| Workstream | User outcome | Azure Boards authority |
| --- | --- | --- |
| Canadian French and Spanish product localization | Users can operate the core product in English, Canadian French, or Spanish, including accessible UI, help, privacy, and Store-facing material. | Feature #308 and tasks #309-#313 |
| Managed language deployment | Administrators can set an approved UI language through the existing managed-policy model, with documented Intune deployment and fallback behavior. | Feature #308 |
| French and Spanish transcript translation readiness | The viewer exposes reviewed French and Spanish translation choices, makes browser capability/model-download state clear, preserves the original transcript and provenance, and fails explicitly when local translation is unavailable. | Feature #315 |
| Active-meeting and production reliability | Active sessions are protected from accidental loss, production defects discovered after 5.3.2 are triaged into 5.4, and browser-specific upgrade behavior receives repeatable regression coverage. | Feature #316 |
| Permanent release safeguards | Store-equivalent clean-profile UAT, machine-readable evidence, permission-delta review, frozen-digest testing, the uninterrupted candidate window, public-upgrade canaries, a single release-status authority, identity decisions, and release pre-mortems become enforced controls. | Feature #298 and tasks #299-#307 |
| Edge `_metadata` upgrade investigation | Reproduce and document the transient Edge Store loader warning, verify package boundaries, and pursue an upstream/browser resolution when the evidence confirms Store-added metadata is responsible. | Bug #317 |

## Data and privacy boundaries

- Translation remains on-device through supported browser capabilities. Better
  CaptionKeep does not add a publisher-operated translation or transcript
  server.
- The original transcript remains available and distinguishable from translated
  output.
- Language selection never sends a transcript to an AI provider automatically.
- Any AI handoff continues to require the existing user review and confirmation
  boundary.
- Localization does not change the customer-owned Entra registration model for
  Microsoft 365 transcript import.

## Defect intake

Beginning October 4, 2026, newly discovered product defects are recorded as
Bugs under the 5.4 reliability feature and fixed through Development before
promotion to the 5.4 release candidate. A production security, data-loss, or
Store-blocking defect may instead receive a separately governed hotfix from the
affected production baseline. A hotfix does not authorize unfinished 5.4 work
to enter 5.3.2.

## Explicitly out of scope

The following are not commitments for 5.4:

- live Google Drive/Docs or OneDrive/SharePoint upload transports;
- an additional meeting provider;
- publisher-hosted transcription, translation, analytics, or storage;
- paid or restricted feature tiers; and
- replacement of a customer's own Entra application registration with a shared
  publisher identity.

## Promotion gates

The 5.4 candidate cannot enter Production until all committed work is complete
and the normal release process passes, including automated validation,
permission/privacy review, clean-profile Chrome and Edge UAT, multilingual
accessibility testing, managed-policy validation, an unchanged 48-hour
candidate window, immutable artifact evidence, and explicit publication
approval.

## Lifecycle authority

- Azure Boards Epic **#314**: Better CaptionKeep 5.4 - Multilingual Enterprise
  and Reliability
- Development: topic branches and pull requests
- UAT / Release Candidate: `release/5.4`
- Production: protected `master` and immutable Store artifacts
- Release process: [RELEASE_PROCESS.md](RELEASE_PROCESS.md)
