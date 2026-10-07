# ADR-0001: Evidence Actions ownership and transport architecture

- **Status:** Accepted for implementation
- **Date:** 2026-10-05
- **Decision owners:** Better CaptionKeep product and security owner
- **Azure Boards:** Feature #318; architecture task #319

## Context

Better CaptionKeep already captures normalized captions locally, creates
source-linked Evidence Board markers, and prepares review-first BYOAI handoffs.
Evidence Actions extends that boundary so a user can select exact caption
evidence, ask an approved assistant to research or prepare work, and retain the
result beside the source evidence.

MCP normally allows an AI host to call a server. It does not give an idle
browser side panel a universal method for initiating work in an arbitrary AI
host. A separate, optional assistant bridge is therefore required for the
direct side-panel round trip.

## Decision

### One domain contract

All deployments use one versioned Evidence Action envelope, one result and
receipt contract, and one set of read-only CaptionKeep MCP tools. Local and
customer-hosted modes are deployment profiles, not separate products.

### Two deployment profiles

1. **Local:** an enrolled local assistant bridge receives reviewed Evidence
   Actions; the customer's local AI host runs the CaptionKeep MCP server over
   `stdio`.
2. **Customer hosted:** a tenant-bound assistant endpoint receives reviewed
   Evidence Actions; the customer's AI host connects to the CaptionKeep MCP
   server over Streamable HTTP.

The core extension remains functional when neither profile is configured.

The customer-hosted profile may be implemented with a provider-neutral .NET
reference bridge based on `Microsoft.Extensions.AI` and the .NET
`ModelContextProtocol` client. This is an adapter behind the shared bridge and
MCP contracts, not a third deployment profile. JavaScript/TypeScript remains
the canonical server implementation for 5.4.

### Evidence handoff is not capture transport

Provider adapters and capture coordination continue to produce and preserve
the authoritative local transcript. Evidence Actions introduces an
`EvidenceActionTransport` boundary only after the user selects evidence and
approves its release. It does not replace capture, history, export, or the
local-only default.

### Read-only MCP; customer-owned actions

CaptionKeep MCP tools search, retrieve, and verify evidence. They do not create,
update, delete, send, or administer external records. Jira, Azure DevOps,
Microsoft 365, and other actions are executed only by the customer's AI host
through customer-owned connectors after a reviewed draft and distinct
confirmation. CaptionKeep stores no connector credentials.

### Source and derivative boundary

The captured transcript remains authoritative. Selections, research cards,
work-item drafts, and action receipts are derivatives linked to stable source
caption IDs. No assistant result rewrites the transcript.

### Untrusted meeting content

Caption text, notes, links, and assistant output are untrusted data. They are
placed in typed data fields, never concatenated into system instructions.
Spoken or pasted commands cannot select tools, change destinations, bypass
review, or authorize an external action.

## Responsibilities

Better CaptionKeep owns:

- evidence selection and disclosure preview;
- bounded payloads and schema validation;
- immutable-source and derivative separation;
- read-only MCP enforcement;
- connection enrollment and managed-policy enforcement;
- provenance, receipts, and honest failure states; and
- Chrome/Edge extension and reference-server verification.

The customer owns:

- the AI host and models;
- identity, tenant, connector, and source authorization;
- connector permissions and confirmation policy;
- endpoint, storage, logging, retention, backup, and monitoring; and
- downstream records created in customer systems.

## Security invariants

- No automatic transcript disclosure.
- No unreviewed whole-transcript payload.
- No arbitrary destination URL.
- No identity or connector token in an Evidence Action envelope.
- No write-capable CaptionKeep MCP tool.
- No external action without a reviewed draft and customer-side confirmation.
- No success state without a verifiable result or receipt.
- No cross-tenant evidence access.
- No transcript body in default operational logs.

## Consequences

The assistant bridge and MCP server are related but independent interfaces.
Both local and remote profiles must pass the same envelope and tool contract
tests. Direct Research Card return requires the bridge; MCP alone returns its
result to the connected AI host. Packaging, enrollment, upgrades, removal, and
failure recovery are release requirements rather than follow-up documentation.

## Rejected alternatives

- **Publisher-hosted transcript/AI service:** rejected because it changes the
  local-first privacy and ownership model.
- **Extension as an MCP server:** rejected because a Manifest V3 extension
  cannot provide the portable `stdio` or authenticated multi-client server
  lifecycle required by AI hosts.
- **One-off provider integrations:** rejected because CaptionKeep would inherit
  customer connector credentials and duplicate Jira/Microsoft/other clients.
- **Copy-only workflow as the final design:** retained as a fallback, but
  rejected as the complete Evidence Actions experience because it cannot return
  status, Research Cards, or action receipts to the Evidence Board.
