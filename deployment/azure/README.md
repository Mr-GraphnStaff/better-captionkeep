# Private release environment

This deployment provides a private operator and Azure Pipelines path to the
Better CaptionKeep Store credentials.

## Design

- Azure Key Vault Standard uses Azure RBAC, purge protection, and a private
  endpoint. Public network access is disabled.
- A Linux B1s VM has no public IP and is normally deallocated. It is the
  private Store release agent.
- David administers the VM from WSL through Azure Run Command. This uses the
  Azure management plane and VM agent, so it requires no Bastion host, public
  IP, inbound SSH path, or additional secret.
- A pre-existing SSH public key remains a break-glass option if a private
  network route is added later; no password is configured.
- Private DNS resolves the vault name to its private endpoint from the VM.
- Store credentials are read at runtime by the VM's managed identity. They are
  not copied into Azure DevOps variable groups or service connections.
- The administrator is explicitly assigned Key Vault Administrator.
  Subscription Owner remains the management-plane recovery path and authorizes
  Run Command if data-plane access or networking is misconfigured.

The VM subnet explicitly enables Azure default outbound access so the agent can
reach Azure DevOps and the Store APIs without a paid NAT Gateway. It has no
public IP and exposes no Internet-facing inbound path. If Azure removes default
outbound access from this subscription, replace it with a controlled outbound
method before relying on the runner.

## Deploy

Run from the repository root while signed into the intended Azure tenant:

```powershell
$administratorObjectId = az ad signed-in-user show --query id -o tsv
$sshPublicKey = Get-Content "$env:USERPROFILE\.ssh\bck_release.pub" -Raw

az deployment sub create `
  --name better-captionkeep-private-release `
  --location centralus `
  --template-file deployment/azure/main.bicep `
  --parameters administratorObjectId=$administratorObjectId `
               administratorSshPublicKey="$sshPublicKey"
```

The checked-in deployment intentionally does not register the Azure Pipelines
agent or populate Store secrets. Register the agent only with a short-lived
token, then remove that token. Populate the Store secrets only after the private
network, administrator access, DNS, and outbound connectivity are verified.

## Secret boundary

The private vault contains only credentials:

| Key Vault name | Pipeline variable |
| --- | --- |
| `chrome-client-id` | `CHROME_CLIENT_ID` |
| `chrome-client-secret` | `CHROME_CLIENT_SECRET` |
| `chrome-refresh-token` | `CHROME_REFRESH_TOKEN` |
| `edge-client-id` | `EDGE_CLIENT_ID` |
| `edge-api-key` | `EDGE_API_KEY` |

The Chrome extension ID, Chrome publisher ID, and Edge product ID are public
identifiers and remain ordinary pipeline variables. The public GitHub release
does not require a GitHub token. Do not store the Azure Pipelines registration
token, SSH private key, seller metadata, or Azure login credentials in the
vault.

GitHub environment secrets are write-only, so their existing values cannot be
exported through the GitHub API. Retrieve them from the original secure source
or rotate them, then run this local PowerShell command. It prompts without echo
and sends each value as an Azure Managed Run Command protected parameter; the
VM writes it to the private vault through managed identity and the temporary
Run Command resource is deleted afterward.

```powershell
./deployment/azure/Set-BckStoreSecrets.ps1
```

The Edge API key receives a Key Vault expiration one year from the seeding
date by default. Set `-EdgeApiKeyExpiresOn` if the provider key has a different
expiration date.

## Azure Pipeline

`azure-pipelines.yml` uses the `Better CaptionKeep Private` agent pool. The
pipeline verifies the published GitHub release and hashes, optionally performs
credential preflight or uploads the exact packages as drafts, and only then
enters the `bck-store-production` environment for submission or publication.
That environment is the sole approval boundary. Verification and draft upload
do not require approval.

Start the private VM before queuing a run:

```bash
bck-azure-admin --keep-running --status
```

The VM cannot start itself while its only Azure Pipelines agent is offline.
Deallocate it after the run with `bck-azure-admin --deallocate`.

## WSL administration

Install the repository helper in WSL once:

```bash
deployment/azure/install-wsl-admin.sh
```

Then use it from any WSL directory:

```bash
bck-azure-admin --status
bck-azure-admin --verify
bck-azure-admin -- uname -a
```

The helper starts the VM when necessary, invokes the command through Azure Run
Command, and deallocates it afterward only when the helper started it. Use
`--keep-running` when a sequence of commands or a pipeline run follows. It will
not stop a VM that was already running unless `--deallocate` is explicitly
provided.

Run Command executes under the VM agent with elevated privileges. Treat every
invocation as an administrative action. The VM's managed identity—not David's
interactive Azure identity—accesses Store secrets through the private Key Vault
endpoint. Verification prints only DNS addresses and HTTP status codes; it does
not print secret names or values.

If private DNS or the endpoint is broken, use the subscription Owner role to
repair the network through the Azure management plane. Do not enable public Key
Vault access as a routine workaround.
