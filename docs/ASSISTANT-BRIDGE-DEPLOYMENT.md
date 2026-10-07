# CaptionKeep assistant bridge deployment and operations

Status: 5.4 Development  
Last updated: 2026-10-05

## Responsibility boundary

The assistant bridge is optional and customer controlled. Better CaptionKeep
provides the versioned Evidence Action protocol, native-host runtime, customer
adapter interface, durable file-inbox adapter, enrollment helpers, and
deployment documentation. It does **not** provide an LLM, Jira, Azure DevOps,
Planner, Microsoft 365, email, or other action connector. It never needs those
connector credentials.

The customer owns the assistant, connector enrollment, identities, tokens,
permissions, tenant controls, retention, audit, and the confirmation that
authorizes an external mutation. A missing connector must produce an honest
failure; it must never fall back to another destination.

## Artifact and integrity

From the repository root, build the customer-deployable bundle:

```powershell
npm run package:evidence-actions
```

The command rebuilds both TypeScript packages and creates
`dist/prod/evidence-actions/better-captionkeep-evidence-actions-5.4.0-dev.zip`
plus `evidence-actions-provenance.json`. The provenance record binds the ZIP to
its SHA-256 digest, repository commit, and both dependency-lock digests. The ZIP
contains built runtime code, exact lockfiles, the Azure MCP template, protocol
documents, and native-host helpers. It contains no meeting evidence, tenant
identity, model configuration, connector, credential, `.env`, private key,
test fixture, or `node_modules` directory.

Before installing, compare the ZIP digest with the separately retained
provenance record and review `BUNDLE-MANIFEST.json` inside the archive.

## Local native bridge

Use the local profile when a customer-approved worker runs on the same Windows
device as Chrome or Edge.

1. Extract `assistant-bridge` into an administrator-controlled directory.
2. Run `npm ci --omit=dev` in that directory. The runtime uses Node.js 20 or
   later and built-in Node modules; the lockfile remains the installation
   authority.
3. Implement a customer-owned ES module exporting `createAdapter()` or a
   default object with asynchronous `submit`, `status`, and `cancel` methods.
   The SDK's file-inbox example is suitable for handing reviewed work to a
   separate customer worker without embedding a connector in CaptionKeep.
4. Place the packaged `captionkeep-assistant-host.exe` in the installation
   directory. It is a framework-dependent .NET 8 launcher whose only job is to
   start the reviewed Node bridge and relay native-messaging bytes unchanged.
   Copy `captionkeep-assistant-host.json.example` to
   `captionkeep-assistant-host.json` beside the executable and set absolute
   paths for Node, the packaged `dist/src/native.js`, and the customer adapter,
   plus the organization assistant ID. Do not put tokens in this configuration.
5. Copy and edit `com.example.captionkeep_bridge.json`: use an organization
   controlled reverse-domain host name, the absolute launcher path, and only
   the exact Dev, UAT, or production extension origins being enrolled. Remove
   every placeholder and unused origin.
6. Run `Install-CaptionKeepNativeHost.ps1` with `-WhatIf`, review the exact
   Chrome and/or Edge registry key, then run it without `-WhatIf` under the
   intended `CurrentUser` or `LocalMachine` scope.
7. In **All Settings → Send to my assistant**, select **Local bridge**, enter
   the exact enrolled host name, approve the optional browser permission, and
   test with synthetic evidence.

The manifest, launcher executable, adapter, runtime, and configuration should be writable
only by the intended administrator or software-distribution identity. Browser
enterprise native-host allow/deny policy must explicitly permit the chosen
host name. The manifest points to a binary rather than a batch script so it
continues to work when Chromium policy requires native hosts to launch
executables directly.

## Customer-hosted HTTPS bridge

Use the remote profile when the customer exposes its assistant through an
authenticated service. Integrate the SDK's `parseRequest`, `createHandler`, and
`createResponse` functions into that service; the reference bundle
intentionally does not expose an unauthenticated sample listener.

The customer endpoint must terminate TLS, use OAuth authorization code with
PKCE for the browser client, and validate exact issuer, audience, tenant,
client, subject, expiry, and scope on every request. It must enforce the 1 MiB
message bound, request rate, idempotency, audit, retention, and an exact
approved origin. CaptionKeep stores the access token only in browser session
storage and follows no redirects.

In **All Settings → Send to my assistant**, the administrator supplies the
exact HTTPS Evidence Action endpoint, authorization endpoint, token endpoint,
public client ID, and scopes. No client secret belongs in the extension.

## Neutral connector workflow

The bridge contract treats Jira, Azure DevOps, Microsoft 365, Microsoft
Planner, email, and a generic customer action as profiles over one neutral flow:

1. CaptionKeep submits a sealed `prepare_work_item` action containing only the
   user's reviewed evidence and intended destination profile.
2. The customer assistant checks that it has the named connector. It returns
   `failed` if the connector or permission is unavailable.
3. The assistant prepares a structured draft and returns
   `confirmation_required`. CaptionKeep seals and displays the draft but has no
   control that can confirm it.
4. The user reviews and confirms in the customer-controlled assistant.
5. The assistant invokes its connector and returns `succeeded` only with
   `customerConfirmed: true`, external system, record ID or HTTPS URL, action
   time, and evidence IDs drawn from the reviewed selection.

Caption text is untrusted data. It may inform the proposed title and
description, but it cannot select a connector, project, tenant, recipient,
permission, confirmation policy, command, or tool argument.

## Acceptance matrix

Run every applicable row in clean-profile Chrome and Edge using synthetic
meeting evidence before release:

| Case | Required result |
| --- | --- |
| Connector available | Draft appears in the customer assistant and CaptionKeep remains `confirmation_required` |
| User confirms | One external record is created and one matching receipt returns |
| User denies | No external record; job reports denial or cancellation, never success |
| Connector missing | Honest bounded failure with no fallback destination |
| Permission denied | Honest failure; no retry that could create a duplicate |
| Timeout or restart | Same idempotency key resumes or reports unknown; no duplicate mutation |
| Draft evidence changed | Seal verification fails and the altered draft is not displayed |
| Receipt lacks confirmation or record identity | CaptionKeep rejects success |
| Jira profile | Neutral contract; no Jira credential is visible to CaptionKeep |
| Azure DevOps profile | Same contract and confirmation boundary |
| Microsoft 365 profile | Same contract and confirmation boundary |

Record browser version, extension digest, bundle digest, assistant build,
connector test tenant/project, timestamps, outcomes, and sanitized record IDs.
Do not place customer tokens or meeting content in release evidence.

## Recovery and removal

For a suspected compromise, disable the assistant profile through managed
policy or All Settings, revoke customer tokens and connector assignments, stop
the worker or endpoint, and preserve customer audit evidence. Do not delete a
possibly relevant inbox until the customer's incident and retention process
authorizes it.

For the local bridge, run `Uninstall-CaptionKeepNativeHost.ps1` against the
exact enrolled host name and browser/scope. The helper removes only that
registration; separately remove the customer adapter, launcher, inbox, and
runtime under the customer's retention and software-removal process. For the
HTTPS bridge, remove or revoke the browser client and endpoint authorization.
CaptionKeep continues local capture, review, save, and export without either
bridge profile.

## Current verification limit

Automated tests prove protocol identity, evidence seals, idempotency,
customer-confirmation state, draft tamper rejection, receipts, native framing,
restart-safe inbox behavior, exact Chrome/Edge registry targets, read-only MCP
tools, package contents, clean extraction, production-only dependency installs,
an MCP negotiation from the extracted bundle, and a Windows launcher round
trip from the extracted executable. A real customer adapter, connector tenant,
native-host enrollment, OAuth endpoint, and clean-profile browser round trip
remain required live evidence.
