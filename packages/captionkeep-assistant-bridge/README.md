# Better CaptionKeep assistant bridge reference

This package is a customer-owned reference SDK and native-messaging host for
Better CaptionKeep Evidence Actions. It does not contain an LLM, connector
credentials, or a default external destination. Customers supply an adapter
that implements `submit`, `status`, and `cancel` for their approved assistant.

The same versioned JSON request and response contract is used by the local
native host and the organization-hosted HTTPS profile. The package validates
job/action identity, the evidence seal, idempotency key, expiry, message size,
and the required rule that caption text is untrusted data.

## Build and test

Requires Node.js 20 or later.

```powershell
npm ci
npm test
```

## Implement an adapter

Create an ES module that exports `createAdapter()` or a default adapter object.
It must implement these asynchronous methods:

- `submit(request)`
- `status(request)`
- `cancel(request)`

Each method returns a protocol result with `state` and `remoteJobId`. A
successful research action must also return the cited `researchCard` required
by Better CaptionKeep. The included `examples/adapter.mjs` is deliberately an
in-memory contract example, not a production assistant.
`examples/file-inbox-adapter.mjs` uses the SDK's bounded durable inbox for a
restart-safe handoff to a customer worker.

Caption fields are quoted evidence. Never concatenate them into privileged
system instructions, shell commands, connector parameters, or destination
identifiers. Keep the user's action intent and the caption evidence in separate
structured fields. Any Jira, Microsoft 365, or other mutation must be shown as
a customer-side draft and confirmed there before execution.

Better CaptionKeep ships no Jira, Azure DevOps, Planner, Microsoft 365, email,
or other action connector. The customer connects and authorizes those tools in
its own assistant. A `prepare_work_item` adapter therefore returns
`confirmation_required` plus a structured `actionDraft`, waits for confirmation
in that customer-controlled environment, performs the action through the
customer's connector, and only then returns `succeeded` with
`customerConfirmed: true`, the external record identity or HTTPS URL, action
time, and the selected evidence IDs. A draft alone is never success.

## Run the local native host

During adapter development, set the absolute adapter path and start the Node
host directly:

```powershell
$env:CAPTIONKEEP_ASSISTANT_ADAPTER = 'C:\Program Files\Your Organization\CaptionKeep Bridge\adapter.mjs'
$env:CAPTIONKEEP_ASSISTANT_ID = 'your-org-assistant'
node dist\src\native.js
```

For the durable file-inbox adapter, also set
`CAPTIONKEEP_ASSISTANT_INBOX` to an absolute customer-controlled directory.
Only the selected reviewed evidence is written, but it is still meeting data:
restrict directory permissions, define retention, monitor access, and remove
the directory during uninstall when the customer's retention policy allows it.
The inbox uses deterministic job IDs so a restart or repeated submit with the
same idempotency key returns the existing job.

Native messaging uses Chromium's four-byte little-endian framing. Standard
output is reserved for framed JSON; diagnostics go to standard error.

For managed Windows enrollment, use the packaged
`native-host/windows-launcher/dist/win-x64/captionkeep-assistant-host.exe`.
The small auditable .NET 8 launcher reads
`captionkeep-assistant-host.json` from its own directory, requires absolute
non-reparse-point paths for Node, the packaged host script, and the customer
adapter, and relays standard input/output without interpreting evidence. Copy
and customize the adjacent `.json.example`; never place tokens in it. The
binary entry avoids dependence on Chromium's legacy batch-file launch behavior.

Copy and customize `native-host/com.example.captionkeep_bridge.json`, replacing
the launcher executable path, Chrome and Edge extension IDs, and host name. Remove any
unused placeholder origin. Register that manifest using
the browser vendor's native-messaging instructions, then enter the same host
name under **All Settings → Send to my assistant**. Keep the manifest and
executable writable only by administrators.

The example manifest is inert until customized and registered. Installation is
intentionally customer-controlled; nothing writes browser registry keys or
enrolls a host until an administrator explicitly runs the reviewed helper.

After packaging the host and restricting its files, administrators can use the
reviewable Windows helpers with `-WhatIf` first:

```powershell
.\native-host\Install-CaptionKeepNativeHost.ps1 `
  -Browser Chrome,Edge `
  -Scope LocalMachine `
  -ManifestPath 'C:\Program Files\Your Organization\CaptionKeep Bridge\com.example.captionkeep_bridge.json' `
  -WhatIf
```

Remove only that exact enrolled host with
`Uninstall-CaptionKeepNativeHost.ps1`; it supports the same `-Browser`,
`-Scope`, and `-WhatIf` controls and requires the exact host name. Chrome and
Edge each use their vendor-specific `NativeMessagingHosts` registry location.
If enterprise policy blocks user-level hosts or uses a native-host deny list,
deploy at machine scope and explicitly allow the enrolled host name.

Official platform references:

- [Chrome native messaging](https://developer.chrome.com/docs/extensions/develop/concepts/native-messaging)
- [Microsoft Edge native messaging](https://learn.microsoft.com/en-us/microsoft-edge/extensions-chromium/developer-guide/native-messaging)

## Remote HTTPS profile

Use the exported parser and handler inside the customer's authenticated HTTPS
service. The extension requires OAuth authorization code with PKCE, bearer
tokens, an exact approved HTTPS endpoint, and the same request/response JSON.
Do not expose an unauthenticated sample listener. Enforce tenant, audience,
client, subject, scope, expiry, request-size, rate, replay/idempotency, audit,
and retention controls at the customer service or gateway.
