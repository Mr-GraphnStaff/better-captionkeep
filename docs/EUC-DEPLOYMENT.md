# EUC Deployment Guide

## Choose one deployment model

**Store-managed:** approve the Microsoft Edge Add-ons listing and deploy its Store ID through browser management. Store updates retain the extension identity and follow the approved package lifecycle.

**Organization-built:** clone a reviewed commit, build the package internally, sign/host it through the organization's extension process, and manage its distinct extension identity. Do not unpack a Store extension, edit it, and push the modified files back under the Store identity.

## Managed configuration

Better CaptionKeep 4.7 declares `managed-schema.json`. Supported policy keys are:

- `forcePrivacyScrubber` and `forceProfanityFilter` (boolean)
- `disableAiHandoff` (boolean)
- `allowedAiProviders` (array: `chatgpt`, `claude`, `claude_console`, `copilot`, `gemini`)
- `chatgptWorkspaceUrl`, `claudeWorkspaceUrl`, `claudeConsoleUrl` (official HTTPS domains only at runtime)
- `customScrubTerms` (array of up to 100 organization terms)

Managed settings override and lock their corresponding user controls. Browser policy names and deployment mechanisms depend on the organization's Chrome/Edge management platform.

## Change and rollback

1. Pin deployment to a reviewed commit and record the package SHA-256.
2. Pilot both Teams hosts with an isolated browser group.
3. Verify capture, recovery, cleaned output, AI destination, and export behavior.
4. Roll out in stages; retain the previous signed package and policy set for rollback.
5. Treat a repackaged build as a separate product artifact with its own testing and support ownership.

User configuration export/import contains preferences only. It intentionally excludes transcripts, recovery checkpoints, saved sessions, and managed policy.
