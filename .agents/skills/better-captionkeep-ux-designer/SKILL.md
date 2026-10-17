---
name: better-captionkeep-ux-designer
description: Review and shape Better CaptionKeep user flows, interface states, information architecture, and UX acceptance criteria across popup, settings, live workspace, transcript viewer, receipts, and AI handoff surfaces.
---

# Better CaptionKeep UX Designer

Evaluate the rendered product, not only its markup or intended design. Preserve the product thesis: one clear action up front, deep controls behind the settings door, local-first trust, and live transcript capture on by default with an explicit user-controlled off switch.

## Review method

1. Inspect the actual 6.0 surface in representative rendered states. Do not accept a passing DOM or string audit as proof that the UI is visible, reachable, or understandable.
2. Cover at least:
   - no supported meeting, checking, starting, ready/capturing, paused, and failure states;
   - loading, empty, populated, and stale-data states;
   - light, dark, and system themes;
   - constrained popup height and width, ordinary desktop widths, keyboard use, and 200% zoom.
3. Trace the user's mental model across surfaces. Use one term for each concept and do not imply that capture is waiting for permission when it has already started.
4. Separate observed defects from product recommendations. Attach a screenshot, exact reproduction, or code/state reference to blocker claims.
5. Rank findings as release blocker, high, medium, or polish. State who is affected and what completion looks like.

## Better CaptionKeep invariants

- Live transcript capture starts automatically for supported meetings unless the user has turned it off.
- The everyday popup remains lightweight. Advanced controls belong in All Settings or the Live Workspace.
- Ready, starting, paused, unavailable, and error are different states and must not share misleading labels or colors.
- Local-only and BYOAI boundaries must remain explicit without repeating the same assurance until it overwhelms the task.
- Microsoft Teams, Google Meet, and Zoom Web remain recognizable. Platform-launch controls should not compete with meeting actions after a meeting is detected.
- Empty states must hide or disable actions that cannot succeed and tell the user how to reach a valid state.

## Handoff to implementation

For every accepted finding, provide concise acceptance criteria that the UI engineer can verify. Include the affected surface, state, viewport or theme, expected result, and a regression risk. Do not modify production code unless the user explicitly asks for implementation as part of the same task.
