# Better CaptionKeep 6.0.1

Development scope: Microsoft 365 administrator setup. This is not a frozen candidate or publication approval.

<!-- captionkeep-6.0.1-status:start -->
> **6.0.1 delivery status:** 6.0.1 is development on `dev`. Candidate frozen: no.
> Live provider certification outstanding: chrome, edge, brave, firefox, opera.
> Open release gates: fullScopeAcceptance, accessibilityAndFailureUat, artworkApproved, unchangedWindow, storeApproval, publicParity, installedUpgrade. Azure Boards epic: **#395**.
> This development record does not change prior publication records or inherit prior owner exceptions.
<!-- captionkeep-6.0.1-status:end -->

## Owner-approved scope — November 16, 2026

Prepare the working product and guided **initial Microsoft 365 / Intune deployment**, with clear documentation, launch messaging and user feedback. The owner explicitly deferred the new extension-settings editor until its separate testing is complete. This release must not silently include the new Intune-console editor, expanded initial-policy editor, ADMX/ADML transport or persistent management bridge.

Reuse the frozen publicly signed Administrator Setup **6.0.3** helper. Its installer is 173,179,224 bytes with SHA-256 `64baf5248e60624a8090d5be1afae0f5319dd37faa64eaf02c31829f89a94db4`; the current GitHub asset and local installer match. Its production-browser allowlist already includes Chrome and Edge Store identities. Preserve its signed endpoint worker, encrypted Intune package and descriptor together. A new browser setup entry point does not itself require rebuilding this helper.

The current development tree contains deferred work: a 27-key schema, extra setup controls, ADMX templates and bridge-capable worker. Building the entire current administrator tree would exceed the approved release scope. The release candidate needs a bounded browser change based on the verified 6.0.0 Production baseline, with the download/install/reconnect front door, optional `nativeMessaging`, the pinned 6.0.3 download and accurate permission disclosures. Production currently lacks this browser client and permission. Do not promote a Development folder wholesale or modify the existing signed installer asset.

The existing downloads-permission explanation also needs to describe the explicit remote installer download; claiming downloads are never used for remote content is incompatible with the new front door. Preserve existing extension identities and local-data boundaries.

Acceptance must distinguish browser-front-door permission/download/install/reconnect, installed helper launch, Intune assignment, endpoint/browser installation, employee Microsoft sign-in and completed transcript import. Existing pilot evidence establishes Chrome/Edge installation and employee sign-in/calendar discovery; completed import in that pilot is still unverified. The corrected Development schema now loads in Brave by owner confirmation, with 15 actual RE2 compilations, 207 restriction cases, eight focused tests and 163 synthetic worker contracts. These checks do not promote a production-ID artifact or validate the deferred bridge.

Launch preparation: [enterprise messaging](software-team/ENTERPRISE-LAUNCH-DECISIONS-2026-11-16.md), [administrator wiki source](wiki/Administrator-Deployment.md), [support and feedback](wiki/Support.md). They are reviewable source drafts until published. One free product remains the existing policy; no Enterprise paywall or new telemetry is introduced.
