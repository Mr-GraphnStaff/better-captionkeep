# Better CaptionKeep 5.4 release record

Status: **Frozen and submitted; Store review/certification in progress**
Last updated: 2026-10-10

## Release decision

Version 5.4 is limited to capabilities that can be demonstrated directly in
the extension without a missing customer service. On the Fly is included as a
bounded, reviewed workspace handoff: select meeting evidence, choose a task,
review the exact prompt, then explicitly copy and open the user's existing AI
workspace. Automatic research, result return, MCP, Research Cards, and
connector execution remain outside the release.

No Azure MCP or assistant service was deployed for 5.4.

Production PR [#86](https://github.com/Mr-GraphnStaff/better-captionkeep/pull/86)
merged commit `515819599bcd0c9e3d6d97852d36ef3517e68ac8`. The immutable
[GitHub release](https://github.com/Mr-GraphnStaff/better-captionkeep/releases/tag/v5.4.0)
contains the Store ZIPs, checksums, provenance, SBOM, and attestations. Azure
Store Release run **716** submitted the verified packages on October 10, 2026:

- Chrome accepted 5.4.0 for review with state `PENDING_REVIEW`.
- Microsoft accepted 5.4.0 for Edge certification.
- Chrome ZIP SHA-256: `71B9E7A7BC504BEED19FE53A0B0E92CB2DB7E7CCB1E8BD1A30D7F0904291D39D`.
- Edge ZIP SHA-256: `EF52646237380B6812091ABE90E9C8D7775879506C671DE7061E23CDAFF83CD7`.

These are submission states, not proof that either Store publicly serves 5.4.0.

## Included development scope

- Microsoft Teams, Google Meet, and Zoom Web remain explicit supported
  meeting surfaces.
- Opening the Live Workspace does not automatically enable captions, open the
  attendee panel, or request a Teams transcript. Those actions remain visible
  user choices when the provider supports them.
- The local Evidence Board continues to mark captured captions and export
  source-linked Markdown and provenance JSON.
- On the Fly accepts highlighted words or a whole source-linked caption for
  Research with sources, Explain in context, Draft a live reply, or Draft a
  follow-up email. It opens the reviewed AI handoff and never places evidence
  in a provider URL or submits a prompt.
- **Email follow-up** opens a reviewed draft in the user's saved Outlook work
  or school, Outlook.com personal, Gmail, or browser/default email destination.
  Recipients remain blank and nothing is sent automatically.
- DAF-TECH parent branding and the reviewed sphere asset remain.
- Packaged language catalogs remain uncertified AI-assisted previews with
  English fallback and a privacy-preserving correction form.
- Release provenance, Store metadata validation, and the single Azure Store
  publishing control plane remain in force.

## Explicitly excluded

- Connected BYOAI automatic result return in the 5.4 artifact. It remains part
  of the unified framework but needs a validated customer-owned adapter,
  authentication, permissions, disclosure, and return contract before shipping.
- Assistant endpoint or native-host enrollment.
- Automatic research or automatic return of cited results.
- CaptionKeep MCP server or Azure MCP deployment.
- Research Cards or live-chat drafts returned automatically from assistant output.
- Jira, Azure DevOps, Microsoft 365, Planner, email, or other connector actions.
- Publisher-hosted transcription, AI, analytics, or transcript storage.

## Release gates

The promotion decision used the following gates:

1. The extension tests, validation, security audit, Store metadata check, and
   production package verification pass from the frozen candidate.
2. Clean-profile Chrome and Edge UAT verifies Teams, Google Meet, Zoom Web,
   manual meeting controls, history, Evidence Board, exports, settings, and
   localization fallback.
3. Store screenshots and descriptions show only verified shipping behavior.
4. The candidate normally remains unchanged for at least 48 hours after live
   UAT. The product owner explicitly authorized an early release on October 10;
   this gate was shortened and is not represented as completed.
5. The product owner records a written go/no-go decision before any Store
   upload, submission, or publication. That authorization and the exception
   are recorded in PR #86, Azure run 716, and Azure Boards task #333.

Automated validation, clean-profile Chrome and Edge UAT, Production checks,
immutable package verification, and protected approval completed. Store
approval, public availability, and existing-install upgrade smoke tests remain
open and must not be inferred from a successful submission.

## Future research boundary

Any future connected-assistant or MCP work requires a new product decision that
defines the actual assistant, who operates it, its deployment and cost model,
authentication, supported AI providers, end-to-end browser behavior, customer
responsibilities, Store disclosures, and live acceptance evidence before code
returns to a release branch. The proposed, non-shipping direction is documented
in [Unified AI Framework](UNIFIED-AI-FRAMEWORK.md).
