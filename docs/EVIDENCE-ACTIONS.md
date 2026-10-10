# Better CaptionKeep Evidence Actions

**Status:** committed 5.4 scope; implementation and live validation remain open  
**Engineering delivery target:** October 24, 2026  
**Azure Boards:** Feature
[#318](https://dev.azure.com/DAF-TECH/Better%20CaptionKeep/_workitems/edit/318)
under release Epic
[#314](https://dev.azure.com/DAF-TECH/Better%20CaptionKeep/_workitems/edit/314)

## Product promise

Evidence Actions turns a precise moment in a meeting into researched,
reviewable work through the customer's own AI environment. Better CaptionKeep
provides immutable source evidence and provenance; it does not become the
customer's model, integration platform, or transcript warehouse.

The core interaction is:

1. During the meeting, the user highlights exact words in one caption and
   chooses **Research selection**, uses the caption's one-click **Research**
   control, or selects multiple complete caption cues.
2. Better CaptionKeep binds the selected excerpt or captions to their source
   caption identifiers and opens **Research this reference** immediately.
3. Better CaptionKeep previews the exact selected text, minimal adjacent
   context, destination, research scope, and optional question.
4. The user approves the handoff.
5. The customer's AI environment researches through its approved public or
   organizational sources.
6. A cited Research Card returns as a derivative linked to the immutable source
   caption IDs.
7. The user may pin, copy, or export the card through the Evidence Board.
8. **On the Fly Research** can prepare a short, cited live-chat reply from the
   card. Better CaptionKeep copies only the reviewed draft; the user pastes it
   into the active meeting chat and presses Send. The extension never posts
   automatically under the user's identity.

## Read-only MCP surface

The 5.4 release exposes only read-only CaptionKeep MCP capabilities:

- `search_meetings`
- `search_captions`
- `get_meeting_evidence`
- `get_decisions_and_actions`
- `get_caption_sources`
- `verify_evidence_bundle`
- `get_active_selection`

The final MCP names use a `captionkeep_` prefix during contract review. The
behavior is authoritative: none of these tools may create, update, delete, send,
or administer an external record.

Research is an open-world read operation performed by the customer's approved
agent and sources. Better CaptionKeep provides the selected evidence and
receives a derivative result; it does not silently browse or submit transcript
content.

## Shared-responsibility boundary

Better CaptionKeep owns:

- stable evidence and source-caption identifiers;
- the user-selection and disclosure-preview experience;
- minimal-context defaults;
- the immutable source/derivative separation;
- read-only tool enforcement;
- provenance, verification, and honest error states; and
- keeping caption text inert rather than treating it as instructions.

The customer owns:

- the LLM or agent host;
- identity, authorization, and tenant configuration;
- public and organizational research sources;
- Jira, Microsoft 365, ServiceNow, Salesforce, or other connectors;
- connector permissions and downstream confirmation policies; and
- retention, monitoring, audit, and incident response for its environment.

## Evidence package

The assistant receives a structured evidence package rather than an
indiscriminate transcript dump. At minimum it contains:

```json
{
  "user_intent": "research_reference",
  "question": "What does this regulation require?",
  "selected_captions": [
    {
      "caption_id": "caption-0042",
      "speaker": "Jordan",
      "text": "We need to account for the new regulation before the pilot.",
      "meeting_offset": "00:38:14"
    }
  ],
  "approved_context": [],
  "evidence_bundle_id": "CK-EV-1234",
  "source_scope": "organization_and_public"
}
```

The user must be able to remove context or cancel before transmission. Whole
transcripts are never the default payload.

## Research Card

A Research Card is a derivative and must include:

- the user's question and a concise answer;
- direct citations and retrieval time;
- public, organizational, or combined source scope;
- the source-caption and evidence-bundle identifiers;
- a distinction between sourced facts, inference, and uncertainty;
- an honest `insufficient evidence` outcome; and
- provenance retained when pinned, copied, or exported.

The card never rewrites the raw transcript or replaces the authoritative
meeting evidence.

## Committed 5.4 deployment profiles

One shared TypeScript MCP server and Evidence Action contract ship in two equal
profiles:

| Profile | Assistant bridge | MCP transport | Ownership |
| --- | --- | --- | --- |
| Local | Enrolled local bridge | `stdio` | User or customer device |
| Customer hosted | Authenticated assistant endpoint | Streamable HTTP | Customer environment |

Task
[#322](https://dev.azure.com/DAF-TECH/Better%20CaptionKeep/_workitems/edit/322)
owns the shared server. Tasks
[#327](https://dev.azure.com/DAF-TECH/Better%20CaptionKeep/_workitems/edit/327),
[#328](https://dev.azure.com/DAF-TECH/Better%20CaptionKeep/_workitems/edit/328),
and
[#329](https://dev.azure.com/DAF-TECH/Better%20CaptionKeep/_workitems/edit/329)
own the shared envelope, local profile, and customer-hosted profile.

The shared server foundation now has verified stdio and authenticated
Streamable HTTP entries. Both negotiate through the official MCP client, list
the same seven read-only tools, and pass the same empty-repository behavior
contract. The HTTP entry additionally enforces exact issuer, audience, tenant,
approved client ID, expiry, subject, and required scope or application-role
claims on every MCP request. Container packaging and the Azure reference
profile are implemented and statically validated; a live image build, scan,
deployment, plus gateway rate/replay evidence remain open under task #329.

## Send to my assistant

MCP normally lets an AI client call Better CaptionKeep. It does not, by itself,
give an idle browser side panel a universal way to wake any customer-selected
assistant. The optional 5.4 bridge supplies that initiation path:

1. An administrator enrolls a customer-controlled assistant endpoint.
2. The user selects evidence and an action such as **Create a work item**.
3. Better CaptionKeep previews the structured request.
4. The customer's assistant uses its existing connector to prepare a draft.
5. The user separately approves the external action in the customer-controlled
   environment.
6. A receipt may return and link the created item to the source evidence.

The extension now implements one versioned bridge protocol over both an
enrolled native-messaging host and an exact customer-approved HTTPS origin.
Remote enrollment uses authorization code with PKCE, no client secret, and
session-only tokens. All Settings keeps this advanced setup out of the compact
popup, requests only the chosen optional permission, and allows managed policy
to disable Evidence Actions, require scrubbed evidence, restrict intents, or
lock the enrolled bridge. Reviewed jobs are idempotent and recover after MV3
service-worker suspension; uncertain submissions reuse the same idempotency
key instead of creating a second action.

The Evidence Board now also implements the reviewed connector-action state
machine. **Prepare work item** carries only the reviewed evidence and a neutral
destination hint. The customer assistant must already have the requested
connector. Its structured draft is sealed and shown as
`confirmation_required`; CaptionKeep has no confirmation control and cannot
execute it. Success is accepted only with the customer assistant's explicit
confirmation attestation plus an external-system record ID or HTTPS URL,
action time, and matching selected evidence IDs. Tampered stored drafts are
discarded when their seal no longer matches. CaptionKeep neither supplies nor
stores Jira, Azure DevOps, Planner, Microsoft 365, email, or other connector
credentials. Those connections and permissions belong to the customer's LLM
or agent environment.

The executable protocol, customer adapter interface, bounded native host,
restart-safe file inbox, Chrome/Edge manifest template, and reviewable Windows
enrollment/removal helpers live in
[`packages/captionkeep-assistant-bridge`](../packages/captionkeep-assistant-bridge/README.md).
The wire contract and endpoint rules are documented in the
[assistant bridge protocol](ASSISTANT-BRIDGE-PROTOCOL.md). The reference host
contains no default LLM or customer connector and performs no browser
enrollment until an administrator explicitly runs the helper.

The release workflow now creates one allowlisted Evidence Actions deployment
ZIP containing the built assistant bridge, built read-only MCP server, exact
dependency lockfiles, Windows direct-launch native-host executable and audited
source, Azure reference template, and deployment/runbook documents. A separate
provenance record binds the ZIP, repository commit, and lockfile digests. The
bundle explicitly excludes connectors, credentials, tenant identities, meeting
evidence, tests, private keys, environment files, and `node_modules`. The
[assistant bridge deployment runbook](ASSISTANT-BRIDGE-DEPLOYMENT.md) defines
installation, neutral connector acceptance, incident recovery, and removal.
The release gate then extracts that ZIP into a clean temporary directory,
performs production-only locked installs, negotiates all seven read-only tools
from the extracted MCP server, and completes a framed request through the
extracted Windows launcher and bridge. The resulting machine-readable evidence
is bound to the same artifact digest and commit before release provenance is
accepted.

A successful research response is accepted only when every claim has at least
one valid citation. Meeting citations must point to captions included in the
reviewed envelope; public and organizational citations require HTTPS sources.
The resulting Research Card is sealed, stored separately from the transcript,
shown on the Evidence Board, and linked to the job receipt. The source
transcript remains authoritative.

Tasks
[#325](https://dev.azure.com/DAF-TECH/Better%20CaptionKeep/_workitems/edit/325)
and
[#326](https://dev.azure.com/DAF-TECH/Better%20CaptionKeep/_workitems/edit/326)
cover the bridge and reviewed work-item actions. CaptionKeep does not gain
write-capable MCP tools: an external action is executed by the customer's own
connector only after the customer-controlled environment presents a draft and
receives explicit confirmation. A returned receipt links the result to source
evidence without storing connector credentials or rewriting the transcript.

### Optional .NET reference bridge

Microsoft-centric customers may implement either bridge profile with
`Microsoft.Extensions.AI`. Its `IChatClient` abstraction lets the customer
choose an approved local or hosted model without changing the Evidence Action
contract, while its middleware supports customer-owned telemetry, caching, and
tool invocation. A .NET host can also use Microsoft's `ModelContextProtocol`
client to consume CaptionKeep's read-only MCP tools.

This is a reference-adapter path, not a new CaptionKeep transport and not a
dependency of the extension or TypeScript MCP server. The .NET host must enforce
the same enrollment, tenant binding, evidence-size limits, untrusted-caption
boundary, cancellation, receipt, and human-confirmation rules as every other
bridge implementation.

Tasks
[#330](https://dev.azure.com/DAF-TECH/Better%20CaptionKeep/_workitems/edit/330),
[#331](https://dev.azure.com/DAF-TECH/Better%20CaptionKeep/_workitems/edit/331),
and
[#332](https://dev.azure.com/DAF-TECH/Better%20CaptionKeep/_workitems/edit/332)
cover All Settings and managed policy, durable asynchronous jobs and receipts,
and complete deployment/operations documentation.

The task #331 implementation stores each sealed, reviewed request as a bounded
local job record with a stable idempotency key, revision checks, explicit state
transitions, retry attempt counts, and typed success or failure receipts. Saving
the same still-active sealed action does not create a duplicate job, and saving
a review still does not contact an assistant. Dispatch recovery, result
persistence, status/retry/cancellation controls, and visible job history are
implemented; live browser restart and assistant round-trip evidence remain.

Stored Evidence Actions, Research Cards, connector drafts, and completion
receipts are now re-hashed when read or saved. Records whose content no longer
matches their SHA-256 seal are rejected rather than dispatched or displayed.
Automated adversarial tests also prove that caption-borne instructions cannot
switch a reviewed connector profile or satisfy customer confirmation, local
bridge drafts cannot inject external review links, remote review links must
match the enrolled assistant origin, and oversized or timed-out responses fail
closed. These tests do not replace live Chrome and Edge validation.

## Release gates

Evidence Actions cannot enter a release candidate until:

- ADR task
  [#319](https://dev.azure.com/DAF-TECH/Better%20CaptionKeep/_workitems/edit/319)
  is approved;
- the read-only schemas in task
  [#320](https://dev.azure.com/DAF-TECH/Better%20CaptionKeep/_workitems/edit/320)
  are versioned and testable;
- side-panel selection and disclosure preview in task
  [#321](https://dev.azure.com/DAF-TECH/Better%20CaptionKeep/_workitems/edit/321)
  pass accessibility review;
- the customer-deployable reference server in task
  [#322](https://dev.azure.com/DAF-TECH/Better%20CaptionKeep/_workitems/edit/322)
  fails closed for unauthorized and cross-tenant access;
- Research Cards in task
  [#323](https://dev.azure.com/DAF-TECH/Better%20CaptionKeep/_workitems/edit/323)
  retain citations and source provenance; and
- adversarial, privacy, clean-profile Chrome, and clean-profile Edge evidence
  required by task
  [#324](https://dev.azure.com/DAF-TECH/Better%20CaptionKeep/_workitems/edit/324)
  is recorded;
- both deployment profiles pass the same tool and envelope contract suite;
- the direct Evidence Board round trip survives side-panel closure, MV3 service
  worker suspension, timeout, restart, retry, cancellation, and duplicate
  delivery; and
- reviewed customer-connector actions cannot execute without a distinct
  customer-side confirmation and return an honest success, denial, failure, or
  unknown receipt.

## Delivery sprints

- **October 5-11:** ADR, MCP contract, shared envelope, Evidence Board selection
  and preview, and shared server foundation.
- **October 12-18:** local and customer-hosted profiles, assistant bridge, All
  Settings administration, durable jobs, and Research Cards.
- **October 19-24:** reviewed connector actions, operational documentation,
  adversarial testing, clean-profile Chrome/Edge UAT, candidate freeze, and
  go/no-go.

The engineering release candidate must be complete before October 25, 2026.
Browser Store review time after submission is external and is not represented
as a guaranteed publication date.

## Current truth

The product direction and Azure Boards work are approved. The Dev source now
contains the Evidence Actions runtime, read-only MCP server, common local/HTTPS
bridge protocol, reference native host SDK, durable jobs, and cited Research
Cards. Automated contract tests are evidence for those components, not proof of
a live customer assistant, external connector, deployment, or clean-profile
Chrome/Edge workflow. Those release gates remain open.
