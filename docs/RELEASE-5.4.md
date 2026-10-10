# Better CaptionKeep 5.4 development record

Status: **Development only; not uploaded, submitted, or published**
Last updated: 2026-10-10

## Release decision

Version 5.4 is limited to capabilities that can be demonstrated directly in
the extension without a missing customer service. Connected-assistant,
automatic research, MCP, Research Card, and connector-action experiments were
removed from the release surface on October 10, 2026. Git history preserves the
research for a later roadmap and architecture decision, but it is not a 5.4
feature and must not appear in Store copy, screenshots, permissions, settings,
release bundles, or acceptance claims.

No Azure MCP or assistant service was deployed for 5.4.

## Included development scope

- Microsoft Teams, Google Meet, and Zoom Web remain explicit supported
  meeting surfaces.
- Opening the Live Workspace does not automatically enable captions, open the
  attendee panel, or request a Teams transcript. Those actions remain visible
  user choices when the provider supports them.
- The local Evidence Board continues to mark captured captions and export
  source-linked Markdown and provenance JSON.
- The existing reviewed copy/handoff experience for user-selected AI web
  destinations remains separate from the Evidence Board and does not claim an
  automatic assistant round trip.
- DAF-TECH parent branding and the reviewed sphere asset remain.
- Packaged language catalogs remain uncertified AI-assisted previews with
  English fallback and a privacy-preserving correction form.
- Release provenance, Store metadata validation, and the single Azure Store
  publishing control plane remain in force.

## Explicitly excluded

- Send to my assistant.
- Assistant endpoint or native-host enrollment.
- Automatic research or automatic return of cited results.
- CaptionKeep MCP server or Azure MCP deployment.
- Research Cards and live-chat drafts derived from assistant output.
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
returns to a release branch.
