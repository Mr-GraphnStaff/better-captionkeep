# Better CaptionKeep 5.3 — Verified Teams Transcript

**Official words. Verifiable source. Still your data.**

Better CaptionKeep 5.3 turns an authorized Microsoft Teams transcript into a private, reviewable local record without adding a meeting bot or routing the conversation through a developer-operated service.

It also consolidates the complete long-meeting BYOAI handoff, durable local archive and cross-session search, reversible corrections and terminology dictionary, managed DOCX export, enterprise controls, and Intune deployment groundwork into this one next-release line.

October 3 source additions include an All settings tab, per-export formats, Print / PDF, local prompt templates, reviewed loaded-chat/shared-link snapshots and screenshot extras, and feature-detected on-device translation with incremental visible-caption support. Every shipped feature is available to every user without payment, activation, subscription, or feature tiers; managed policy and provider authorization are still enforced. Cloud transports for Google Docs and Microsoft storage have mocked tests, not completed sign-in or live upload validation. These changes are not promoted until live browser UAT, privacy review and release gates pass.

## The headline experience

- Open Better CaptionKeep during a Teams meeting and use the meeting already in front of you.
- After connecting Microsoft 365, choose from up to five recent eligible Teams meetings.
- If a meeting is not listed, paste its Teams join link through the manual fallback.
- Import the latest official transcript Microsoft authorizes the signed-in user to access.
- Review the readable transcript with a clear Microsoft Graph source label.
- Preserve the original raw transcript, attribution state, retrieval time, and cryptographic hashes as separate local provenance.

## Built for trust

- Organizational administrators explicitly enable the feature and approve its delegated permissions.
- `Calendars.ReadBasic` supplies only the event subject, time, organizer flag, and Teams join information used by the recent-meeting selector.
- Recent calendar results disappear with the popup and never enter saved history, sync, exports, or developer logs.
- Authentication uses authorization code with PKCE. No client secret, tenant password, certificate private key, meeting bot, or application-only credential is packaged in the extension.
- Access and refresh tokens live only in browser session storage and are cleared on disconnect, browser-session loss, or rejected access.
- The user explicitly chooses every transcript import. Better CaptionKeep does not crawl the tenant or automatically collect transcripts.
- Deleting an imported session deletes both the readable transcript and its retained raw source artifact.

## Clear recovery states

The 5.3 interface distinguishes sign-in cancellation, expired or revoked access, missing transcripts, unauthorized meetings, disabled tenant transcript access, and invalid meeting links. Speaker attribution follows tenant policy; when Microsoft denies attributed content but permits unattributed content, Better CaptionKeep imports and labels the unattributed source without inventing speaker names.

## Availability

Version 5.3 remains an unreleased candidate until the exact Chrome and Edge packages complete tenant consent validation, live recent-meeting and transcript-import UAT, negative-case testing, independent review, and the unchanged release-candidate window. A successful source build does not authorize Store upload, publication, or tenant-wide rollout.
