# Better CaptionKeep 5.0

Better CaptionKeep 5.0 adds live Google Meet caption capture while carrying forward the complete Teams reliability, local export, transcript history, Scrubby, theme, managed-policy, and review-first AI-handoff work from the retired 4.7 candidate.

## Highlights

- Captures displayed captions and speaker names from Google Meet through an isolated provider adapter.
- Automatically requests Meet captions once per meeting when automatic captions are enabled, while respecting a later manual shutoff.
- Updates evolving Meet caption text in place and avoids duplicate records across interim DOM changes.
- Preserves active Meet captions through caption-panel remounts and restores a recent checkpoint only for the same meeting page.
- Keeps Microsoft Teams capture as the established baseline on both official Teams web hosts.
- Exports TXT or Markdown through Save As, a remembered direct folder where supported, or the browser Downloads flow.
- Stores up to ten transcript sessions locally and provides viewer search, speaker filtering, copy, export, and history controls.
- Adds local Privacy Scrubber output for common sensitive patterns, optional profanity, and custom terms without overwriting the saved original.
- Adds CaptionKeep, Light, Midnight, and Follow system themes across extension pages.
- Provides review-first AI handoffs without placing transcript text in navigation URLs or submitting it automatically.
- Supports managed browser policy for selected privacy, AI, destination, and masking controls.

## Privacy and compatibility

Caption capture is local to the extension and reads text already rendered by the supported meeting page. Better CaptionKeep does not record microphone audio or video and does not operate a developer-hosted transcript service. Meeting interfaces can change without notice, and browser or PWA suspension can still create transcript gaps. Scrubby reduces accidental disclosure risk but does not guarantee regulatory compliance.

Zoom capture is not included in 5.0 and remains a future provider target.
