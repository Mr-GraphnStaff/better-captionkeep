# Better CaptionKeep MCP server

This package is the shared, customer-owned, read-only evidence server for Better
CaptionKeep Evidence Actions. The same server factory will support:

- local AI hosts over `stdio`; and
- customer-hosted AI environments over Streamable HTTP.

The shared schema, file-backed evidence repository, and complete read-only tool
surface run through both the local `stdio` entry point and the authenticated
Streamable HTTP entry point. The assistant bridge, container packaging, and
Azure reference deployment remain separately tracked work.

## Local development

Requires Node.js 20 or later.

```powershell
npm install
$env:CAPTIONKEEP_EVIDENCE_DIR = 'C:\path\to\approved-evidence'
npm run build
npm start
```

From the repository root, `npm run test:mcp` performs a locked install, builds
the package, tests the file repository, launches the real stdio server, and
uses the official MCP client SDK to negotiate, list the seven tools, verify
their read-only annotations, and execute a tool call.

The evidence directory is read-only from the MCP server's perspective. It may
contain Better CaptionKeep provenance bundles and reviewed Evidence Action
envelopes. Files larger than 4 MiB, symbolic links, unrecognized JSON, expired
actions, and malformed records are ignored with errors returned to the caller.

The stdio binary opens no network listener.

## Customer-hosted Streamable HTTP

Run the HTTP binary behind a customer-controlled TLS reverse proxy or ingress.
It binds to `127.0.0.1` by default and refuses to start unless its public HTTPS
origin and complete token-validation policy are configured.

```powershell
$env:CAPTIONKEEP_EVIDENCE_DIR = 'C:\path\to\approved-evidence'
$env:CAPTIONKEEP_MCP_PUBLIC_ORIGIN = 'https://captionkeep-mcp.example.com'
$env:CAPTIONKEEP_MCP_ISSUER = 'https://login.microsoftonline.com/<tenant-guid>/v2.0'
$env:CAPTIONKEEP_MCP_AUDIENCE = 'api://<captionkeep-mcp-app-id>'
$env:CAPTIONKEEP_MCP_TENANT_ID = '<tenant-guid>'
$env:CAPTIONKEEP_MCP_JWKS_URI = 'https://login.microsoftonline.com/<tenant-guid>/discovery/v2.0/keys'
$env:CAPTIONKEEP_MCP_ALLOWED_CLIENT_IDS = '<approved-client-guid>'
$env:CAPTIONKEEP_MCP_REQUIRED_SCOPES = 'CaptionKeep.Evidence.Read'
$env:CAPTIONKEEP_MCP_ALLOWED_HOSTS = 'captionkeep-mcp.example.com'
$env:CAPTIONKEEP_MCP_ALLOWED_ORIGINS = 'captionkeep-mcp.example.com'
npm run build
npm run start:http
```

Optional settings are `CAPTIONKEEP_MCP_HOST` (default `127.0.0.1`),
`CAPTIONKEEP_MCP_PORT` (default `3333`), and `CAPTIONKEEP_MCP_PATH` (default
`/mcp`). Host and Origin allowlists contain hostnames, not full URLs. Requests
without an `Origin` header remain valid for non-browser MCP clients; a supplied
Origin must match the allowlist.

Every MCP request requires an RS256 bearer token with the exact configured
issuer, audience, tenant, enrolled client ID, expiry, subject, and every
required delegated scope or application role. The unauthenticated protected
resource metadata document is exposed at
`/.well-known/oauth-protected-resource`. The server never accepts identity
tokens as a substitute for an access token and never stores bearer tokens.

## Tools

- `captionkeep_search_meetings`
- `captionkeep_search_captions`
- `captionkeep_get_meeting_evidence`
- `captionkeep_get_decisions_and_actions`
- `captionkeep_get_caption_sources`
- `captionkeep_verify_evidence_bundle`
- `captionkeep_get_active_selection`

Every tool is annotated read-only and non-destructive. No tool sends messages,
creates work items, changes evidence, or administers customer systems.
