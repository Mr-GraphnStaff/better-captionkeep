# Portable execution

## Package boundary

Keep SKILL.md, references, assets, and optional UI metadata together. Resolve links relative to the skill folder with the host reader. Copy the entire software-team directory when transferring. Core instructions are Markdown and require no particular language, account, service, or tool name.

Keep requirements, paths, conventions, decisions, ledger, and evidence in each project's own context. Never copy project-specific data into this skill. Verify identity when switching projects.

The named standing roster is package content in [team-roster.md](team-roster.md). It travels with the skill; project performance records do not. Compare the version in SKILL.md and the release file hashes before calling two installations identical. Do not infer that ChatGPT Pro automatically copies local skill folders into a web session.

## Host adapters

| Capability | Adaptation |
|---|---|
| Skill discovery | Put the complete folder in the host's configured skill location; follow existing conventions and verify installation rather than guessing paths |
| Codex/ChatGPT runtime | Invoke through available UI or $software-team; use host filesystem/connectors/delegation when permitted |
| Claude Code/other host | Preserve the Markdown package; use supported discovery, readers, tools, and agent interface; check conventions locally or official docs when needed |
| No skill discovery | Explicitly load SKILL.md and relevant references from the copied folder; label manual use, not installation |
| Independent agents | Supply bounded contracts, relevant playbooks/raw artifacts, and exclusive edit ownership |
| Single agent | Run sequential specialist passes and label self-review, without fabricated parallel work/sign-off |
| Missing browser/network/service | Do supported local/static work, disclose limits, request required access/input only |

Treat agents/openai.yaml as optional UI metadata, not a permanent-team launcher or cross-host runtime configuration. The package grants no credentials, permissions, deployment authorization, or background execution.

## Onboard and move

Verify actual project access. Read instructions, structure, build/test scripts, docs, repository status, and decisions. Record facts needed for the assignment. Identify missing inputs/capabilities. Use the context template when persistence is useful. Start at the existing stage.

For greenfield work establish audience, outcome, platform constraints, data sensitivity, operating expectations, and smallest meaningful slice. Mark reversible assumptions. Progress on independent work while consequential questions remain open; never invent stakeholder answers.

Transfer the entire folder without absolute paths or personal IDs. Preserve project context separately. Check linked resources and run a bounded read-only assignment after moving. Claim cross-host execution tested only if actually performed. Keep skill changes separate from project implementation.

## Versioned distribution

Use the optional [Export-SoftwareTeam.ps1](../scripts/Export-SoftwareTeam.ps1) helper from a local PowerShell host to build a portable plugin and ZIP from this authoring folder. The exporter includes only SKILL.md, agents, assets, references and scripts; it excludes backup folders. Its release manifest records the exact skill files and SHA-256 values. Export to a fresh output directory and keep that release together.

The local authoring folder is the source. A plugin installation or web upload is a released copy, not a live mount of that source. After edits, increment the version, export again and update the relevant installations. An old copy remains old until refreshed. Do not claim automatic synchronization.

For a host acceptance check, ask: "Which Software Team version is loaded, who are the standing members, what does Heike own, and can this host run independent agents?" The answer must come from the loaded version and roster, with actual runtime limitations. Test desktop and web separately; an installed local plugin does not establish web availability.
