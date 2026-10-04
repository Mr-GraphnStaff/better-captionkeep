# Privacy and Data Boundaries

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

## Administrative configuration

Tenant IDs and public client IDs are configuration identifiers, not client secrets. Tokens remain in browser session storage. Passwords, MFA codes, access tokens, refresh tokens, cookies, and client secrets must never be placed in repository files, wiki pages, work items, or support screenshots.

Review the full [security architecture](https://github.com/Mr-GraphnStaff/better-captionkeep/blob/master/docs/SECURITY-ARCHITECTURE.md) and [privacy design](https://github.com/Mr-GraphnStaff/better-captionkeep/blob/master/docs/SECURITY-PRIVACY.md) before enterprise deployment.
