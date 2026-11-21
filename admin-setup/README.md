# Better CaptionKeep Administrator Setup

This folder contains the .NET 10 WPF administrator setup application and its browser native-messaging launcher.

## Guided installer delivery (published pilot)

The extension checks its native helper when the administrator chooses **Open administrator setup**. A missing helper leads to **Download and install** or **Cancel**. After Windows installation, **Continue setup** retries the browser connection. Downloads and installation are separate states; downloading a file does not prove the helper is installed.

`scripts/build-admin-installer.mjs` builds a current-user Windows installer from a verified fresh package inventory. It registers the Chrome, Edge and Brave native-host connections and provides an uninstaller. It does not change certificate trust, browser extension policy or Microsoft 365 resources. The installer is not a replacement for endpoint deployment verification.

Release preparation supports Azure Artifact Signing through `scripts/Sign-AdminRelease.ps1` and `scripts/sign-admin-payload.mjs`: owned binaries and PowerShell payloads are signed before inventory hashing, then the uninstaller and outer installer are signed. Public release requires an active **Public Trust** profile and timestamped signatures matching the reviewed publisher. The existing Private Trust profile cannot be substituted. No signing credentials or developer-local settings belong in the package.

The signed [Windows installer pilot](https://github.com/Mr-GraphnStaff/better-captionkeep/releases/tag/admin-setup-v6.0.1) is published. Anonymous download bytes, checksum sidecar, GitHub asset digest and timestamped public signature were verified before enabling the download button. The browser copy in Dev now uses that same enabled flow. The user must run the downloaded installer on the Windows PC running the browser: a shared project drive does not share native-host registry registrations. Local installation tests on the build host do not prove a different browser PC is installed. Actual browser-PC installation/reconnection and live Microsoft 365 deployment remain separate acceptance.

## Administrator deployment path

The primary **Set up Microsoft 365** action opens the packaged, graphical enterprise deployment engine. It uses Microsoft's Graph PowerShell sign-in, discovers the signed-in organization, lets the administrator choose browsers and an existing security group, and previews the exact application, consent, Teams and Intune changes before approval. Customers do not create a bootstrap application or type tenant/client IDs for this path.

The engine retains a durable receipt and supports **Check deployment status** and **Continue saved setup**. Fresh cloud resources are independently read back before confirmation. Interrupted or uncertain operations remain unresolved and are reconciled before another create attempt. An assignment accepted by Intune is displayed separately from device installation and employee transcript acceptance.

New deployments use a static, publicly signed native endpoint worker packaged by Microsoft's Win32 Content Prep Tool. Customer settings are validated data passed separately from the signed executable. The helper uploads the encrypted package to Intune, verifies the app's authored settings and content, then assigns the reviewed group. Receipts retain app/version/file identities; continuation reuses them and renews expired upload authorization for that same file. An uncertain content commit is reconciled by readback rather than repeated blindly.

The main window shows progress immediately, including prerequisite lookup and separate Graph/Teams sign-in phases. Microsoft owns account selection, MFA and consent. While authentication is pending, **Show Microsoft sign-in** brings forward only a popup owned by this setup. Modern owned WPF dialogs handle choices, review and results. A canceled or timed-out sign-in returns to setup with guidance based on whether a receipt actually exists.

The primary administrator flow requires no customer signing account, certificate, Azure CLI or `administrator-settings.json`. The publisher signs the fixed release files once. The administrator signs into Microsoft and reviews the organization, group and proposed changes. The setup package must satisfy the organization's execution policy; the launcher never bypasses it. Microsoft prerequisites are offered with explicit approval. Existing shared Microsoft provisioning consent is retained when ownership cannot be established, and this is disclosed.

Intune Win32 success confirms policy configuration and matching detection rules. Store extension installation, enabled browser runtime and employee Microsoft 365 sign-in remain distinct observations. The native worker's Verify operation is read-only; installation/removal preserve typed policy before-images and refuse conflicting ownership or drift.

### Legacy platform-script receipts

A saved deployment paused before script upload can switch from its original local signer through a separate **Use Azure Artifact Signing** review. The review states the four signing operations for Edge and Chrome and preserves the original plan, receipt, resource IDs and partial files. New signed payloads use a separate revision folder. The deployment review remains separate, and uncertain signing operations cannot be automatically repeated.

Local certificate selection now checks the signing chain before application, consent and Teams provisioning. Setup does not install certificate trust. Local signing records the exact unsigned and signed hashes and independently verifies the approved signer and body. Continuation can reconcile an already signed partial file only after its signature is trusted and its exact reviewed payload matches; it never overwrites that file. The original embedded configuration bytes and endpoint marker hash are preserved across PowerShell processes. The main window's title-bar commands use the same close guards as Exit, and failed signing retains the deployment step rather than implying verification finished.

Build a self-contained Windows x64 Development candidate using the checked working-area launcher:

```powershell
python C:/Users/DavidFarris/.codex/tools/working_area.py run --root 'P:/Projects/Better CaptionKeep' -- node scripts/build-admin-setup.mjs 'P:/Projects/Better CaptionKeep/Dev/administrator-setup'
```

The builder uses .NET 10, places compiler/NuGet caches in `working/`, requires an empty destination, and packages the enterprise engine with checksums. Open `BetterCaptionKeep.AdminSetup.exe` from that folder. This unsigned Development candidate is not a production-certified installer. Live tenant/endpoint acceptance, signing, and protected promotion remain distinct release gates.

The remaining sections describe the optional advanced C# development workflow, not the primary complete enterprise-engine path.

## Experience choice, transport mode, and bootstrap

The launcher transport still passes `--mode real` or `--mode preview` (`preview` remains the fail-closed default), but transport mode does not start services. The Welcome screen always requires an explicit in-app choice:

- **Run guided demo** uses only preview services and in-memory Contoso/example state. It does not authenticate, request consent, contact Microsoft, create a journal, save a receipt, or perform a tenant or endpoint operation. It ends with a clearly labeled sample receipt and offers **Run demo again** and **Close**.
- **Start real setup** checks the protected local bootstrap. If it is missing or invalid, a prerequisite checklist is shown before any administrator or sign-in screen; no network or journal service is created.

Real mode also fails closed unless a protected installation places `setup-bootstrap.json` beside the executable with a reviewed, non-secret Development public-client ID, its single-tenant tenant ID, and the exact tenant authority `https://login.microsoftonline.com/{tenant-id}`. The authority tenant must match the configured tenant ID; `/organizations`, `/common`, `/consumers`, malformed, cross-tenant, or widened authority values are rejected. Missing or invalid bootstrap configuration leaves Microsoft sign-in and Graph operations unavailable.

This tenant-bound bootstrap is for the protected Development vertical slice only. It is not the customer product bootstrap and does not require customers to pre-create the setup application. A one-click Production experience needs a separately governed, publisher-owned multitenant public-client identity and release trust chain; that Production bootstrap is not implemented or installed by this Development slice.

## Current real-write slice

The real workflow:

- signs in through MSAL and Windows Web Account Manager;
- requests `GroupMember.Read.All` only for existing security-group discovery;
- binds the tenant, administrator account, group, exact application fields, redirect URIs, action, drift policy, build identity, expiry, and artifact fingerprints into an immutable reviewed-plan digest;
- offers a first-class manual path that opens Microsoft Entra app registrations, supplies the exact redirect URI, validates the administrator-entered tenant/client GUIDs, and saves a non-secret local configuration receipt without requesting broad provisioning permission;
- for guided automatic setup, after explicit final approval, requests temporary delegated `Application.ReadWrite.All` and discloses that it is broad application-management access;
- creates at most one customer-owned Entra application registration for the durable operation marker, or observes an exact existing match;
- never PATCHes, deletes, or rolls back a drifted application; drift stops for manual review;
- persists a redacted durable receipt and blocks a new operation while the bound tenant/account has unresolved prior work;
- serializes each operation with an interprocess file lock and never blindly repeats an ambiguous POST.
- after the customer-owned application is verified, removes the exact Better CaptionKeep bootstrap service principal, clears the local MSAL account/token cache entry, records both cleanup results and the provisioning-token expiry in the durable receipt, and refuses to report success if cleanup is not confirmed;
- states that Microsoft may continue accepting an already-issued access token until its recorded expiry even after consent/bootstrap cleanup.

After a successful POST, returned object and application IDs are persisted as observed-but-unverified. The application is then read by object ID and its full approved state must match before the result becomes confirmed.

Automatic setup may cause Microsoft consent to create the bootstrap service principal and delegated grant needed for the disclosed setup permissions. After the customer-owned application is verified, the bootstrap service principal is removed and the local MSAL cache is cleared; the receipt records cleanup and the remaining access-token expiry window. The customer application receives no secret, certificate, service principal, delegated grant, or application grant in this slice.

This slice does **not** deploy Intune policy or scripts, assign groups, modify endpoints, or verify employee OAuth. Those capabilities remain disabled.
