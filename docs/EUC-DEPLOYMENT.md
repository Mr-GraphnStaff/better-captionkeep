# Intune and EUC deployment

Better CaptionKeep is designed for Store-managed Microsoft Edge and Google Chrome deployment on managed Windows devices. The repository produces Intune-ready bundles without repacking either Store artifact or changing its signing identity.

This is the implementation runbook. Read the [security architecture](SECURITY-ARCHITECTURE.md) before approving a pilot and complete the [enterprise security review record](ENTERPRISE-SECURITY-REVIEW.md) for the adopting organization.

## Deployment principles

- Prefer the official Store identity and update URL.
- Apply installation and Better CaptionKeep managed settings as two explicit controls.
- Use a small named pilot group before broad assignment.
- Use synthetic meeting content for validation evidence.
- Treat forced installation as an administrative security decision: users cannot disable or remove a force-installed extension, and Edge site-level extension toggles do not stop policy-installed extensions.
- Do not claim Store availability, successful installation, policy enforcement, or rollback until each is verified on a managed pilot device.
- Do not unpack, modify, or re-sign a Store package under the Store identity.

## Responsibilities

| Role | Responsibility |
| --- | --- |
| Business sponsor | Approves purpose, eligible users, and prohibited meeting categories |
| Security Architecture | Reviews trust boundaries, permissions, risk treatment, and exceptions |
| Privacy/Legal | Decides notice, consent, attendee-capture, records, and jurisdictional requirements |
| Endpoint Engineering | Builds and assigns Intune configuration and remediation packages |
| Release Manager | Binds source revision, package, checksum, SBOM, attestation, and Store version |
| Help Desk | Supports installation, policy, capture-health, export, and removal diagnostics |

## Prerequisites

Before deployment, record:

- the reviewed full Git commit SHA and extension version;
- the exact Edge or Chrome Store extension ID;
- confirmation that the version is available through the intended Store channel;
- the SHA-256 of the release package and selected deployment profile;
- the pilot group and exclusion group;
- supported Windows and browser versions;
- endpoint encryption, managed-profile, EDR, DLP, browser-sync, and download-location decisions;
- permitted meeting classifications and prohibited use;
- whether attendee capture, clipboard, files, email drafts, or AI handoff are allowed;
- the incident, pause, rollback, and support owners.

## Build the deployment bundle

Use Node.js 20 or newer and install the reviewed lockfile with `npm ci`.

### Standard Edge profile

Run:

```powershell
npm run build:intune
```

Generated files are written to `dist/intune`:

- `edge-extension-settings.json` — importable JSON for Edge `ExtensionSettings` management;
- `edge-extension-force-install.txt` — the equivalent `ExtensionInstallForcelist` value;
- `managed-policy.json` — Better CaptionKeep policy values used for the bundle;
- `detect-managed-policy.ps1` and `remediate-managed-policy.ps1` — Intune Remediations scripts for the extension's `chrome.storage.managed` policy on Windows.

The committed standard profile uses the public Microsoft Edge Add-ons extension ID and Microsoft's official Store update URL. Override the ID with `CAPTIONKEEP_EDGE_EXTENSION_ID` only for a separately signed organization build with its own approved identity and update process.

### Hardened Edge profile

Run:

```powershell
npm run build:intune:local-only
```

The bundle in `dist/intune-local-only` is the recommended starting point for a security-sensitive pilot. It:

- disables AI handoff;
- disables clipboard release;
- disables Evidence Board email drafts;
- disables Teams attendee capture;
- forces scrubbed release output;
- limits completed history to five sessions and 30 days;
- permits scrubbed local file export unless the organization adds `disableFileExport: true`.

“Local-only” refers to the absence of an AI release path. An allowed file export is still outside extension storage and remains subject to Windows, DLP, synchronization, backup, and records controls.

### Chrome profile

The committed Chrome Store identity is recorded in `deployment/intune/profile.chrome.json`. Generate its deployment bundle with:

```powershell
npm run build:intune:chrome
```

The bundle is written to `dist/intune-chrome/` with Chrome-specific `ExtensionSettings`, force-install, detection, and remediation files. It uses Google's official Chrome Web Store update URL and writes managed values only beneath the Chrome policy path.

If an organization intentionally uses a different Chrome Store or private identity, supply that reviewed 32-character ID through `CAPTIONKEEP_CHROME_EXTENSION_ID`. Do not use an unverified ID copied from a test or unpacked installation.

## Review generated artifacts

Before importing anything into Intune:

1. Compare the extension ID with the approved Store listing.
2. Confirm that the update URL is the official Store URL for the target browser.
3. Compare `managed-policy.json` with the approved security-review record.
4. Confirm that the detection and remediation scripts reference only the expected browser path and extension ID.
5. Confirm that remediation removes and recreates only this extension's `policy` subtree so values removed from the profile do not remain stale.
6. Record SHA-256 hashes for the reviewed profile and generated artifacts.
7. Retain the reviewed artifacts in the governed change record; do not rebuild silently between approval and assignment.

## Recommended Intune deployment

### 1. Create the installation policy

In Intune, create a Windows configuration profile using the Settings catalog.

For Edge, add **Microsoft Edge > Extensions > Configure extension management settings** and import or paste the compact contents of `edge-extension-settings.json`.

For Chrome, use the equivalent **Google Chrome > Extensions** setting and the generated `chrome-extension-settings.json`.

`ExtensionSettings` is preferred to the simpler force-install list because installation mode, update source, toolbar state, and an optional minimum version remain in one per-extension object. The generated force-install text remains available for environments whose management standard requires it.

### 2. Add managed Better CaptionKeep settings

Create an Intune Remediations package using the generated scripts:

- detection script: `detect-managed-policy.ps1`;
- remediation script: `remediate-managed-policy.ps1`;
- execution context: SYSTEM;
- PowerShell host: 64-bit;
- signature enforcement: follow the organization's script-signing standard;
- schedule: frequent during pilot, then the organization's normal configuration-compliance interval.

The scripts do not install the extension. They manage the extension-specific values consumed through `chrome.storage.managed`.

### 3. Assign a pilot ring

Use a named device or user group with explicit membership. A typical sequence is:

| Ring | Suggested scope | Exit condition |
| --- | --- | --- |
| Lab | Endpoint Engineering and test accounts | Installation, policy, synthetic capture, export, and removal verified |
| Security pilot | 5–15 informed users | No unexplained disclosure, capture, compatibility, or support issue through normal use |
| Business pilot | One representative business group | Workflow and support model accepted; open risks owned |
| Controlled production | Staged business groups | Health and incident metrics remain within approved thresholds |

Do not assign the extension to the entire tenant while pilot evidence is incomplete.

### 4. Verify policy on a pilot device

For Edge:

1. Sync the device and browser policy.
2. Open `edge://policy` and reload policies.
3. Confirm the expected `ExtensionSettings` object and Better CaptionKeep third-party policy values.
4. Open `edge://extensions` and confirm the approved extension ID, Store source, version, and managed state.
5. Open the Better CaptionKeep popup and confirm managed controls are locked to the approved values.

For Chrome, use `chrome://policy` and `chrome://extensions`.

Capture screenshots only if they contain no account identifiers, tenant-sensitive URLs, policy secrets, or meeting data. Record version and pass/fail results in the security review record.

## Deployment profiles and managed keys

The standard profile forces Scrubby on while retaining reviewed BYOAI choice. It is appropriate only when the organization permits the corresponding release paths and supplies the surrounding DLP, AI-governance, endpoint, and user controls.

The hardened profile is a safer pilot baseline. Customize a copied profile for the organization rather than editing generated output by hand.

Managed settings override user controls:

| Key | Type | Effect |
| --- | --- | --- |
| `forcePrivacyScrubber` | Boolean | Keeps Scrubby enabled in managed UI paths |
| `forceProfanityFilter` | Boolean | Enables the optional local profanity rule |
| `forceScrubbedExport` | Boolean | Re-scrubs transcript, attendee, and evidence releases at enforcement points |
| `disableAiHandoff` | Boolean | Disables AI handoff generation and use |
| `allowedAiProviders` | String array | Restricts providers to supported identifiers |
| `chatgptWorkspaceUrl` | String | Locks an approved official HTTPS ChatGPT workspace URL |
| `claudeWorkspaceUrl` | String | Locks an approved official HTTPS Claude workspace URL |
| `claudeConsoleUrl` | String | Locks an approved official HTTPS Claude Console URL |
| `customScrubTerms` | String array | Adds up to 100 organization-selected local masking terms |
| `disableClipboard` | Boolean | Blocks transcript, handoff, viewer, and evidence clipboard actions |
| `disableFileExport` | Boolean | Blocks transcript/evidence files and discards pending file-export jobs |
| `disableEvidenceEmail` | Boolean | Blocks Evidence Board mail-draft creation |
| `disableAttendeeCapture` | Boolean | Stops and locks off Teams attendee collection |
| `disableSessionHistory` | Boolean | Prevents completed-session history and clears indexed history |
| `maxStoredSessions` | Integer 1–10 | Limits completed local session history |
| `sessionRetentionDays` | Integer 1–365 | Removes completed sessions older than the selected age |

`disableSessionHistory` does not disable short-lived recovery checkpoints. Document that residual persistence in the organization's risk decision.

Managed keys restrict actions supplied by Better CaptionKeep. They are not a substitute for browser or endpoint DLP, do not defeat developer tools or screenshots, and cannot recall a file, clipboard value, mail draft, or AI submission created before a policy change.

### Optional minimum-version control

The bundle generator accepts `minimumVersionRequired` in a deployment profile and writes `minimum_version_required` into `ExtensionSettings` after validating the browser extension version format.

Do not enable a minimum version until that version is verified available to the target Store population. A premature minimum can disable an older installed version before the replacement reaches every device.

## Required endpoint controls

Better CaptionKeep does not replace endpoint security. For confidential meeting content, require:

- BitLocker or equivalent full-disk encryption;
- managed Windows identities and browser profiles;
- supported OS and browser patch levels;
- EDR/antimalware and restricted local administrator access;
- extension allow/block governance;
- a browser-sync policy appropriate for workspace URLs and custom masking terms;
- DLP decisions for clipboard, Downloads, synchronized folders, email, and approved AI sites;
- controlled backup and records-retention behavior for exported files;
- a process for lost, reassigned, or offboarded devices.

## Functional and security validation

Use a synthetic meeting containing invented names and test patterns. Do not use a real confidential transcript.

Validate:

1. Teams Web and Teams PWA capture on both supported Microsoft hosts.
2. Google Meet capture and same-meeting recovery.
3. Zoom Web only when the deployed Store version explicitly includes promoted Zoom support.
4. Capture-health state, last-caption time, source-loss warning, and meeting-end behavior.
5. Managed attendee capture behavior.
6. Completed-history maximum, retention, deletion, and disabled-history behavior.
7. Clipboard, file, Evidence Board email, and AI restrictions.
8. Forced-scrubbed release from the popup, viewer, Evidence Board, automatic save, and service-worker path.
9. TXT and Markdown filename normalization and approved destination behavior.
10. Removal of pending export jobs when export is disabled.
11. Browser restart, PWA restart, policy refresh, extension update, and Windows restart.
12. Detection and remediation compliance results.

Scrubby tests must demonstrate supported masking and known false-positive/false-negative limits. A passing masking test is not evidence of HIPAA, PCI DSS, GDPR, or other certification.

## Operational monitoring

The local-first design intentionally has no developer telemetry. Enterprise operations therefore depend on endpoint and process evidence:

- Intune configuration and remediation status;
- managed-browser extension inventory and version;
- help-desk cases by version/provider/browser;
- scheduled synthetic UAT after material Teams, Meet, Zoom, Edge, or Chrome UI changes;
- Store availability and staged rollout status;
- GitHub validation, CodeQL, dependency, release-provenance, SBOM, and attestation evidence.

Do not collect real transcript contents for routine support. Prefer version, extension ID, policy state, capture health, sanitized DOM structure, timestamps, and reproducible synthetic steps.

## Pause and rollback

Test rollback in the lab and pilot rings before production assignment.

1. Pause additional Intune assignments.
2. Determine whether the issue is policy-only, provider-specific, browser-specific, or package-wide.
3. For a policy issue, deploy the previously reviewed managed profile and verify detection/remediation.
4. For a disclosure concern, immediately disable the relevant release paths through managed policy while preserving required incident evidence.
5. For a vulnerable package, pause promotion and prepare a validated Store update. Enforce a minimum safe version only after Store availability is confirmed.
6. For full removal, unassign the force-install policy from a test device first and observe uninstall and local-data behavior.
7. Separately manage exported files, clipboard history, mail drafts/messages, backups, and AI-workspace copies; extension removal cannot recall them.

Microsoft documents that removing an extension from `ExtensionInstallForcelist` causes Edge to uninstall it, but the exact organization configuration and `ExtensionSettings` interaction must still be tested before relying on that behavior.

## Evidence package

Retain the following for each approved release/deployment combination:

- full source commit SHA and immutable tag, if used;
- pull request, reviewers, required checks, and resolved findings;
- release ZIP, `SHA256SUMS.txt`, and `release-provenance.json`;
- CycloneDX runtime SBOM and verified GitHub artifact attestation;
- Store ID, version, listing URL, and availability evidence;
- exact source deployment profile and generated `managed-policy.json`;
- generated ExtensionSettings, detection, and remediation scripts with hashes;
- synthetic UAT results for each approved platform/browser path;
- policy and extension inventory evidence from a pilot device;
- completed enterprise security review, exceptions, owners, and expiry dates;
- rollback/removal result.

## Separately signed organization builds

A private organization build is a separate distribution architecture. It requires:

- signing-key generation, custody, backup, rotation, and recovery;
- an organization-controlled update manifest and highly available HTTPS hosting;
- a stable extension ID and explicit migration plan;
- build isolation, provenance, SBOM, attestation, and package verification;
- browser policy compatible with privately hosted extensions;
- incident response for signing or update-service compromise;
- separate validation from the public Store product.

Do not select private hosting merely to avoid Store review. Use it only when the organization accepts the additional signing and update-service responsibilities.

## External references

- [Manage Microsoft Edge extensions in the enterprise](https://learn.microsoft.com/en-us/deployedge/microsoft-edge-manage-extensions)
- [Use group policy to manage Edge extensions](https://learn.microsoft.com/en-us/deployedge/microsoft-edge-manage-extensions-policies)
- [Edge ExtensionSettings reference](https://learn.microsoft.com/en-us/deployedge/microsoft-edge-manage-extensions-ref-guide)
- [Edge ExtensionInstallForcelist policy](https://learn.microsoft.com/en-us/deployedge/microsoft-edge-policies/extensioninstallforcelist)
- [Chrome Enterprise extension installation](https://support.google.com/chrome/a/answer/7649924)

User settings export/import contains preferences only. It intentionally excludes transcripts, recovery checkpoints, saved sessions, evidence markers, and managed policy.
