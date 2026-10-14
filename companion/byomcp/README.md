# Optional BYOMCP helper prototype

Private, separate Node.js 22 package. Core extension behavior and permissions are
unchanged. No installer, native registry edits, OS credential provisioning,
publisher endpoint or real customer account is supplied here.

`@modelcontextprotocol/client` is exactly 2.3.1 (isolated lockfile). MCP is pinned
to 2026-07-28 with no older-protocol fallback. The official SDK handles protocol
negotiation/framing; this code does not invent a private MCP dialect.

Run from this directory: `npm ci --ignore-scripts`, then `npm test`.
From the project root also run `node --test tests/byomcp-contracts.test.cjs`.

## Embedding contract

`createHelper` receives caller identity, enrolled caller allowlist, enrollment
ID, OS-local reviewed profiles, adapters and enforcement callbacks. Messages
cannot supply executable paths, arguments, credentials, endpoints, caller IDs or
new tool grants. `verifyConsent` defaults false, policy defaults disabled and
unknown quota denies optional jobs.
`authorizeOperation` also defaults false: a reviewed named profile must enforce
its exact argument/account/scope semantics independently of consent/tool names.
The embedding native launcher must establish
caller identity/enrollment and trusted consent verification before use; passing
a claimed caller string from a webpage is not enrollment. None is installed.

Native operations: status, inventory, invoke, cancel, disconnect. Every message
includes version1, requestId, enrollmentId and profileId where applicable.
Settings must be limited to status/inventory/disconnect; metadata grants cannot
authorize a tool call. Native framing and `serveNative` are executable embedding
entrypoints, not a deployed browser host. The response limit is1MiB; larger
results fail closed. The application budget reserves1024bytes for the native
wrapper; request IDs are capped at64characters. App quotas are separate.

Both adapter profiles use the same sealed arguments, policy checks and result
contracts. Read grants require `operation:read, readOnly:true`; write grants
require `operation:write, reviewedWrite:true`. They are OS-local reviewed
compatibility grants, not server annotations. No generic Cloudflare code/script
executor is implicitly allowed. A verified write also requires an independent
trusted `verifyWrite` callback; absent readback becomes outcome-unknown.

Stdio executes an exact OS-local absolute executable and argument vector through
the SDK (`shell:false`), checks executable SHA-256, hides the process window and
suppresses child stderr. The SDK inherits its documented restricted environment
set; a production sandbox/environment/file-signature profile still needs review.
Remote uses helper-side HTTPS with exact resource/path pinning, no redirects,
per-connection supplied in-memory authorization and per-resolution public IPv4
checking. IPv6/private-network endpoints, SSE results, OAuth enrollment and
credential-vault retrieval are deliberately unsupported in this prototype.
The callback must supply a token for the exact resource; do not use Graph or
provider-session credentials. No tokens are persisted by the helper.

SDK returned structured answers are mapped to pending request/source bindings
locally. Raw source digests/session IDs are not sent to MCP tools automatically.
Only the exact approved tool arguments leave; caller UIs must show those bytes.
Compatible tool results are status/answer/caption-key citations; unsupported
schemas/results reject. Binding verification is not proof that an answer is
factually correct or that an arbitrary server is read-only.

## Evidence and remaining work

### Enrollment and installer-template slice

`createEnrollmentAuthority` validates exact OS-local profile definitions and
their computed digests, native host name and browser-specific caller allowlist.
Enrollment requires a five-minute single-use random challenge plus a separately
trusted local-user confirmation callback (default denial). Nonces are consumed
before confirmation awaits; replay/parallel completion, wrong caller/host,
changed digests and expired confirmation fail closed. Challenges/enrollments
are bounded and memory-only; restarting the helper requires reenrollment until
a reviewed OS-protected persistence design is supplied. Browser launch context
must come from the trusted native launcher, not request fields. This is not
protection against a compromised local OS/user account or proof of binary signing.

Use the authority's `helper` factory, not a caller-supplied enrollment string,
for runtime integration. Revocation disconnects its instances and checks the
binding around policy awaits and returned results. Metadata status uses
application protocolVersion1 and a separate MCP date. `profile.verified` means
enrolled/configured identity so the profile can be selected before discovery;
`inventoryVerified` is separately false until a matching tool inventory is read.
Compatibility/grant approval does not authorize execution. Opaque grant IDs
contain no process path or credential reference.

`installerTemplate` only returns JSON, location hints and instructions. It never
writes files or registry and never provisions credentials. Chromium manifests
use exact `allowed_origins`; Firefox uses exact `allowed_extensions`. Chrome,
Edge and Firefox Windows/macOS conventions were checked against official docs;
Brave/Opera registration locations remain unverified and return no invented
registry key. Only the five 6.0 browser targets are supported by this template.
Generation on Windows is not a Mac install
test. No launcher is registered or installed by these functions.

Tests execute enrollment negatives and real split-frame native stream fixtures
with synthetic status/inventory, not live MCP discovery. Sources:
[Chrome native messaging](https://developer.chrome.com/docs/extensions/develop/concepts/native-messaging),
[Edge native messaging](https://learn.microsoft.com/en-us/microsoft-edge/extensions/developer-guide/native-messaging),
[Firefox native manifests](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/Native_manifests).

Tests include sealed approval tamper/expiry/profile/source/citation checks,
default denial, capacity denial, duplicate call suppression, queued cancellation,
late result rejection, native split/oversize framing, and shared mocked peers.
Official SDK tests start an actual synthetic local stdio subprocess and use a
synthetic fetch-backed HTTP peer. They do not establish real TLS/OAuth/server,
DNS change, directory lookup, installer or five-browser acceptance.

Jobs in this prototype are memory-only. Worker-owned durable admission/recovery,
policy revocation/source checks, expiry/pin/deletion and ownership-safe quota
cleanup must be integrated and tested before release. Capacity estimates and the
16MiB Core margin are not a physical disk reservation. No automatic retries,
deployment, live writes or product-readiness claim is made.

Controlled Cloudflare DNS profiles still need exact real server tool/schema,
zone/record/typed before/after conditions, independent readback and separately
approved rollback. Read-then-write cannot promise atomic compare-and-swap when
the MCP server/API lacks it. Rollback must compare current state with our
post-state so it cannot overwrite a later user's change. M365 directory profiles
need exact tenant/account binding, minimal authorized fields and explicit
disambiguation; records are external typed evidence, not captions.

Primary protocol/SDK sources checked2026-10-14:
[SDK version negotiation](https://ts.sdk.modelcontextprotocol.io/v2/protocol-versions),
[MCP transports](https://modelcontextprotocol.io/specification/2026-07-28/basic/transports),
[MCP security](https://modelcontextprotocol.io/docs/2026-07-28/tutorials/security/security_best_practices).

### Browser connection slice (not installed-host acceptance)

`teams-captions-saver/byomcpNativeClient.js` implements the fixed native host
`com.daftech.captionkeep.byomcp`. Construction and local status never launch a
process. A packaged Settings Connect gesture requests the optional permission
before awaiting; the worker's `connectGranted(sender)` rechecks the actual
browser grant before connecting. `createNativeSession` handles one-use enrollment
and subsequent bounded messages against trusted local configuration, not caller
or executable claims supplied in message payloads.

The client exposes `localStatus`, `inventory(profileId, revision, sender)`,
`disconnect(sender)` and `transport.invoke(profile, approval, signal,
{assertDispatch})`. Its trusted enrollment verifier and managed-policy providers
default to denial. Enrollment metadata is not operation authorization; reviewed
profiles, capacity and receipt proof require separate trusted worker bindings.
Short-lived native request timeouts are not durable job recovery timers.

Seven browser API/VM tests use the real split-frame native stream and synthetic
local authority. They cover startup silence, permission denial/removal, caller
rejection, malformed/oversized replies, timeout, stale-port events, and denied
dispatch. No OS launcher, registry registration, browser-native install, account
authentication, Cloudflare write or M365 query was exercised. Browser-native
acceptance remains pending for the five 6.0 targets.
# Runnable helper entry point (development)

`node cli.mjs --config <absolute-owner-controlled-config.json> <browser-origin>`
is now the native framing entry point. The browser supplies its native caller
argument; it is checked exactly against the provisioned allowlist. Firefox uses
its documented manifest-path and extension-ID arguments. It runs actual pinned
SDK stdio/HTTPS adapters, not a publisher server. `install-plan.mjs` generates
launcher/manifest/registration **content only**; it never installs anything.
Native registration, Windows launcher/ACL behavior, signing, clean installation
and removal still need platform acceptance.

The local JSON shape is `{enabled:true,browserConfiguration,browserStoragePath,verificationTools}`.
`browserStoragePath` is an explicitly configured absolute directory on the
browser profile's storage volume; only filesystem free-space metadata is read.
Do not substitute a helper/config directory on a different disk. Admission
requires this fresh capacity signal as well as the browser's optional job cap.
`browserConfiguration` is the explicitly reviewed extension registry:
`{version:1,hostName,allowedCallers,profiles:[{profile,actions}]}`. Profiles include
their complete process/resource identity, locally recomputed SHA-256 digest and
reviewed tool/schema grants. Actions are only `dns-change` (exact account and
zone allowlist) or `directory-lookup` (exact tenant and allowed work fields).
The optional remote profile's `credentialReference` names an explicitly supplied
helper environment variable containing its bearer token. No credentials are
read from Codex, copied to the extension, or persisted by this helper. Interactive
OAuth provisioning is not supplied by this entry point; unavailable credentials
fail closed. Never put tokens in this JSON or command arguments.

`verificationTools` entries are `{profileId,actionTool,readTool}`; the referenced
read tool must have its own reviewed read-only schema grant. A DNS read tool
returns `{accountId,zoneId,recordId,type,name,content,ttl,proxied}`. A directory
read tool returns `{tenantId,personId,fields}` with only explicitly selected
allowed fields. These are compatibility contracts, not claims that arbitrary
Cloudflare/M365 MCP tools already expose them. Generic code/search tools are not
promoted to trusted actions. Missing compatible tools produce no verified action.

### Official Cloudflare MCP compatibility

An explicitly reviewed DNS action with `tool:"execute"` and a remote profile
whose resource is **exactly** `https://mcp.cloudflare.com/mcp` uses the first-party
finite compiler in `cloudflare-dns.mjs`. The action still declares its approved
account and zone allowlist; the live `execute` input/output schema digest must
match the reviewed profile. No new action/config field is inferred from remote
tool annotations. The browser approves typed record identity/current/desired
values, not caller-supplied JavaScript. Other arbitrary execute tools are not
made compatible by their name.

The helper generates only account-bound zone GET, exact record GET and existing
record PATCH operations. It checks zone ownership and current record identity/
content immediately before PATCH. Readback independently uses the same pinned
tool with generated GET-only code; it does not require pretending that generic
`execute` has a read-only annotation. Code/URL/path supplied by a meeting, user
argument or tool response is rejected. Values are encoded as JSON literals, not
spliced into source. Source captions are not needed by this typed operation and
are not included in generated Cloudflare requests.

Official source checked on 2026-10-14:
[Cloudflare execute implementation](https://github.com/cloudflare/mcp/blob/main/src/tools/execute.ts)
defines `{code,account_id}` and returns JSON through a text content block;
[DNS PATCH API](https://developers.cloudflare.com/api/resources/dns/subresources/records/methods/edit/)
defines existing-record updates. The compiler accepts one bounded JSON text
block, rejects truncation, and verifies typed post-state independently. Synthetic
SDK integration tests exercise this contract; no real Cloudflare update, actual
credentials, server schema or native installation has been verified.

Cloudflare's [official API-token setup](https://github.com/cloudflare/mcp/blob/main/README.md#option-2-api-token)
explicitly supports both user and account API tokens as Bearer credentials for
this MCP URL. The helper can therefore use a **separately provisioned**, narrowly
scoped Cloudflare token through the named local environment reference; it does
not need or reuse a Codex OAuth token. Account-token setup documents Account
Resources: Read for account detection, and tokens with Client IP Address
Filtering are currently unsupported. Verify the required token scopes with the
organization before a test. Token creation, token provisioning and live record
changes are explicit user-authorized steps, not performed by this package.

DNS operations re-read/check the typed current record before dispatch and read
again independently after dispatch. A receipt discloses the non-atomic read/write
race. Directory results are independently retrieved against the selected stable
person/tenant identity. Missing/mismatched readback means outcome unknown, never
automatic resend. Both transports use the same typed verification path. The
browser independently validates the bounded native receipt against its locally
reviewed registry, exact operation/source/result and canonical digest.
