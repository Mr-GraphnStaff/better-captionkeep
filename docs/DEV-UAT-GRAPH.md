# Dev/UAT Graph Configuration

Better CaptionKeep's Chrome and Edge test builds can use a local Microsoft Graph configuration overlay for controlled development and UAT. This is not a license, consumer activation system, or Store feature.

## Boundary

- The overlay is generated only into `dist/chrome-unpacked` or `dist/edge-unpacked` after the normal package build.
- The source tree and every Store ZIP remain free of configured tenant IDs, client IDs, tokens, secrets, and test accounts.
- The service worker accepts the overlay only when the manifest name is exactly `Better CaptionKeep - Chrome Test` or `Better CaptionKeep - Edge Test` and `version_name` contains `development`.
- Production and Store builds continue to require managed organizational policy.
- Microsoft sign-in still uses delegated authorization-code flow with PKCE. No client secret is used.

## Build a configured unpacked test folder

Set these process environment variables without saving them in the repository:

- `BCK_DEV_UAT_GRAPH_TENANT_ID`
- `BCK_DEV_UAT_GRAPH_CLIENT_ID`

Then build and configure the selected target:

```powershell
npm.cmd run build:edge-test
node scripts/configure-dev-uat-unpacked.mjs edge
```

Use `build:chrome-test` and `chrome` for Chrome. Load the resulting unpacked folder in the browser. Rebuilding the target intentionally removes the overlay; run the configuration command again afterward.

Do not copy `devUatLocalConfig.js` into source, commit it, or add it to a release ZIP. The release checks must continue to prove that Store artifacts contain no configured Microsoft identifiers.
