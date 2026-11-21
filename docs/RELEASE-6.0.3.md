# Better CaptionKeep 6.0.3

Scope: guided Microsoft 365 / Intune administrator setup entry point. This is a
release record. The November 20 publication decision accepts documented unfinished checks; Store review and public availability remain separate outcomes.

<!-- captionkeep-6.0.3-status:start -->
> **6.0.3 delivery status:** 6.0.3 is development on `dev`. Candidate frozen: no.
> Live provider certification outstanding: chrome, edge, brave, firefox, opera.
> Open release gates: fullScopeAcceptance, accessibilityAndFailureUat, unchangedWindow, storeApproval, publicParity, installedUpgrade. Azure Boards epic: **#395**.
> This development record does not change prior publication records or inherit prior owner exceptions.
<!-- captionkeep-6.0.3-status:end -->

## Version

The extension version 6.0.3 matches the publicly signed Administrator Setup
6.0.3 helper it downloads. Extension versions 6.0.1 and 6.0.2 were development
labels only and were never published. This record replaces the unpublished
6.0.1 development record for the same owner-approved scope (Azure Boards epic
#395) and does not inherit the 6.0 owner exception.

## Scope (owner-approved November 16, 2026)

A bounded browser change on the published 6.0.0 baseline:

- Organization setup entry point that opens the installed Administrator Setup,
  or downloads its installer for the administrator to run manually before reconnecting.
- Optional `nativeMessaging` permission, requested only when an administrator
  opens organization setup, for one fixed native host.
- Pinned download of `admin-setup-v6.0.3-r2/BetterCaptionKeep-AdministratorSetup-6.0.3-win-x64.exe`
  (173,196,280 bytes, SHA-256
  `a007f49ad1709d57ec63c49dff16ce7382127ef5e99e6396ca4cae5c476185f5`). The
  extension does not verify each download's hash in the browser and does not
  execute the installer.
- Corrected Store disclosures: the `downloads` justification now describes the
  explicit installer download, and `nativeMessaging` is disclosed as optional.
- Strict native reply handling (issue #231): only a boolean `ok: true` is a
  success; an uncertain outcome tells the administrator to check for an open
  setup window instead of claiming no change occurred.

Explicitly excluded (deferred by the owner): the new Intune-console settings
editor, the expanded 27-setting managed schema, ADMX/ADML templates and the
persistent management bridge.

The five extension files are the reviewed front-door candidate, applied without
modification apart from the version label.

## Acceptance still unfinished — publication exception recorded

- Production-ID browser flow in Chrome and Edge: permission prompt, download,
  install, launch, reconnect, decline and failure paths.
- Installed helper launch from the extension; Intune assignment; endpoint
  browser installation; employee Microsoft sign-in; completed transcript import.
- Visual and accessibility review of the new popup entry point.
- Live certification for Chrome, Edge, Brave, Firefox and Opera.
- 48 uninterrupted hours on the unchanged frozen candidate.
- Store drafts reviewed with the updated permission justifications before
  submission.

## November 20 publication decision

The owner directed publication to both Stores despite the known QA identity failure and unfinished checks. See [the exact decision and limitations](release-state/6.0.3-owner-publication.md). No failed or unfinished acceptance is recorded as passed.
