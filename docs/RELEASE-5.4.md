# Better CaptionKeep 5.4 development record

Status: **Development only; not uploaded, submitted, or published**
Last updated: 2026-10-10

## Release decision

Version 5.4 is limited to capabilities that can be demonstrated directly in
the extension without a missing customer service. On the Fly is included as a
bounded, reviewed workspace handoff: select meeting evidence, choose a task,
review the exact prompt, then explicitly copy and open the user's existing AI
workspace. Automatic research, result return, MCP, Research Cards, and
connector execution remain outside the release.

No Azure MCP or assistant service was deployed for 5.4.

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
- **Email follow-up** opens the user's default mail handler with a local
  evidence brief, no recipients, and no automatic send.
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

5.4 cannot be promoted until all of the following are complete:

1. The extension tests, validation, security audit, Store metadata check, and
   production package verification pass from the frozen candidate.
2. Clean-profile Chrome and Edge UAT verifies Teams, Google Meet, Zoom Web,
   manual meeting controls, history, Evidence Board, exports, settings, and
   localization fallback.
3. Store screenshots and descriptions show only verified shipping behavior.
4. The candidate remains unchanged for at least 48 hours after live UAT.
5. The product owner records a written go/no-go decision before any Store
   upload, submission, or publication.

## Future research boundary

Any future connected-assistant or MCP work requires a new product decision that
defines the actual assistant, who operates it, its deployment and cost model,
authentication, supported AI providers, end-to-end browser behavior, customer
responsibilities, Store disclosures, and live acceptance evidence before code
returns to a release branch. The proposed, non-shipping direction is documented
in [Unified AI Framework](UNIFIED-AI-FRAMEWORK.md).
