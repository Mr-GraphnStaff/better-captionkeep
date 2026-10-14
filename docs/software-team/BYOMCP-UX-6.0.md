# BYOMCP: 6.0 UX contract

Date: 2026-10-14. **Design artifact; not implemented or certified.**
Lead decision: include an opt-in **Bring Your Own MCP** bridge in version 6.0.
This is not a deferred feature, a DAF-hosted assistant, or publisher transcript
storage. Engineering/security contract review precedes UI implementation.

## Product boundary

The popup remains the calm meeting front door. Advanced Settings contains
**Connections → Bring Your Own MCP**. The feature is off by default; enrollment
does not send captions, enroll another meeting, or enable automatic submission.
The user owns/selects their MCP service and authenticates with that service.
Local capture, archive, exports and review workflows continue if the bridge is
off, unavailable, denied, canceled or unauthenticated.

One visible explanation: “Connect a service you control. You choose the tool
and evidence for each request. Nothing is sent automatically.” Never call a
connection safe merely because its name, endpoint, or tool annotation says so.

## Connection enrollment and review

1. **Choose connection type.** Remote HTTP endpoint, or installed local bridge.
   Explain their different permissions before asking for credentials.
2. **Identify destination.** User label plus canonical origin/endpoint or local
   host identity, connection type and authentication state. Reject credentials
   embedded in endpoint URLs. Never echo credentials into UI diagnostics.
3. **Grant narrow access.** Show the requested destination and browser permission
   separately from tool approval. Permission denial returns to an editable form.
   No transcript is attached to a connectivity check.
4. **Review service and tool inventory.** Tool name, description, input schema,
   claimed side effects, version/inventory identity and permission boundaries.
   Descriptions and schemas are untrusted service data, not instructions to the
   extension. The user selects allowed tools explicitly; none auto-selected.
5. **Confirm connection.** Show destination, selected tools and credentials
   handling; **Enable connection** completes enrollment. Refreshing/changing the
   destination, inventory or schema requires relevant re-review, not silent
   expansion. Empty inventory is a usable diagnostic state, not a blank page.

Saving a connection is not consent to call its tools. A tool's read-only claim
does not authorize a mutation or prove it lacks side effects.

## Local versus remote installation experience

| Route | Required user-facing explanation | Acceptance boundary |
| --- | --- | --- |
| Remote HTTP | Destination origin, endpoint, authentication owner and explicit browser site-access request. Untrusted discovery is not execution. | Denied access/auth expiry produces a recoverable connection state. Endpoint changes do not reuse approval or credentials for a different destination. |
| Local stdio/native bridge | A browser page cannot simply launch a user's MCP command. A separately installed browser-compatible host/bridge and explicit permission are required. Show installer provenance, installed host identity, supported browser/OS and uninstall instructions. No pasted shell command is executed by the extension. | Not installed, wrong version, wrong extension identity and blocked native permission are distinct states; do not offer a fake Connect success. Enrollment never downloads/installs/starts an arbitrary executable automatically. |

Native integration differs by browser; Chrome's native messaging permission and
host registration do not establish Firefox or Safari support. Engineering must
document/test each route before labeling it available. Follow official
[MCP transports](https://modelcontextprotocol.io/specification/2026-07-28/basic/transports)
and browser-specific integration requirements, including
[Chrome native messaging](https://developer.chrome.com/docs/extensions/develop/concepts/native-messaging)
and [Firefox native messaging](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/Native_messaging).

## Explicit selected-evidence request

Entry is a quiet **Send selected evidence** action in the workspace, exposed only
after enrollment and deliberate selection. Not a new competing popup button.

1. Pin the selected session, caption IDs and immutable source revision/hash at
   click time. Retain highlighted range versus full-caption meaning visibly.
2. Review exact outbound evidence, destination and selected tool; show privacy
   transformations, field omissions, total size and any tool arguments. Images,
   attendee reports, other meetings, previous questions and full transcript are
   excluded unless independently selected and separately supported/approved.
3. Recheck managed policy, connection/inventory identity, selected source and
   permission. A changed source/selection/meeting invalidates the preview rather
   than rebinding it. A denied image policy cannot be bypassed through MCP.
4. Button label includes the action/destination: **Send to [connection]**. Warn
   if the tool declares a write or external side effect; require the actual
   consequential arguments to be confirmed. No silent follow-up tool calls.
5. Submit once with a request identity. Duplicate clicks cannot duplicate calls.
   No background polling stream of captions and no auto-resend after reconnect.

The non-editable review envelope remains outside editable instructions.
Transcript/tool output is evidence, not extension authority. No tool result can
request credentials, another submission, permissions, native execution or a
change to managed policy.

## Request state and cancel

`Preview → Sending → Waiting → Result for review → Verified/pinned or Discarded`

Alternative terminal states: permission/policy denied, source changed,
authentication expired, network error, tool error, timed out, canceled, and
**outcome unknown**. Show one persistent status with retry guidance and a quiet
sanitized diagnostic ID. Do not clear it during routine transcript polling.

Cancel stops local waiting and makes a protocol-supported cancellation request
where available. It does not promise to undo remote work. After dispatch, copy:
“Canceled waiting. The service may already have acted.” A timed-out or unknown
write must not auto-retry; inspect the external result before another explicit
request. Final wording depends on the reviewed transport contract.

## Returned results: verify before pinning

Label destination/tool/request identity and capture time; retain the original
source hash/count and tool/template version where defined. Remote text is an
untrusted draft, not a captured caption, verified fact, or local AI authorship.

- Render text safely; never execute scripts, commands or returned instructions.
- Resolve claimed citations only against the request's pinned source; reject
  invented evidence IDs or altered source mappings. Unsupported factual results
  must remain unverified and explain why pinning is unavailable.
- **Review/edit** is allowed but does not remove source boundaries or safety
  requirements. Edits become an explicit reviewed draft, not the original result.
- **Pin reviewed result** creates a separate derivative with request provenance
  and user-review state; it never overwrites captions or earlier revisions.
- **Discard** removes the pending local result. Deleting a source applies the
  same derivative/snapshot retention contract as Notes and Ask.

## Credential, policy and accessibility requirements

Secrets never enter sync storage, logs, exports, transcript payloads, public
fixtures or error strings. The reviewed architecture must name the credential
store and lifecycle; this design does not choose one implicitly. **Disconnect**
stops new requests, clears local credential/session state per that contract and
explains that remote account revocation is separate. Browser permissions are
revokeable separately. No endpoint enrollment implies publisher access.

Managed denial independently blocks bridge enrollment/invocation/retention as
applicable and explains who controls it, while local Core remains available.
Keyboard/assistive users can review schema, destination, evidence and result,
cancel a request, and restore focus to the originating selection. Dynamic status
announcements are polite except actionable blocking errors; credentials never
appear in live regions. Long tool names, schemas and errors wrap at narrow width.

## Required evidence before calling this implemented

Engineering/security agree on transports, supported browsers, credential store,
tool allowlist/schema/version fingerprint, payload caps, cancellation semantics,
idempotency and result/provenance schema. Then implement and independently test:

- Disabled default: no bridge network/native activity during normal capture.
- Enrollment permission/auth denial, wrong host and inventory changes.
- Source/selection/policy changes during every asynchronous boundary.
- Exact preview equals submitted payload; excluded content/secrets absent.
- Malicious discovery/result text cannot execute or authorize another action.
- Duplicate submit, canceled/timed-out write, restart and disconnect behavior.
- Returned invented citations rejected; reviewed result remains a derivative.
- Browser-specific remote/native operation and accessible full journey.

No claim of bridge readiness follows from this document or existing Notes/Ask
tests. The full 6.0 acceptance matrix must include this newly approved scope.
