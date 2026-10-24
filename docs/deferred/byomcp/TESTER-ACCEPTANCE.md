# Historical MCP acceptance — not a current 6.0 gate

The lead deferred MCP on October 16, 2026. These unfinished cases are preserved for a later release; none is marked passed by preservation.

## BYOMCP — setup and operation acceptance

**Current limitation:** a piloted setup wizard and unified beginner runbook are
not implemented at this baseline. Current setup uses a separately installed
helper, reviewed nonsecret configuration and Settings. Do not mark onboarding
accepted because an engineer completed it for you. Core tests can proceed while
MCP prerequisites are BLOCKED. See [helper technical setup](../../../companion/byomcp/README.md).

Repeat the applicable cases separately for **remote HTTP through the helper** and
**local stdio through the helper**, and per supported browser. Cloudflare's earlier
remote TXT test proved installed-helper execution, NOT the browser approval flow.
Use a controlled fixture/test service and a reviewed no-op or synthetic read tool.
Tool names/descriptions are not proof of harmlessness; inspect exact arguments.

| ID | What to do | Expected result |
| --- | --- | --- |
| M01 | Start clean with MCP off; capture a meeting. Open Connections and attempt guided setup without verbal developer coaching. | Core works independently. Setup should guide install/add service/sign-in/check/first operation and explain current progress. Missing wizard is recorded as a required UX gap. No arbitrary command is run by the extension. |
| M02 | With a build-owner-prepared helper/configuration for this exact browser ID, open All Settings → Connections — Bring Your Own MCP. Expand installation/enrollment, choose the supplied nonsecret binding JSON, review its identity and import. | Credentials never entered/imported into extension. Wrong browser/caller/digest rejected. No connection/tool execution merely from import. Record any developer assistance. |
| M03 | Select Connect enrolled helper. First deny native permission, then retry and allow for the intended helper. Test missing/wrong helper in an isolated prepared environment. | Distinct actionable state; controls recover, no endless disabled panel. Connect alone does not execute tools or transmit captions. |
| M04 | For the remote service, follow helper-owned authorization with a separately approved test account/grant, then Check connection status. Test cancel/expiry. | Requested scopes visible; no IDE credential copying. Browser and provider grants are separate. Return page failure is not success without helper confirmation. Expired/denied authorization explains recovery; no silent sign-in. |
| M05 | Choose Verified helper profile → All MCP tools — advanced → Load all tools for selected profile. Inspect names/schema. | Full discovered catalog, including writes, available for review; no tool invoked by discovery. Malicious descriptions stay inert. Wrong/stale profile rejected, not empty false success. |
| M06 | With writes off, prepare an agreed synthetic no-op/read operation. Then enable Allow reviewed write actions and review again. | Preparation does not execute. Generic tools conservatively need the write gate even if called read-only. The toggle grants no blanket execution permission. Managed denial still wins. |
| M07 | Enter reviewed exact JSON; select Review this operation. Compare destination/tool/arguments; cancel. Repeat and select Approve and run this exact operation once. | Only the displayed approved operation is dispatched once. Editing arguments/profile or disconnecting invalidates review. Returned generic data is labeled untrusted, not independently verified success. No automatic follow-up calls. |
| M08 | With a controlled delayed fixture, close/disconnect before dispatch, double-click approve, let a proposal expire, change policy, and interrupt a response after dispatch. | No dispatch after revocation, no duplicate operation, no expired approval. Unknown outcome stays unknown and is not automatically retried. Closing does not promise remote undo. Core remains usable. |
| M09 | In a separately configured typed action workflow, select synthetic meeting evidence, preview exact action/resource/current/proposed state, approve, inspect result and pin a Receipt. | Outbound scope matches review. Independent readback required before verified Receipt; stale state, source changes, fabricated citations or mismatched result rejected. Generic catalog responses must not masquerade as this typed verified path. |
| M10 | Restart browser/helper, reconnect, remove access and exercise uninstall instructions in a disposable setup. | State is honest, old approvals cannot replay, no auto-send. Provider revocation is separate from Disconnect. Missing removal/recovery instructions block deployment acceptance. |

**Real-write boundary:** this document is not permission to change DNS, send mail,
create tickets or query real people. Any later live write test needs its own exact
account/resource/action approval, unique test data, verified cleanup and recorded
unknown-outcome procedure. Do not repeat the previous DNS test automatically.
