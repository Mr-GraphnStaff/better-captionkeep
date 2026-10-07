# Privacy and Data Boundaries

## AI handoff and Privacy Scrubber

Privacy Scrubber is enabled by default and can mask supported sensitive patterns before copy, export, or an optional AI handoff. The original saved transcript remains unchanged. A scrubbed derivative can still contain sensitive context, and pattern matching is not a compliance guarantee or a replacement for organizational review.

AI handoff is review-first. Better CaptionKeep prepares material inside the extension; it does not place transcript text in a provider URL, paste automatically, or submit for the user. Opening an external AI workspace and transferring reviewed material remain explicit user actions subject to the organization's policy.

## Local caption capture

- Captions visible in the meeting browser are captured locally.
- Local session history stays in browser extension storage.
- Export occurs only when the user invokes or enables an export action.

## Microsoft 365 transcript import

- Microsoft 365 retains the official transcript in the user's tenant after Teams transcription runs.
- Better CaptionKeep reads it through delegated Microsoft Graph permission after interactive sign-in.
- The imported copy is stored locally in the browser as a separate source.
- Better CaptionKeep does not operate a transcript relay or developer-hosted transcript database.

## AI handoff

- AI handoff is user-directed.
- The user reviews the destination and content.
- Privacy scrubbing can create a derivative while preserving the original local source.

## Evidence Actions

Evidence Actions are optional, review-first requests created from captions that
the user explicitly selects in the Evidence Board. Saving a reviewed action
creates only a local job. Nothing leaves the browser until the user chooses
**Send to my assistant**.

- A local bridge uses an administrator-installed native messaging host.
- A remote bridge uses an organization-hosted HTTPS endpoint and OAuth
  authorization code with PKCE. CaptionKeep never asks for a client secret.
- Remote access and refresh tokens live only in browser session storage.
- CaptionKeep sends the sealed action envelope and selected evidence, not the
  full transcript by default. Administrators can require Privacy Scrubber.
- The customer's assistant owns its LLM, research services, and connectors.
  CaptionKeep does not receive those connector credentials.
- Research Cards are assistant-created derivatives. Every claim must cite the
  selected meeting evidence, an organizational source, or an HTTPS public-web
  source. The original transcript remains the authoritative meeting record.
- Retry, status, cancellation, and receipts remain visible in the Evidence
  Board. A stable idempotency key prevents a restart from intentionally
  creating a second action.

Treat captions and assistant output as untrusted content. Review cited sources
and the prepared action before using a customer connector to create or change
records in another system.

## Administrative configuration

Tenant IDs and public client IDs are configuration identifiers, not client secrets. Tokens remain in browser session storage. Passwords, MFA codes, access tokens, refresh tokens, cookies, and client secrets must never be placed in repository files, wiki pages, work items, or support screenshots.

Review the full [security architecture](https://github.com/Mr-GraphnStaff/better-captionkeep/blob/master/docs/SECURITY-ARCHITECTURE.md) and [privacy design](https://github.com/Mr-GraphnStaff/better-captionkeep/blob/master/docs/SECURITY-PRIVACY.md) before enterprise deployment.
