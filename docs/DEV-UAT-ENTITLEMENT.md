# Internal dev/UAT access passes

Better CaptionKeep 5.3 uses a short-lived signed capability pass for internal Graph transcript testing. This is a development control, not consumer licensing and not a permanent "golden key."

## Security boundary

- The private P-256 signing key stays outside the repository and extension packages.
- Chrome and Edge test builds contain only the public verification key.
- The public Chrome Store build rejects activation even when presented with a correctly signed pass.
- Each pass names one tester, identifies `dev` or `uat`, grants an allow-listed capability, and expires within 24 hours.
- Activation stores only verified, normalized claims and a signature fingerprint in `chrome.storage.session`. The bearer pass is not stored in sync, local history, logs, exports, or source.
- The service worker checks the capability again for every Graph status, connection, discovery, disconnect, and import action. Hiding a popup control is not the security boundary.
- Managed Graph configuration and tenant consent remain separate requirements. A pass cannot create an Entra registration, grant consent, or bypass Microsoft authorization.

The initial capability is `verified-teams-transcript`. Adding another capability requires a source change, review, and a new test.

## Issue a pass

The current signing key is a local development secret. Its expected path on the authorized workstation is:

`C:\Users\DavidFarris\.captionkeep-secrets\dev-uat-signing-private.jwk`

Issue an eight-hour UAT pass directly to the Windows clipboard:

```powershell
$env:BCK_DEV_UAT_PRIVATE_JWK = 'C:\Users\DavidFarris\.captionkeep-secrets\dev-uat-signing-private.jwk'
node scripts\issue-dev-uat-pass.mjs --subject "David Farris" --environment uat --hours 8 --clipboard
```

Use the test extension popup's **Internal dev/UAT access** section to paste and activate it. Then use the separately managed **Verified Teams transcripts** section. Closing the browser session or choosing **Clear pass** removes the entitlement.

Do not paste a pass into tickets, commits, screenshots, logs, chat, or release evidence. If a pass is disclosed, clear it and wait for its short expiry. If the private key is disclosed, generate a new key pair, replace the bundled public JWK and key ID, and rebuild every test package.

## Build behavior

Only manifests matching both of these conditions are eligible:

- Name is exactly `Better CaptionKeep - Chrome Test` or `Better CaptionKeep - Edge Test`.
- `version_name` contains `development`.

The source and Chrome Store manifests intentionally do not satisfy those checks. Load `dist/chrome-unpacked` or `dist/edge-unpacked` for UAT.

## Consumer boundary

This mechanism must not be marketed as Better CaptionKeep Pro, reused as a consumer subscription key, or treated as offline perpetual authorization. Consumer Pro can be described as coming soon only as roadmap copy; it needs a separate entitlement, recovery, revocation, privacy, support, and purchase design before launch.
