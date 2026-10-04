# Local Unpacked Microsoft 365 Configuration

Better CaptionKeep's Dev, UAT, and Prod unpacked lanes can use the same local Microsoft Graph configuration for controlled validation in Chrome and Edge. This is not a license or consumer activation system.

## Boundary

- The configured overlay is generated only into the selected `dist/dev`, `dist/uat`, or `dist/prod` folder after its normal build.
- The source tree and every Store ZIP remain free of configured tenant IDs, client IDs, tokens, secrets, and test accounts.
- The service worker accepts the overlay only for the three canonical lifecycle manifest identities.
- Dev, UAT, and local Prod each carry a fixed public manifest key, so their extension IDs and Microsoft redirect URIs remain stable across rebuilds and upgrades.
- Store packages carry an inert placeholder. Managed organizational policy remains the deployment mechanism for signed Store installations.
- Microsoft sign-in still uses delegated authorization-code flow with PKCE. No client secret is used.

## Build a configured unpacked test folder

Set these process environment variables without saving them in the repository:

- `BCK_DEV_UAT_GRAPH_TENANT_ID`
- `BCK_DEV_UAT_GRAPH_CLIENT_ID`

Then build and configure the selected target. For UAT:

```powershell
npm.cmd run build:uat
node scripts/configure-dev-uat-unpacked.mjs uat
```

Use `dev`, `uat`, or `prod` as the final command argument, then load that same folder in Chrome or Edge. Rebuilding a lane intentionally replaces its configured overlay with the inert placeholder; run the configuration command again afterward.

A normal build contains an inert `unpackedLocalConfig.js` placeholder so Chromium never reports a failed script fetch. The configuration command replaces that placeholder only in the selected authorized unpacked lane. Dev, UAT, and Prod therefore expose the same configured Microsoft 365 behavior during local validation.

Register each lane's redirect URI once. A normal rebuild or version upgrade does not require an Entra redirect change. Removing the manifest key or loading a different ad hoc folder is unsupported because either action can create a different browser identity.

Do not copy a configured `unpackedLocalConfig.js` into source or commit it. The release checks must continue to prove that Store artifacts contain no configured Microsoft identifiers.
