# Intune and EUC deployment

Better CaptionKeep is designed for store-managed Chrome and Microsoft Edge deployment. The repository produces Intune-ready bundles without repacking either store artifact or changing its identity.

## Build the deployment bundle

Run `npm run build:intune`. Generated files are written to `dist/intune`:

- `edge-extension-settings.json` — importable JSON for Edge ExtensionSettings management;
- `edge-extension-force-install.txt` — the equivalent ExtensionInstallForcelist value;
- `managed-policy.json` — the Better CaptionKeep policy values used for this bundle;
- `detect-managed-policy.ps1` and `remediate-managed-policy.ps1` — Intune Remediations scripts for the extension's `chrome.storage.managed` policy on Windows.

The committed deployment profile uses the public Microsoft Edge Add-ons extension ID and Microsoft's official store update URL. Override the ID at build time with `CAPTIONKEEP_EDGE_EXTENSION_ID` only for a separately signed organization build.

After the first Chrome Web Store upload creates a draft item, copy its 32-character extension ID and run:

```powershell
$env:CAPTIONKEEP_CHROME_EXTENSION_ID = '<Chrome Web Store extension ID>'
npm run build:intune:chrome
```

The Chrome bundle is written to `dist/intune-chrome/` with `chrome-extension-settings.json`, `chrome-extension-force-install.txt`, and Chrome-specific detection/remediation scripts. It uses Google's official Chrome Web Store update URL and writes managed extension policy only beneath the Chrome policy path. The standard Chrome profile also forces Scrubby on while preserving the user's AI-provider choice.

The standard profile leaves AI handoff available for individual Pro users, Team accounts, small businesses, and enterprises that permit reviewed AI use. Run `npm run build:intune:local-only` only when an administrator deliberately wants the separate high-security bundle in `dist/intune-local-only`.

## Recommended Intune deployment

1. In Intune, create a Windows configuration profile using the Settings catalog.
2. Add **Microsoft Edge > Extensions > Configure extension management settings**.
3. Import or paste the compact contents of `edge-extension-settings.json`. The profile force-installs the extension from Microsoft Edge Add-ons and keeps the toolbar entry visible.
4. Assign first to a small device pilot group, then expand in rings.
5. If managed CaptionKeep controls are required, create an Intune Remediations package with the generated detection and remediation scripts. Run in 64-bit PowerShell as SYSTEM.
6. On a pilot device, verify the browser policy at `edge://policy`, the installed extension at `edge://extensions`, and the locked controls in the CaptionKeep popup.

For Chrome, select the equivalent **Google Chrome > Extensions** settings, use the generated `chrome-extension-settings.json`, and verify the pilot at `chrome://policy` and `chrome://extensions`.

The simpler `ExtensionInstallForcelist` setting can use the single generated line in `edge-extension-force-install.txt`, but `ExtensionSettings` is preferred because the deployment intent stays in one per-extension object.

## Deployment profiles

The standard profile forces Scrubby on but leaves AI handoff available. It does not restrict providers, so Pro and Team users can keep using their chosen supported assistant through the existing reviewed-copy workflow. An organization can add `allowedAiProviders` and managed workspace URLs when it wants narrower destinations.

The separate `profile.local-only.json` forces Scrubby on and disables AI handoff. It is an explicit high-security choice for organizations that prohibit meeting text from leaving the browser. Profanity filtering is off in both profiles because it changes ordinary meeting language rather than protecting secrets.

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
