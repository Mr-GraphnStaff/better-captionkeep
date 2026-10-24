# Privacy and Data Boundaries

Better CaptionKeep 6.0 preserves the original caption transcript as its source. Notes, answers, Moments, markers, corrections and shareable summaries are separate derivatives. This describes product boundaries; it is not certification of an adopter's legal compliance.

## Local caption capture

- Captions displayed on supported meeting pages are captured locally; microphone audio and video are not recorded.
- Local history and recovery data use browser extension storage according to user and managed retention settings.
- Capture starts on by default for supported meetings and can be paused explicitly.
- No Better CaptionKeep account or publisher transcript-hosting service is required for local Core behavior.
- Exports, clipboard contents and externally shared files have their own destinations and lifetimes; deleting local history does not retract an exported copy.

## Review before sharing

Privacy Scrubber can mask supported patterns before copy/export or optional AI handoff without changing saved source captions. Scrubbed text can still reveal sensitive context. Images are not automatically anonymized; preview and approve a Capture Moment before local retention. Managed restrictions can disable these actions and override optional allowances.

AI handoff is user-directed. On the Fly can prepare/copy a bounded prompt and open the saved destination; Better CaptionKeep does not paste or submit it automatically and does not put transcript text in an AI-provider URL. Review the destination and content before acting. Using an external AI workspace follows that service's and your organization's policies.

When explicitly chosen, an Email action can place a cleaned draft in the selected compose URL or mail-handler request. Recipients remain blank, and Better CaptionKeep does not send it. This is distinct from the separate shareable-summary workspace.

## Reviewed summaries and cited derivatives

Notes and Ask retain source references and remain separate from raw captions. Check citations and uncertainty before keeping a result. Rolling notes are bounded local extractive updates, not an automatically connected external AI service.

Shareable summaries use explicit source selection, an editable draft, recipient review and confidentiality labels. Source/draft changes invalidate review. Labels do not guarantee confidentiality, safe disclosure or attorney-client privilege; the privileged designation requires explicit organizational legal guidance.

## Microsoft 365 import

Microsoft 365 retains an official Teams transcript in the organization's tenant when transcription runs. After customer-owned tenant/app setup and interactive sign-in, delegated Microsoft Graph permissions allow retrieval of the authorized transcript the user selects. Its imported copy is a separate local source. Microsoft and tenant policy determine access; Better CaptionKeep does not operate a transcript relay.

Tenant IDs and public client IDs are configuration identifiers, not client secrets. Authentication tokens remain in browser session storage. Never put credentials, tokens, cookies, private meeting data or client secrets in source, Wiki pages, work items or support screenshots.

## Deferred capabilities and distribution

Shipping 6.0 excludes MCP connections, native-helper payloads and external tool execution. Historical receipts remain readable/deletable without starting a new operation. Safari is deferred. No automatic upload or external action is implied by an Evidence marker or reviewed answer.

For current candidate identity, freeze, acceptance exceptions and distribution evidence, use [Release status](Release-Status) and the [machine release record](https://github.com/Mr-GraphnStaff/better-captionkeep/blob/release/6.0/docs/release-state/6.0.json). An owner publication exception does not turn incomplete checks into passes. Dated 5.4 Store evidence and historical incidents remain valid records after local folder archival.

Read the [security architecture](https://github.com/Mr-GraphnStaff/better-captionkeep/blob/codex/6.0/docs/SECURITY-ARCHITECTURE.md), [privacy design](https://github.com/Mr-GraphnStaff/better-captionkeep/blob/codex/6.0/docs/SECURITY-PRIVACY.md), and [Release status](Release-Status) before enterprise deployment.
