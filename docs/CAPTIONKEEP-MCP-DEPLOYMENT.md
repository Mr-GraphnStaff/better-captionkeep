# CaptionKeep MCP deployment runbook

Status: 5.4 Development  
Last updated: 2026-10-05

## Boundary

The CaptionKeep MCP server is optional, customer owned, and read-only. It reads
only approved evidence files from the configured directory. It has no tool for
creating, changing, deleting, or sending data in Jira, Microsoft 365, or any
other customer system. The browser extension continues to capture, review,
store, and export locally when no MCP deployment exists.

## Local stdio profile

Use the stdio profile when an approved AI host launches MCP processes locally:

```powershell
cd packages\captionkeep-mcp
npm ci
npm run build
$env:CAPTIONKEEP_EVIDENCE_DIR = 'C:\CaptionKeep\ApprovedEvidence'
npm start
```

Configure the AI host to run `node` with
`dist/src/index.js` and the evidence-directory environment variable. The stdio
binary opens no TCP listener. Give the process read-only filesystem access to a
dedicated evidence directory rather than an entire user profile or transcript
archive.

## Generic container profile

Build from `packages/captionkeep-mcp`:

```powershell
docker build --pull --tag customer.example/captionkeep-mcp:5.4.0-dev .
```

The image uses a two-stage Node build, prunes development dependencies, runs as
the unprivileged `node` account, and starts only the authenticated HTTP entry.
Pin the base image to an approved digest in the customer build pipeline and
scan the resulting image before promotion. Mount approved evidence read-only at
`/evidence`; do not bake meeting evidence, tokens, certificates, or `.env`
files into the image.

Terminate TLS at a customer-controlled ingress and pass the configuration
documented in `packages/captionkeep-mcp/README.md`. The application defaults to
loopback; a container must explicitly set `CAPTIONKEEP_MCP_HOST=0.0.0.0`.

## Azure Container Apps reference

`deployment/azure/captionkeep-mcp-container-app.bicep` deploys the generic image
into an existing customer-owned Container Apps managed environment. Before
deployment, the customer provides:

- a scanned image in its approved registry;
- a managed environment and named Azure Files storage attachment;
- a public HTTPS origin and matching Host/Origin allowlist;
- one exact tenant issuer, API audience, tenant GUID, and JWKS endpoint;
- the explicitly enrolled calling client GUIDs; and
- at least one required delegated scope or application role.

The referenced Azure Files attachment should expose only approved evidence and
be mounted read-only at the infrastructure/storage layer. The template contains
no model credential, connector credential, client secret, signing key, or
customer evidence.

Validate and deploy from the repository root:

```powershell
az bicep build --file deployment/azure/captionkeep-mcp-container-app.bicep
az deployment group what-if --resource-group <customer-resource-group> --template-file deployment/azure/captionkeep-mcp-container-app.bicep --parameters <customer-parameters-file>
```

Run `what-if` and customer security review before deployment. A compiled
template is not authorization to deploy or evidence that the endpoint is live.

### Low-cost UAT profile

The template defaults to `minReplicas: 0`, so an HTTP-triggered deployment on
an Azure Container Apps Consumption environment can scale to zero when it is
not being tested. Set `maxReplicas: 1` in the UAT parameters to bound an
accidental burst. Expect a cold start on the first request after an idle
period. Azure can still charge for active compute, outbound data, requests,
storage, registry, logging, and any supporting resources; scale-to-zero is not
a guarantee that the complete resource group costs nothing.

Keep this test deployment separate from the private Store release environment.
Use only synthetic evidence, do not reuse Store credentials or the release Key
Vault, and remove the UAT resource group when testing is complete. The MCP is
only the assistant's read-only evidence retrieval path. Testing **Send to my
assistant** also requires either the local native bridge or a customer-owned
HTTPS assistant endpoint implementing the bridge protocol; the MCP cannot
initiate that send by itself.

## Authentication and network checks

Every request to `/mcp` must present a signed RS256 access token. Validation
requires exact issuer, audience, tenant, approved client ID, expiry, subject,
and all configured scopes or app roles. Host and supplied Origin headers must
match explicit allowlists. Request bodies are capped at 1 MiB.

The protected-resource metadata document is available at
`/.well-known/oauth-protected-resource`. Do not expose the backend directly;
restrict ingress to the approved front door, gateway, or Container Apps
ingress. Apply customer rate limiting, WAF policy, egress control, logging,
alerting, backup, and retention requirements outside the container.

## Verification and recovery

Before enabling an assistant connection:

1. Run `npm run test:mcp` and record the result and package-lock digest.
2. Confirm unauthenticated, wrong-tenant, wrong-audience, wrong-client, expired,
   and insufficient-scope requests fail.
3. Confirm both stdio and HTTP list exactly seven read-only tools.
4. Call every tool against synthetic evidence and confirm the same structured
   contract across profiles.
5. Confirm the runtime identity cannot write to the evidence mount.
6. Revoke the enrolled client and confirm subsequent calls fail.
7. Remove the deployment or local host configuration and confirm the extension
   continues to capture, review, and export locally.

For suspected compromise, revoke the calling client or its assignment first,
stop the endpoint, preserve customer audit evidence, rotate any affected
customer-managed keys, and re-enroll only after the cause is understood. The
CaptionKeep publisher cannot revoke or recover customer identities or data.

## Current verification limit

The TypeScript build, signed-token tests, stdio contract, HTTP contract, and
Azure Bicep compilation are automated. A container runtime is not installed on
the current development host, so a real image build, scan, registry push,
Azure `what-if`, and live customer-tenant deployment remain required evidence.
