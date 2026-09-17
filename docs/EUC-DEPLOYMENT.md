# Intune and EUC deployment

Better CaptionKeep is designed for store-managed Microsoft Edge deployment. The repository produces an Intune-ready bundle without repacking the Microsoft Edge Add-ons artifact or changing its identity.

## Build the deployment bundle

Run `npm run build:intune`. Generated files are written to `dist/intune`:

- `edge-extension-settings.json` — importable JSON for Edge ExtensionSettings management;
- `edge-extension-force-install.txt` — the equivalent ExtensionInstallForcelist value;
- `managed-policy.json` — the Better CaptionKeep policy values used for this bundle;
- `detect-managed-policy.ps1` and `remediate-managed-policy.ps1` — Intune Remediations scripts for the extension's `chrome.storage.managed` policy on Windows.

The committed deployment profile uses the public Microsoft Edge Add-ons extension ID and Microsoft's official store update URL. Override the ID at build time with `CAPTIONKEEP_EDGE_EXTENSION_ID` only for a separately signed organization build.

## Recommended Intune deployment

1. In Intune, create a Windows configuration profile using the Settings catalog.
2. Add **Microsoft Edge > Extensions > Configure extension management settings**.
3. Import or paste the compact contents of `edge-extension-settings.json`. The profile force-installs the extension from Microsoft Edge Add-ons and keeps the toolbar entry visible.
4. Assign first to a small device pilot group, then expand in rings.
5. If managed CaptionKeep controls are required, create an Intune Remediations package with the generated detection and remediation scripts. Run in 64-bit PowerShell as SYSTEM.
6. On a pilot device, verify the browser policy at `edge://policy`, the installed extension at `edge://extensions`, and the locked controls in the CaptionKeep popup.

The simpler `ExtensionInstallForcelist` setting can use the single generated line in `edge-extension-force-install.txt`, but `ExtensionSettings` is preferred because the deployment intent stays in one per-extension object.

## Default enterprise posture

The versioned profile forces Scrubby on and disables AI handoff. This keeps meeting text local unless an administrator deliberately changes the managed policy profile, reviews the destination controls, rebuilds the bundle, and deploys the new policy. Profanity filtering is left off because it changes ordinary meeting language rather than protecting secrets.

Supported managed keys are defined by `teams-captions-saver/managed-schema.json`:

- `forcePrivacyScrubber` and `forceProfanityFilter` (boolean)
- `disableAiHandoff` (boolean)
- `allowedAiProviders` (array: `chatgpt`, `claude`, `claude_console`, `copilot`, `gemini`)
- `chatgptWorkspaceUrl`, `claudeWorkspaceUrl`, `claudeConsoleUrl` (official HTTPS domains are enforced at runtime)
- `customScrubTerms` (array of up to 100 organization terms)

Managed settings override and lock corresponding user controls. The generated remediation script writes only the named extension policy path. It does not change unrelated Edge policy.

## Validation and rollback

1. Pin deployment evidence to a reviewed commit and record the release-package SHA-256.
2. Pilot both supported Teams hosts and Google Meet with synthetic meeting data.
3. Verify capture health, recovery, cleaned output, history, export, and any approved AI destination.
4. Confirm that removing the Intune force-install assignment has the intended uninstall effect before broad rollout.
5. Roll out in stages and retain the previous policy profile for rollback.

An organization-built package is a separate deployment model: build and sign from a reviewed commit, host it through the organization's extension process, and use its own extension ID and update manifest. Never unpack the Store extension, modify it, and redeploy it under the Store identity.

User settings export/import contains preferences only. It intentionally excludes transcripts, recovery checkpoints, saved sessions, and managed policy.
