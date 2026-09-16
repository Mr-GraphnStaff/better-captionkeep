# Meeting chat capture: research and open challenges

Product idea (raised 2026-09-16): capture in-meeting chat messages alongside caption transcripts. No competing caption-saver tool appears to do this today. It's a strong complement to Scrubby specifically, since users paste PII/PCI/PHI into chat (account numbers, links, record IDs) at least as often as they'd say it aloud in captions — arguably it's a bigger exposure surface, since pasted text is exact and copy-pasteable downstream.

This is pre-implementation research, not a spec. Same rule as everywhere else in this project: no selector, host pattern, or DOM shape below is implementation-ready. Each platform needs its own sanitized, controlled-meeting fixture (same process used for the Google Meet caption adapter) before any adapter code is written. Treat this as one candidate new "capture type" per platform — likely modeled as a second normalized record stream (`sender`, `text`, `time`) alongside the existing caption stream, reusing the provider-adapter boundary in `docs/PLATFORM-ADAPTERS.md` rather than a parallel system.

## Why chat is a different (and maybe easier) capture problem than captions

Captions are an interim, self-mutating stream — the hard part the Teams/Meet adapters already solve is deduplicating evolving interim text into stable records. Chat messages are typically **already final and discrete** the moment they render — no interim-text problem, no dedup-by-mutation problem. That's a real reason to expect chat capture to be structurally simpler than live captions, even though it's a new provider surface. It should not be assumed simpler for host-scope or panel-detection reasons, though — those challenges carry over.

## Per-platform notes

### Microsoft Teams
Already an in-scope host (`teams.microsoft.com`, `teams.cloud.microsoft`) — no new host-permission problem, unlike Zoom Web. No public DOM reference found for the meeting chat panel's message list; Teams' UI is known (from the existing caption work) to avoid depending on generated/unstable CSS class names, and chat will likely need the same class-independent, role/ARIA-driven parsing approach already proven for captions. Needs its own live controlled-meeting fixture — do not assume the caption panel's selectors or structure transfer.

### Google Meet
**Important finding, not just an implementation detail:** as of a November 2025 Google Workspace update, in-meeting chat in Google Meet is now backed by Google Chat — messages "continue" in Google Chat after the call ends, rather than being purely ephemeral to the meeting. This is a meaningful difference from captions (which are not persisted by Google) and needs a decision before building: are we capturing the in-call chat panel DOM only (consistent with the "read only what's displayed" boundary in `docs/SECURITY-PRIVACY.md`), or could this panel now be a Google Chat surface/iframe with a different origin, different host-permission needs, and different data-retention implications than the current single-origin `meet.google.com` scope assumes? This needs to be confirmed with a live probe before assuming it's just another same-origin panel like the captions region was.

### Zoom (desktop and/or Web)
Zoom's own desktop client has a native "Save Chat" feature that writes a local `.txt` of the full in-meeting chat (including DMs visible to the user), with an account-level "auto-save chat" setting. That's a useful signal that chat is a first-class, well-defined data object in Zoom's own product thinking — but it's a **desktop-client** feature; it is not yet confirmed whether the Zoom Web client (`app.zoom.us/wc/...`) exposes an equivalent in-DOM chat panel with the same fidelity, or whether it's gated behind the same admin settings that gate the Live Transcript side panel discussed in `docs/ZOOM-WEB-CHALLENGES.md`. This should be verified in the same live probe session used to investigate Zoom Web transcripts, not as a separate effort — same host-scope problem (vanity/custom domains) applies here too, since it's the same web client.

## Cross-cutting concerns

- **Scrubby integration**: chat records should flow through the same Scrubby masking path as caption records before any AI handoff — this is arguably the more urgent case, not an afterthought, given users paste exact structured data (account numbers, card numbers) into chat.
- **Privacy-boundary note**: today's `docs/SECURITY-PRIVACY.md` describes the product as reading only "displayed Teams caption and optional attendee DOM content." Adding chat capture is a real expansion of that boundary and should be reflected in an updated security/privacy doc and privacy policy before release, not bolted on silently.
- **DM visibility**: meeting chat often includes private/direct messages visible only to the current user (seen explicitly in the Zoom "Save Chat" behavior above). Capturing "everything visible in the DOM" for chat has different sensitivity than captions, which are inherently public-to-the-room. Worth an explicit product decision: capture only room-wide/public messages, or everything visible including DMs to the user (clearly labeled as such)?

## Suggested next step

Fold chat-capture fixture-gathering into the same controlled-meeting sessions already planned for Google Meet caption UAT and the future Zoom Web probe, rather than running separate sessions — cheaper and keeps findings comparable. Not yet scoped to a specific release milestone; v5 remains Google Meet adapter + Scrubby only (see `docs/RELEASE-5.0.md`).

---
Research compiled 2026-09-16. No source provided DOM/selector-level detail for any of the three platforms' chat panels — confirms this needs the same live-probe-first discipline already established for the Google Meet caption adapter.
