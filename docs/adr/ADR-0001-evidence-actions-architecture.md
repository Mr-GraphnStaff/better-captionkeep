# ADR-0001: Optional user-owned BYOMCP Evidence Actions for 6.0

Status: **Lead scope/transport/action decisions recorded; local runtime implemented
and independently tested with synthetic peers. Installed-host, authenticated
provider and final security/release acceptance remain open.**

Date: 2026-10-14. Owner: Software Team architecture/integration; approval owner: product lead.

Implementation update: `byomcpRuntimeAdapter.js` binds reviewed local registry,
native enrollment/inventory and exact typed operations. `companion/byomcp/cli.mjs`
runs the framed optional helper with pinned SDK stdio/remote transports.
Cloudflare's official generic execute tool is compatible only through the finite
existing-record DNS compiler; callers cannot supply code. Independent GET-only
readback is required before a source-linked Receipt can be retained. Original
sources remain unchanged. Unknown outcomes are not automatically resent.

Settings imports only nonsecret reviewed configuration, requests optional
native permission on Connect, and keeps write enablement separate from sealed
per-operation consent. Credentials use explicitly provisioned helper environment
references, not Codex tokens or browser storage. Node.js 22+, OS registration,
Windows ACL/launcher validation and real provider authentication remain setup
and acceptance requirements. Install-plan generation performs no installation.
Current compiler checks preconditions but does not provide an atomic DNS
compare-and-swap or rollback guarantee. Readback normalization can produce an
honest unknown result; it must never create a false verified completion.

## Decision record and scope

The lead explicitly requires an opt-in **Bring Your Own MCP (BYOMCP)** bridge in
6.0. This means connecting infrastructure the user or organization owns. It
does not authorize a DAF-TECH hosted assistant, publisher transcript endpoint,
model account, automatic AI submission, or autonomous tool execution.

This is a newly authored proposal at the path referenced by historical Boards
#319. It does not reconstruct or claim approval of the missing earlier ADR.
Boards #322 was closed after experimental code was removed, not because a
server shipped. The new inclusion decision restores the program to design
work; it does not establish approval of the choices left open below.

Traceability: #318 and #320-332, 6.0 roadmap source/derivative model, inherited
CAP-09/10/11/12/15 controls, and the runtime controls in
[AI assurance](../AI-EXTENSION-ASSURANCE.md). Historical 5.4 release boundaries
remain true. This proposal supersedes their exclusion for *future approved
6.0 BYOMCP implementation only*, not the published 5.4 artifact.

MCP is a tool/data protocol, not a model or an assistant. A connection alone
cannot promise research or a natural-language answer. Compatible user-owned
tools can return structured evidence/results. An assistant may consume those
tools outside CaptionKeep; its model, credentials, cost, and orchestration stay
with the user. The existing reviewed BYOAI copy/workspace path remains separate
and usable without a bridge.

## Proposed architecture

### Subsequent lead decisions and controlled-action amendment

The lead selected an **optional locally installed helper for both stdio and
remote MCP**. Direct-browser transport is not selected for 6.0; the comparison
below is retained as rationale, not an unresolved transport choice. Installer,
native registry registration, signing and credential provisioning are not
approved by selecting this architecture.

The lead also included **reviewed named write profiles**, not a read-only-only
bridge. CaptionKeep-owned evidence lookup tools remain read-only. External
named action profiles require separately sealed per-operation approval;
unknown/write tools and generic script executors remain non-invokable. The
earlier read-only-only statements below apply to evidence lookup tools, not to
these explicit controlled-action exceptions. This amendment takes precedence
over earlier generic connector-write exclusions.

Cloudflare DNS scenario: identify the exact user-owned MCP profile/account,
zone ID, record ID or explicit create operation, normalized typed desired
record fields and real tool/schema. Read and display the current typed
before-state and desired state before approval; seal their digests alongside
account/tool/source identity. Reject changed before-state immediately before
dispatch. Disclose the remaining read/write race if the actual server/API
provides no atomic precondition; independent readback is not compare-and-swap.
After dispatch, use a separately reviewed read tool to verify exact typed
post-state. A reported success is not a verified receipt. Pin the reviewed
receipt with account/zone/record identity, before/after digests, observation time,
tool/schema, selected caption keys and limitations as an external derivative.
Unknown or partial outcomes never trigger automatic resend. Start acceptance
with a synthetic TXT record/dry-run; any live isolated TXT test needs exact
zone/name/value approval. Rollback is another separately reviewed operation
and must check current state still equals our post-state, so later changes are
not overwritten. A generic Cloudflare arbitrary-code tool is not allowlisted
because of its name. Actual server tools are not invented by this ADR.

M365 participant lookup scenario: choose authorized work account/tenant,
minimal allowed search/return fields and reviewed directory tool/schema.
A caption display name is not identity. Bounded search presents ambiguity for
explicit user selection before retrieving person-specific details using a stable
directory object ID. No personal/work fallback, cross-tenant query, full
directory crawl or automatic attendee enrichment. Retrieved directory facts
are typed external evidence with retrieval/account/scope metadata; they cannot
rewrite captions or enter AI context automatically. Pin only after review and
retention checks. Live queries require exact person/tenant/scope authorization;
synthetic fixtures do not establish directory correctness or authorization.

Both named profiles require a trusted `authorizeOperation` validator for exact
arguments/account/scope/preconditions, default denial. Controlled writes require
independent `verifyWrite` postcondition verification, also default denial.
Metadata compatibility grants and a user's source selection do not replace
operation consent. Execution must recheck policy, profile, expiry and revocation
after admission awaits and again at the SDK call boundary after connection/
inventory. Candidate results stay private until independent verification and
the final fresh policy/cancellation check. The current helper prototype exposes
these enforcement seams but does not implement or approve actual Cloudflare/
M365 integrations, durable worker recovery or native installation.

Prototype reference: [optional helper](../../companion/byomcp/README.md), SDK
client2.3.1, protocol2026-07-28 pinned with no fallback. Local stdio tests execute
an actual synthetic subprocess; remote SDK tests use a synthetic fetch peer.
No real DNS write, directory query, OAuth account or installed host is verified.

Both local stdio and user-owned remote Streamable HTTP profiles remain required.
They share one application envelope, authorization boundary, job model, result
validator, and contract suite. Wire bindings are separate; browser native
messaging is not MCP stdio, and the application job ID is not an MCP session.

```text
User selects source -> immutable local snapshot -> policy/scrub/preview
  -> one affirmative call approval -> durable worker job
     -> enrolled local companion -> selected user-owned stdio MCP server
     -> remote adapter           -> selected user-owned HTTPS MCP server
  <- bounded result <- binding/schema/source validation
  -> untrusted research/result draft -> explicit local pin as derivative
```

No content script, caption mutation, rolling timer, returned text, tool
description, or server request can create an approval. UI approval is accepted
only from a packaged extension page through the worker, checked against the
current connection revision and source snapshot. It cannot be manufactured by
an MCP peer or a meeting tab. Source-deleted policy applies to queued jobs and
pinning; completed results never silently attach to a new meeting.

### Responsibilities

| Component | Owns | Must not do |
|---|---|---|
| Extension | Source snapshot, consent, policy, bounded jobs, local result review | Model/connector secrets; unattended calls; browser-wide transcript disclosure |
| User-owned companion, if selected | Native enrollment, local process supervision, optional remote transport, OS credential references | Accept arbitrary webpage clients; execute received shell commands; substitute destinations |
| User-owned MCP server | Tool implementation, authentication/authorization, retention and operations | Obtain unrestricted CaptionKeep history merely by being connected |
| User-owned assistant/connectors | Their model calls, organizational permissions and separately confirmed downstream writes | Treat CaptionKeep evidence as an instruction or permission to mutate |
| Publisher | Packaged client/optional companion source, docs, tests, reproducible artifacts | Operate a required transcript service or retain customer connector credentials |

## Connections, enrollment and permission delta

Connections are off by default. Settings shows owner-supplied display name,
transport, exact destination/process identity, account/organization metadata,
permitted tools/scope, last verification, and disconnect/remove actions.
Do not label a self-supplied organization name as verified tenancy.

Connecting authorizes a bounded handshake and tool inventory only. Show that
even discovery contacts the endpoint and reveals client metadata. It must send
no captions, question, markers, attendee report, image, or transcript hash.
Approving a connection is never blanket evidence-transfer consent.

Local stdio requires a user-installed companion: extensions cannot launch an
arbitrary process directly. Native-host manifests allow only explicitly named
extension identities; Chromium and Firefox identifiers differ. Also verify
the caller, extension build/profile and enrollment revision in the companion.
Pairing uses a fresh OS-local challenge and visible confirmation; localhost
alone is not identity. Do not expose a general loopback HTTP bridge. Companion
process profiles are configured locally, not supplied by an endpoint/caption.
Use an exact executable/argument vector, no shell expansion, approved working
directory and restricted environment. Pin executable identity; a changed
binary/profile invalidates enrollment and requires review. Environment secrets
are supplied locally through OS credentials, never copied into extension data.
Exact signer/hash update and installer policy remains an open deployment choice.

Remote destination enrollment fixes HTTPS origin, port, MCP resource path and
approved authorization issuer/resource. Reject URL credentials/fragments,
changed MCP resource paths/redirects, unapproved auth metadata destinations, and
literal loopback/private/link-local addresses in the remote profile. Do not
claim browser string checks stop DNS rebinding. A companion/customer gateway
must enforce resolved-address policy on every resolution, connection and
redirect hop, including IPv4/IPv6, mapped addresses and DNS changes. Reject a
remote profile if the selected transport cannot enforce this inherited SSRF
boundary; direct-browser remote support is not approved merely because a URL
looks public. Private enterprise endpoints require an explicit managed network
profile defining exact allowed resources and networks, not a silent exception.
Each changed destination/account/issuer/tool grant revokes approvals.

MCP invocation redirects are rejected by default. An approved compatibility
profile must pin each exact resource URI/path and permitted auth discovery,
authorization and token endpoint before following any hop. Never forward an
Authorization header across a changed resource/origin or reuse a token for a
different audience. Same-origin path changes are not implicitly trusted. A
changed metadata/redirect endpoint requires fresh enrollment and auth binding,
not continuation of an existing approval. The transport must control redirects
itself so the network library cannot leak credentials before validation.

**Transport alternatives (lead selected the helper-both option):**

1. Direct extension-worker HTTPS client: no companion for remote users, but
   arbitrary owner endpoints need a reviewed optional host-pattern declaration
   and exact-origin user grant. Authorization metadata may need additional
   separately disclosed origins. A broad *optional* HTTPS pattern is still a
   meaningful permission delta; it must not be silently added. Never request
   `<all_urls>` or install content scripts on MCP hosts.
2. Enrolled companion for both transports: minimizes extension network grants
   and keeps persistent credentials in an OS vault, but remote users must
   install it and every OS/browser needs installation and removal validation.

Selected security prototype: transport through the enrolled companion, with
**both** stdio and remote profiles. The direct-browser alternative is not selected
for 6.0. This is not permission to install a host or silently make remote support
local-only; installer and credential provisioning remain separate decisions.
Safari was removed from 6.0 by the lead on October 14, 2026 and is archived for
a later major version. All five supported browser acceptance and applicable
installer/upgrade gates remain required.

If `nativeMessaging` is used, request it only after the connect gesture and only
where optional permission is supported and validated. Unsupported browsers
show a specific unsupported-profile state, never claim connected. Keep one
extension package per browser; any companion is separately versioned and
optional for Core. Record manifest baseline/delta, prompts, existing-install
upgrade behavior, rollback and Store copy before promotion (CAP-10/11).

## Credentials and policy

No secret goes in sync, local preferences, jobs, diagnostics, URLs, exports,
fixtures, source control or publisher storage. Nonsecret connection metadata
is local-only; no automatic cross-device enrollment. Persistent remote
refresh/API credentials live only in a user-controlled OS vault or customer
gateway. For an approved direct-browser OAuth profile, short-lived scoped
access tokens may be held in memory/extension session storage only, never
returned to content scripts. No persisted browser refresh token; worker/profile
restart can require explicit reauthentication. This exception is for MCP
resource authorization, not model or connector credentials.

Remote auth must bind issuer, audience/resource, account and approved scopes;
use public-client PKCE/state and validate the authorization response. No token
passthrough from Graph, provider web sessions, or another MCP resource. Discovery
is an attack surface and cannot automatically authorize new origins/scopes.
Expired/denied auth pauses the job and asks for explicit reconnect; it must not
silently choose a different account or downgrade to anonymous access.

Proposed managed keys: `disableByomcp`, `allowedByomcpTransports`,
`allowedByomcpConnectionProfiles`, `allowedByomcpTools`,
`byomcpMaxEvidenceBytes`, `byomcpRetentionDays`, `requireByomcpScrubbing`.
These are proposed schema fields, not implemented settings. Existing
`disableAiHandoff`, forced scrubbing and retention denial also win at outbound
and persistence boundaries. Each invocation, retry, result retrieval and pin
rechecks current policy; a grant cannot override denial. Disconnect/removal or
permission revocation aborts local activity, removes credentials/capabilities,
invalidates approvals, and blocks late results. Revocation cannot recall data
already released; explain remote deletion responsibilities honestly.

## Tool and source boundary

Inventory/schema/descriptions/annotations/results are untrusted data. Render
plain text, never remote HTML/JS; reject executable links, executable schemas,
external `$ref` retrieval, oversized or deeply nested definitions. Tool names
and `readOnlyHint` are not security enforcement. There is no model-chosen tool
loop, sampling, unsolicited elicitation or automatic follow-up call in 6.0.

A supported connection profile explicitly maps reviewed tool names, operation
effects, argument validators and input/output schemas. New or changed schemas
invalidate that grant; show the change for approval. Unknown/write tools are
non-invokable unless they have a separately approved controlled-write profile.
A local MCP tool can still behave maliciously despite its description: only
trusted user-owned servers with reviewed implementation/credentials qualify.
Do not promise that arbitrary third-party MCP tools are proven read-only.

CaptionKeep-owned evidence tools, if exposed by the companion/customer-hosted
reference server, retain the #320 names: `captionkeep_search_meetings`,
`captionkeep_search_captions`, `captionkeep_get_meeting_evidence`,
`captionkeep_get_decisions_and_actions`, `captionkeep_get_caption_sources`,
`captionkeep_verify_evidence_bundle`, `captionkeep_get_active_selection`.
They operate **only within the explicitly approved job evidence inbox**, not
all browser storage or a live selection pointer. A job-scoped capability expires
and cannot be reused across endpoints/accounts/sessions. CaptionKeep tools
cannot create/update/delete/send external records. Other user-owned read-only
tools need a reviewed adapter mapping; generic inventory alone is insufficient.

Generic downstream connector writes remain outside this client; explicitly
approved named write profiles follow the controlled-action amendment above.
A returned work-item draft is inert and unconfirmed; the customer's separate
environment performs its own reviewed confirmation and authorization unless a
separate named profile is approved. An external receipt is labeled
reported unless its identity/integrity is independently verified. No claim of
Jira/Microsoft 365 completion from a tool's free-text statement.

## Versioned application contract and bounds

Proposed `EvidenceActionEnvelope/v1` fields:

- `jobId`, `idempotencyKey`, `createdAt`, `expiresAt`, `schemaVersion`;
- connection ID/revision, transport profile, account/resource binding, approved
  tool name and input/output schema digest (no credential);
- task/purpose and exact canonical approved arguments;
- source session ID, source revision/fingerprint, selected stable caption keys,
  evidence IDs and observation times;
- separate scrubbed release snapshot, privacy mode, declared source scope,
  approved payload digest, policy revision and approval revision/time;
- optional result-contract/version identifiers, never tool instructions derived
  from transcript text.

Approval seals the exact payload/endpoint/tool tuple. Capture updates cannot
change it. A user selection or policy/source change during asynchronous checks
must reject stale approval or require a new preview; it cannot silently substitute
another meeting. The local source fingerprint is not sent by default: the
release digest covers the scrubbed payload, while the raw-source hash stays in
local provenance unless separately reviewed. Full transcripts, images,
attendees, other meetings and questions are excluded by default. An explicit
scope expansion must be permitted by policy and shown in a new preview.

Initial proposed application limits: 12 selected captions, 64 KiB UTF-8 outbound
payload, 4 KiB question, 1 MiB total result, JSON depth 12, 100 result citations,
one running job per connection and four total, 60-second request timeout,
15-minute approval expiry, 24-hour unpinned job expiry. The optional job store
also has hard aggregate limits: at most 50 records and 8 MiB of serialized
records/payloads/results, including queued jobs, retries and tombstones. Reserve
declared maximum result capacity at approval so concurrency cannot overrun the
budget; count actual UTF-8 bytes and release reservations with terminal cleanup.
Oversized results are rejected before accumulation, not after buffering an
unbounded stream. Pinned results move through the existing derivative retention
boundary and do not gain unlimited storage by leaving the job collection.

Protect Core capacity with a separate optional-job storage allocation plus a
proposed 16 MiB free-capacity reserve for raw recovery/archive writes. Before
admission, check the aggregate budget and measured available quota; if capacity
cannot be established conservatively, reject the optional persistent job rather
than assume unlimitedStorage guarantees disk capacity. Existing source history
is never pruned for a bridge job. Local storage APIs cannot reserve physical disk
space or guarantee subsequent Core writes: a separate-store allocation, shared
quota admission strategy and platform capacity checks remain implementation
choices that require review. Any Core quota/storage failure immediately stops
new optional admissions and retries; clean only bridge-owned expired/unpinned
records, preserving active source checkpoints and pinned derivatives. Do not
claim this safety margin prevents every endpoint/disk failure.

These are product
proposals to validate, not protocol limits or silently approved transcript
truncation. Reject oversized requests or ask the user to narrow scope; never
drop evidence unnoticed. Separate chunking needs its own consent/coverage design.

`EvidenceActionResult/v1`: job/connection/source/approval IDs, status, bounded
answer/draft, exact supplied-caption references, separately typed external
sources, tool/result contract version, retrieval time, limitations and warnings.
Result claims must cite approved evidence or explicitly say insufficient
evidence. Unknown caption IDs, altered session IDs, stale endpoint revisions,
wrong account/resource, inconsistent digests and unsolicited results are rejected.
External citations are not proof of retrieval or truth; do not fetch citation
URLs automatically. Verification proves binding/schema/integrity, not factual
correctness. A Research Card is a derivative, never an authoritative transcript.

## Durable jobs, cancellation and retention

Worker-owned local job records use serialized compare-and-update transitions
and monotonically increasing revision; adapters never write storage directly.
States: draft -> approved -> queued -> running -> received -> verified ->
user-confirmed/pinned; failed, cancelled, expired and outcome-unknown are explicit
alternatives. Pinned derivatives link to the sealed source snapshot. Optional
confirmation-required connector drafts remain inert in CaptionKeep.

Persist the sealed approval before outbound dispatch. Persist an attempt before
calling transport. Duplicate UI clicks and reconnection use the same job ID and
approved digest. An idempotency key does not make an arbitrary MCP tool
idempotent: retry only if the adapter/server contract guarantees deduplication;
otherwise an uncertain delivery becomes outcome-unknown and requires review.
On worker restart reconstruct pending records; never blindly redispatch running
jobs. MCP protocol tasks, if supported, are an explicitly negotiated extension,
not assumed to make browser jobs durable.

Cancel immediately stops local retry/polling and requests best-effort transport
cancellation. It does not mean the server undid work or deleted evidence. Mark
late results cancelled/stale and do not auto-pin. Transport cancellation follows
the pinned MCP revision, not one guessed mechanism for every binding.
Pin requires explicit user review, current retention policy, surviving source
ownership and successful validation. Preserve original snapshot lineage after
caption corrections; show stale/superseded status instead of rebinding to new text.

Unpinned payload/result expiry, source deletion, retention changes, disconnect,
uninstall and companion removal have explicit cleanup tests/runbooks. Retention
denial cannot be bypassed by an optional bridge inbox. Durable evidence-bearing
jobs are unavailable when policy forbids their required persistence; show that
reason and keep capture usable. Metadata logs contain bounded event/error codes
only; no free-form server errors, endpoint query strings, captions or tokens.

## Implementation handoff after ADR approval

Proposed modules; names are interfaces, not existing implementations:

| Owner/module | Contract | First executable evidence |
|---|---|---|
| `evidenceActionContracts.js` | `sealApproval(snapshot, selection, profile, policy)`, `validateResult(job, result)` | Canonical digest/limits/source-swap/citation negatives |
| `byomcpConnections.js` | `enroll`, `inspectInventory`, `revoke`, revision-bound grant | No evidence on handshake; malicious inventory; changed schema invalidation |
| `evidenceActionJobs.js` | `approve`, `dispatch`, `cancel`, `recover`, `expire`, `pin` | Crash-before/after-dispatch, duplicate clicks, policy revocation, late results |
| `byomcpTransport.js` | `inspect`, `invoke`, `cancel`, `queryOutcome`, `disconnect` | Identical application fixtures across stdio/remote; explicit unsupported states |
| Separate user-owned companion/reference MCP package | Native framing/enrollment, stdio process profile, scoped inbox tools, optional HTTPS binding | Wrong extension/process, schema bounds, sandbox/credential redaction, clean install/removal |
| Settings/workspace UX | Connect/discover, exact release preview, progress/cancel/result review/pin | Keyboard/narrow/localized and real five-browser validation |
| Release/security owners | Permission deltas, signed companion artifacts, SBOM, disclosure/rollback | CAP gates and exact-artifact live evidence |

Do not reintroduce connected settings by deleting existing negative tests. Replace
them only with approved-boundary contracts that still prove default-off Core,
zero publisher endpoint, no implicit transfers, and no secret exports. Reuse
existing source snapshot, scrubber, marker and derivative modules without giving
transport code access to unrestricted archives. Root owns coordinated worker/
UI/configuration changes; assign non-overlapping module ownership before code.

## Acceptance and adversarial test plan

1. Core capture/history/export works with no host, no connection, denied auth,
   revoked permission, endpoint outage, unsupported protocol and worker restart.
2. Both transports run the same approved selection/preview/invoke/status/cancel/
   receive/verify/pin fixtures, then real user-owned live endpoints. Record exact
   MCP revision/SDK/browser/OS/build; do not substitute VM success for live UAT.
3. Approvals cannot be forged from meeting-page messages, inventory text, tool
   output or synthetic server requests. Transcript instructions/URLs remain data.
4. Mutation/tool-chain attempts, tool/schema substitution, account/resource
   mix-up, redirect/metadata SSRF, replay and expired consent fail closed.
5. Same-URL meeting rejoin, source correction/deletion and selection change at
   every await cannot release or pin another meeting's evidence.
6. Network/process fixtures prove zero source payload on discovery and exact
   scrubbed bytes on approved invocation; logs/sync/exports contain no secrets.
7. Oversize/deep/HTML/URL-hostile results, wrong citations, forged success,
   wrong source hashes and late cancelled responses reject safely.
8. Crash at every job transition, uncertain dispatch, unsupported deduplication,
   quota/storage failure and double-clicks preserve honest status and Core.
   Exercise the 51st record, byte-cap overflow, concurrent result reservations,
   unknown/low available quota, large streaming responses, and Core failure
   during optional writes. Assert optional admission fails before consuming the
   reserve and cleanup cannot delete another job generation/source checkpoint.
   Test ownership-safe late completions and deletion across worker restarts.
   Exact-resource/same-origin-path redirects, auth endpoint substitution,
   cross-origin credentials and public-to-private DNS changes must be denied;
   missing resolved-network enforcement leaves that remote profile unsupported.
9. Clean native-host install/enrollment/update/removal and remote OAuth/permission
   denial/revocation pass across required platforms. Store-installed upgrades
   preserve Core and require explicit opt-in to newly granted capabilities.
10. Exact ZIP/companion hashes, SBOM/attestation, permission decision, live
    acceptance, unchanged-candidate window and human go/no-go precede publication.

## Alternatives, consequences and decisions still required

Keep manual BYOAI only: safest current behavior but does not fulfill the lead's
BYOMCP decision. Publisher hosted gateway: rejected, different ownership and
data/cost boundary. Arbitrary unauthenticated localhost/HTTP bridge: rejected.
Generic tool agent: rejected; it turns untrusted inventory/captions into authority.

The proposed narrow client needs customer setup and may not work with arbitrary
servers without an adapter; that is preferable to pretending names/annotations
prove safety. Native installation adds supply-chain, OS permission and support
work. Direct HTTPS removes that installation for remote users but adds optional
origin and OAuth/browser lifecycle complexity. Neither tradeoff is approved yet.

Before live integration, lead/security/release review must resolve:
companion repository/runtime/signing/install profiles; supported MCP
revision and pinned SDK; initial compatible user-owned tool profiles/result
schemas; OAuth registration/resource/tenant policy; exact optional permission
delta; network/private-endpoint policy; application limits/retention; migration
and all-five-browser scope/unsupported behavior. No fake approval, deployment,
credential provisioning, cost agreement or end-to-end success is recorded here.

## Primary references checked 2026-10-14

- [MCP 2026-07-28 transports](https://modelcontextprotocol.io/specification/2026-07-28/basic/transports): standard stdio/Streamable HTTP bindings and revision-specific cancellation; older revisions differ.
- [MCP authorization](https://modelcontextprotocol.io/specification/2026-07-28/basic/authorization): HTTP resource authorization, issuer/resource binding and token boundaries; not a stdio credential scheme.
- [MCP security practices](https://modelcontextprotocol.io/docs/2026-07-28/tutorials/security/security_best_practices): discovery, confused-deputy, token passthrough, SSRF and local compromise risks.
- [Chrome native messaging](https://developer.chrome.com/docs/extensions/develop/concepts/native-messaging) and [Firefox native messaging](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/Native_messaging): native-host permissions and browser-specific extension allowlisting.
- [Chrome permissions](https://developer.chrome.com/docs/extensions/reference/api/permissions): optional grants and revocation mechanisms; exact browser/profile behavior still requires testing.
