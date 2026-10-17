# Azure DevOps MCP integration (Claude Code, read-only)

This project's work is tracked in Azure DevOps Boards (tenant `daf-tech.com`), and both Codex and Claude Code are used on this repo. To avoid the two agents stepping on each other, the split is:

- **Codex**: writes code.
- **Claude Code**: research — platform/DOM investigation (see `docs/ZOOM-WEB-CHALLENGES.md`, `docs/MEETING-CHAT-CAPTURE.md`), Azure Boards state, CI/CD and release pipeline status.

Research-only clients connect to the official Microsoft **remote Azure DevOps MCP server** (`https://mcp.dev.azure.com/{organization}`) with server-side **read-only** filtering, scoped to the toolsets they need. The coordinating agent can maintain Boards through a separately authorized connection; this research configuration does not grant write authority.

```json
{
  "mcpServers": {
    "ado": {
      "type": "http",
      "url": "https://mcp.dev.azure.com/{organization}",
      "headers": {
        "X-MCP-Toolsets": "wit,pipelines,work",
        "X-MCP-Readonly": "true"
      },
      "oauth": {
        "clientId": "{client-id}",
        "callbackPort": 3118
      }
    }
  }
}
```

- `wit` — work items/boards (read-only: get/list/comments/revisions/search; no create/update/link)
- `pipelines` — builds, runs, logs, artifacts (read-only: no queueing runs or editing pipeline definitions)
- `work` — iterations/capacity (read-only)

`X-MCP-Readonly: true` additionally hard-disables every write-capable tool at the server level, so this is enforced by Azure DevOps itself, not just by convention.

## Setup (one-time, per developer machine)

Requires the Azure DevOps org to be backed by a Microsoft Entra tenant (true for `daf-tech.com`). Steps:

1. In the [Microsoft Entra admin center](https://entra.microsoft.com): **App registrations** → **New registration**.
2. **Authentication (Preview)** → add redirect URI (Mobile and desktop applications) → `http://localhost:3118/callback`.
3. Same page, **Settings** tab → enable **Allow public client flows**.
4. **API permissions** → **Add a permission** → **APIs my organization uses** → find **Azure DevOps MCP** (app ID `2a72489c-aab2-4b65-b93a-a91edccf33b8`) → add delegated permissions → **Grant admin consent**.
5. Copy the **Application (client) ID**.
6. Register the server with Claude Code:
   ```bash
   claude mcp add --transport http ado https://mcp.dev.azure.com/{organization} \
     --header "X-MCP-Readonly: true" \
     --header "X-MCP-Toolsets: wit,pipelines,work" \
     --client-id {client-id} --callback-port 3118
   ```
7. In Claude Code, run `/mcp` and complete the browser sign-in.
8. Run `claude mcp get ado` and verify the saved HTTP configuration includes
   both headers with exactly the values above. Then inspect the authenticated
   connection's available tools through `/mcp` (or its MCP `tools/list` result).
   Confirm work-item reads and permitted pipeline/iteration reads are available,
   but work-item writes, comments/links, queued builds, iteration/capacity writes
   and other mutation tools/actions are unavailable. Do not test this by writing
   to production. If the client cannot expose the tool list or write actions are
   present, stop and treat read-only verification as incomplete.

The command above is shell syntax with backslash continuations. On PowerShell,
run it on one line (or use PowerShell's continuation syntax). If `ado` already
exists, inspect it first; do not silently replace an authenticated configuration.

Local verification on October 14, 2026: installed `claude mcp add --help`
supports repeated `--header`, `--client-id`, and `--callback-port` flags.
Microsoft and Claude Code documentation confirm the header/authentication
contracts. A new authenticated connection and its filtered tool inventory were
not exercised during this documentation repair; GitHub issue #38 remains open.

Reference: [Set up the remote Azure DevOps MCP Server](https://learn.microsoft.com/en-us/azure/devops/mcp-server/remote-mcp-server?view=azure-devops).
Client syntax: [Claude Code MCP configuration](https://code.claude.com/docs/en/mcp).

## Why not give it write access

Codex is the one writing code and, implicitly, the one whose commits/PRs should drive board-state changes (moving work items, linking PRs, updating build status). A second agent independently writing to the same board risked exactly the kind of state drift this project is already trying to avoid between two AI coding agents sharing one repo (see the branch/coordination discussion in project history). Read-only removes that risk entirely rather than relying on both agents behaving.
