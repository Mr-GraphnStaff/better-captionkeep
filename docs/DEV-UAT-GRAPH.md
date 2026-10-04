# Dev/UAT Graph Configuration

Better CaptionKeep's single UAT release candidate can use a local Microsoft Graph configuration overlay for controlled validation in Chrome and Edge. This is not a license, consumer activation system, or Store feature.

## Boundary

- The overlay is generated only into `dist/uat` after the normal UAT build.
- The source tree and every Store ZIP remain free of configured tenant IDs, client IDs, tokens, secrets, and test accounts.
- The service worker accepts the overlay only when the manifest name is exactly `Better CaptionKeep - UAT Release Candidate` and `version_name` contains `uat release candidate`.
- Production and Store builds continue to require managed organizational policy.
- Microsoft sign-in still uses delegated authorization-code flow with PKCE. No client secret is used.

## Build a configured unpacked test folder

Set these process environment variables without saving them in the repository:

- `BCK_DEV_UAT_GRAPH_TENANT_ID`
- `BCK_DEV_UAT_GRAPH_CLIENT_ID`

Then build and configure the one UAT target:

```powershell
npm.cmd run build:uat
node scripts/configure-dev-uat-unpacked.mjs uat
```

Load `dist/uat` in Chrome or Edge. Rebuilding UAT intentionally removes the overlay; run the configuration command again afterward. Dev stays in `dist/dev`; the directly loadable production build and its release artifacts stay in `dist/prod`.

Do not copy `devUatLocalConfig.js` into source, commit it, or add it to a release ZIP. The release checks must continue to prove that Store artifacts contain no configured Microsoft identifiers.
