# Same-install entitlement groundwork

Better CaptionKeep Free and a future Pro offering use one extension artifact and Store identity. Free is the deterministic default. Entitlement state is local metadata; activation never changes or deletes transcripts, settings, corrections, recovery data, or archives.

The repository-only groundwork defines `free`, `active`, `offline-grace`, `expired`, and `unavailable` states. It also defines a configurable feature-to-tier map. The map is empty by default, so issues #49 through #53 remain Free until an explicit product decision is reviewed. Managed security, privacy, retention, and export restrictions are evaluated first and cannot be bypassed by a Pro state.

Automated tests use a signed development fixture. The extension contains only its public verification key, not a production secret. Development fixtures are rejected unless a caller explicitly enables them; no production UI enables them. The fixture is not a commercial license and must not be used for Store release decisions.

Not implemented:

- billing, payment, checkout, subscription management, or license issuance;
- a production activation or verification service;
- tenant credentials, user identity upload, transcripts, captions, or analytics upload;
- organization entitlement policy or Intune assignment;
- any final Free/Pro feature allocation.

Future production verification can replace the stored entitlement source behind the same abstraction. It must retain Free operation on failure, use public-key verification or an approved authenticated service, define clock/offline behavior, and remain subordinate to managed policy.
