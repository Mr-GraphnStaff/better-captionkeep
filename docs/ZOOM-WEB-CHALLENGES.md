# Zoom Web transcript capture: research and open challenges

Scope note: this is about capturing displayed caption/transcript text only, the same boundary already used for Teams and Google Meet. It is not about capturing video or audio. Zoom's web client renders meeting video to a `<canvas>` element via WebAssembly decoders, but that pipeline is unrelated to whether caption/transcript text exists as real DOM text — it does not block this feature, but it must still be confirmed directly rather than assumed (see "Unknowns that need a live probe" below).

No selectors, host patterns, or DOM assumptions below should be treated as implementation-ready. Per the existing project rule in `docs/PLATFORM-ADAPTERS.md` ("Do not invent selectors from third-party examples or documentation"), a Zoom Web adapter needs the same sanitized, controlled-meeting fixture process already used for Google Meet before any selector is committed.

## 1. Host scope has no single clean answer (the big one)

Teams shipped with two exact hosts. Google Meet shipped with one exact host (`meet.google.com`). Zoom does not have an equivalent fixed surface:

- The base web client lives at `app.zoom.us/wc/...`, but join links are also seen as `zoom.us/j/...` (desktop-first, redirects) and `zoom.us/wc/join/...` (web-first).
- Business+ accounts commonly use a **vanity subdomain** (e.g. `acmecorp.zoom.us`) for SSO/branding, and meeting links resolve there instead of `zoom.us`.
- Zoom officially supports approved vanity subdomains beneath `zoom.us` (for example, `acmecorp.zoom.us`). No arbitrary custom-domain meeting host should be assumed without direct tenant evidence.

A fixed per-customer host allowlist doesn't scale, and a broad `*://*.zoom.us/*` host permission conflicts with the project's existing minimal-permission stance (`docs/SECURITY-PRIVACY.md` limits host access to two exact Teams hosts today). This needs a product decision, not just an engineering one: either accept a broader wildcard grant with the Store-review and user-trust cost that implies, support an admin-configurable list of verified `zoom.us` vanity hosts through `managed-schema.json`, or limit the initial release to explicitly tested Zoom hosts.

## 2. Browser join is opt-in per account/meeting, not guaranteed

As of February 2026, "Join from your browser" is enabled by default only for accounts whose setting was previously *unlocked*; organizations that had explicitly locked it disabled remain disabled. Meaning: for a meaningful slice of enterprise tenants — the exact audience v5 is targeting — Zoom Web may not be offered at all unless an admin opts in. This affects the addressable market story for this feature and is worth flagging before committing engineering time.

## 3. Two different capture surfaces, not one

Zoom exposes caption content in at least two distinct UI forms, and it's not yet confirmed which (or both) are viable capture targets:

- **Subtitle overlay**: captions burned into the bottom of the video frame, ephemeral, no visible history.
- **Live Transcript side panel**: a persistent panel with full text history, timestamps, and speaker names — structurally the closer match to what Teams/Meet capture already normalize into (`Name`, `Text`, `Time`).

The side panel is presumably the better target (closer to existing normalized record shape), but this needs a live probe to confirm it's real DOM text and not, e.g., rendered into an iframe from a separate origin (which would need its own host permission and content-script injection rules).

Separately, the side panel is **admin/host-gated**: an account setting ("Enable live transcription service to show transcript on the side panel in-meeting") must be turned on. Unlike Meet's captions (a participant-facing toggle we can detect and prompt for), this may be entirely outside a participant's control and not something the extension can auto-enable the way it does for Google Meet captions today.

## 4. No public documentation of the actual DOM structure

Unlike some competitor products, there's no accessible technical reference for the Live Transcript panel's markup, ARIA roles, or class stability. Existing forum/support content covers *how to turn it on*, not its DOM shape. This means the same fixture-first workflow used for Google Meet is mandatory here: a controlled test meeting, a sanitized diagnostic capture (element structure/roles only, no identifying text — same discipline as `get_google_meet_diagnostic`), committed as a fixture before any selector is written.

## 5. Data-handling / ToS surface worth a compliance pass

Given v5's enterprise pivot is explicitly about PII/PCI/HIPAA handling (Scrubby), it's worth having compliance/legal sanity-check Zoom's current terms around "Service Generated Data" and AI training licenses before this ships, specifically for enterprise/regulated customers who may already have their own DPA with Zoom. This doesn't block engineering work but should happen before a public release announcement, the same way Scrubby's docs are explicit about its limits (`docs/SECURITY-PRIVACY.md`: "does not... prove HIPAA/PCI DSS/GDPR compliance").

## Unknowns that need a live probe (do not assume)

- Is the Live Transcript side panel real DOM text, or projected/shadow-DOM/iframe content?
- Is it same-origin with the meeting page, or does the web client load it from a different Zoom origin?
- What triggers panel mount/unmount — is it stable across reconnects, screen-share, or view changes, the way Meet's caption remount edge case (still open in `docs/RELEASE-5.0.md`) had to be handled?
- Does the overlay-only case (side panel disabled by admin) leave any capturable DOM text at all, or is it truly video-frame-burned and out of reach?
- Exact set of vanity/custom-domain patterns worth supporting for launch vs. deferring.

## Suggested next step

Treat this the same way the Google Meet adapter started: a controlled test meeting (with Live Transcript panel enabled by an account you control) to capture a sanitized diagnostic fixture, before writing any adapter code or committing to a host-permission strategy.

---
Research compiled 2026-09-16. Sources consulted include Zoom support/help articles, Zoom developer docs/forum, and general reporting on Zoom's 2026 web client and ToS changes — no source provided a canonical DOM reference, which is itself the main finding in section 4.
