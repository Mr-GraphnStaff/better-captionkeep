# MCP guided preparation — development preview

This is the first repair increment for the failed 6.0 onboarding test, **not a
complete installation guide**. It removes manual configuration authoring but does
not yet let a fresh user complete the full journey independently. Do not repeat
the acceptance test expecting the installer/sign-in gaps to be solved.

## Try the preparation screens

Use the current installed development build in a disposable test profile. Do not
change your normal helper, Store installation, credentials or saved connections.
A localhost preview cannot supply a real installed-extension identity.

1. Open **All Settings → Connections — Bring Your Own MCP**.
2. Choose **Start guided setup**.
3. Select **Remote service** or **Local program**.
4. Enter a service name. For a remote service, enter its HTTPS MCP endpoint,
   without a token, credentials, query parameters or fragment. For a local server,
   do not enter a command into the browser; that review belongs in local setup.
5. Choose **Download setup request** and save the file. This exports identity and
   nonsecret service details only. It does not contact the service or install,
   authenticate, connect or execute anything.
6. Use **Back** to review earlier entries. A canceled/failed download should give
   a retryable message, not a completed connection.

If the page reports an unsupported environment, record it rather than attempting
to force another browser identity. The current guided browser preparation targets
Windows; browser-specific registration still needs actual acceptance.

## Local preparation — advanced development step

Only use a reviewed helper package supplied by the build owner. It needs Node.js
22+ separately. From the extracted package root, the command shape is:

```text
node companion/byomcp/setup.mjs --request <absolute-request-file> --output <new-private-output-folder> --save
```

This command is shown for developers/testers, not offered as a finished consumer
installer. Replace both placeholders with actual absolute paths and quote paths
containing spaces. Without `--save`, it prepares in memory and saves nothing.

The assistant asks for a folder on the browser storage volume for capacity checks.
It does not read your browser profile contents. For local stdio, it asks for the
exact executable, working folder and each argument separately, and computes the
hash locally without launching the server. Never supply credentials as arguments.
For remote HTTP, authentication is either the existing separate Cloudflare
helper-owned flow or a separately provisioned helper token environment; generic
OAuth onboarding is not implemented by this preparation tool.

Saving requires typing **SAVE**, an existing private parent folder and a new
output directory. Existing output is refused, not overwritten. It creates:

- `helper-config.json` — helper-side configuration, no secret values.
- `browser-configuration.json` — nonsecret binding for the extension.
- `com.daftech.captionkeep.byomcp.json` — native-host manifest.
- `host.cmd` on Windows (`host.sh` for helper preparation on macOS).

**Stop here unless the build owner has supplied a supported installation path.**
Saving files does not install/register a native host. Inherited Windows permissions
are not sufficient proof of a protected credential store: the separate installer
must establish and verify the required ACLs before Cloudflare sign-in. Do not
relax those checks or hand-edit registry entries to complete this guide.
Preparing another output folder does not safely add a service to an existing
helper; reviewed profile merging and upgrade/removal remain unfinished.

## Continue only with an already supported, prepared installation

### October 16 Windows development installation increment

The reviewed helper ZIP now also includes `companion/byomcp/windows-setup.mjs`.
It supports a NEW per-user Windows installation, with exact local review and
owner-only configuration, without hand-editing the registry:

```text
node companion/byomcp/windows-setup.mjs --request <absolute-request-file> --output <new-private-output-folder> --install
```

Run from the complete reviewed package in a trusted local folder, with Node.js
22+ installed separately. The output's existing parent must already be private;
unsafe or writable ancestors are refused. Do not change existing directory
permissions to bypass a refusal. The default without `--install` is an in-memory
preview. Review the exact browser identity, service, executable/arguments or
remote address, package/runtime paths and registration target before typing
**INSTALL**. For Brave/Opera, `--registration-convention chrome` records a
separate review of that browser's registration convention; it is not automatic
browser certification.

The command creates a new protected directory, writes generated configuration,
validates it and registers the exact binding. Existing directories or native
registrations are refused; profiles and credentials are not replaced or merged.
It prints the nonsecret browser-binding path for the deliberate import below.
Sign-in and MCP operations do not run during installation.

To unregister this installation, use its printed receipt path:

```text
node companion/byomcp/windows-setup.mjs --remove <absolute-registration-receipt-file>
```

Review the exact removal target and type **REMOVE**. Only the unchanged,
receipt-owned registration value is removed; files and credentials are retained.
Cancellation changes nothing. A failed partial installation reports retained
files and whether its owned registration rollback succeeded; do not delete or
overwrite an unrelated registration to retry.

The VM's isolated actual-Brave challenge tests passed after a new installation,
and receipt-owned unregistering restored the original absent registration value.
Both minimal and production-client-wrapper probes requested one challenge only;
no enrollment completion, provider request or tool execution occurred. This is
development integration evidence, not normal Settings/no-coaching acceptance.
The signed/standalone distribution, existing-profile addition/upgrade and generic
sign-in gaps below remain open. Do not present this command as a completed
consumer onboarding fix.

The wizard can point to the existing binding-import and **Connect enrolled helper**
controls. Choose the generated binding, review it and deliberately import it.
Select Connect yourself to request browser permission; the guide does not click
it for you. **Check connection result** reports helper enrollment only, not service
authentication, tool discovery or successful operations.

After separately approved authentication, select the verified profile and discover
its tools. An explicit operation review/approval remains necessary. Nothing from
a meeting is sent by setup or discovery. A generic response is not an independently
verified typed action Receipt. Disconnect does not revoke the provider's grant.

## Acceptance still open

Missing signed/standalone helper distribution, complete credential-store/sign-in setup, safe
existing-profile addition and generic service sign-in are product work, not
instructions for the tester to solve. Issue [#170](https://github.com/Mr-GraphnStaff/better-captionkeep/issues/170)
remains a release blocker. Use [M01–M10](software-team/TESTER-ACCEPTANCE-6.0.md)
to record actual results; no pass follows from generating files or reading this
guide. Safari is deferred; macOS helper template preparation is not Safari support.
