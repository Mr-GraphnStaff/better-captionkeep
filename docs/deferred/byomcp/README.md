# BYOMCP — deferred from 6.0

The product owner explicitly removed MCP from the shipping 6.0 scope on October 16, 2026. No later release is pre-approved.

Existing companion/byomcp source, byomcp runtime modules, development scripts and tests retain the implementation for future work. They are not shipping extension payload or a 6.0 helper distribution. Some pre-removal UI regression fixtures live under tests/fixtures/deferred-mcp and are explicitly historical. They do not certify current shipping UI or deferred MCP acceptance.

The complete before-removal source snapshot (HEAD 7baceaf plus existing dirty/untracked work) was preserved and integrity-checked outside the checkout before edits. Local coordination archive: P:/Projects/.better-captionkeep-team/preserved-mcp-6.0-before-removal-2026-10-16.zip; SHA-256 dc24b16b700d92d2067ad1fa01cb5a95193b032b58c6dea6efb419ed6f82a739. This is a recovery artifact, not a shipping package or a portable download link. Preserve its pre-existing work when preparing a future branch.

Future acceptance remains documented in ../../software-team/MCP-ONBOARDING-6.0.md and this directory's [deferred tester contract](TESTER-ACCEPTANCE.md). The user journey must deliver supported installation/removal, safe service additions and upgrades, helper-owned sign-in, separate browser/provider/operation approvals, and fresh no-coaching browser-native stdio and remote-HTTP acceptance with failure/restart recovery. Historical helper success and synthetic tests do not establish this.

6.0 removal must preserve local captures, archives, derivatives, reviewed BYOAI handoff and read/delete compatibility for historical receipts. It must not uninstall user helpers or delete credentials/configuration/jobs as a side effect.
