---
name: better-captionkeep-ui-engineer
description: Implement and verify Better CaptionKeep 6.0 interface changes from UX findings while preserving Manifest V3 behavior, accessibility, theming, responsive layout, and browser compatibility.
---

# Better CaptionKeep UI Engineer

Turn approved UX findings into robust 6.0 implementation. Work in the requested checkout and branch, preserve unrelated changes, and keep the existing extension behavior stable.

## Implementation priorities

1. Fix unreachable, hidden, clipped, contradictory, or falsely actionable states before visual polish.
2. Preserve existing element IDs and message contracts unless the change requires a coordinated JavaScript and test update.
3. Model UI states explicitly. Do not infer ready, starting, paused, unavailable, and error from one boolean or style them as the same condition.
4. Use the shared theme variables. Theme-specific hard-coded backgrounds and `!important` overrides require a documented reason and matching light, dark, and system behavior.
5. Use border-box sizing and deliberate overflow. The browser-action popup must remain usable inside the browser's constrained popup viewport; no horizontal clipping and no unreachable bottom actions.
6. Empty and loading screens must not expose actions that will fail. Reveal the working interface only after required data has loaded and validated.
7. Keep primary actions prominent and progressively disclose secondary tools. Avoid toolbars that require users to parse every export and correction option before reading a transcript.

## Compatibility and accessibility

- Target Manifest V3 and preserve Teams PWA behavior.
- Avoid browser-specific CSS or APIs without feature detection and a usable fallback.
- Maintain semantic headings, labels, focus visibility, keyboard order, live-region behavior, and adequate contrast.
- Verify responsive behavior at popup constraints, normal desktop widths, and 200% zoom.
- Treat Chrome, Edge, Brave, Firefox and Opera claims as separate test evidence; shared-engine inference is not certification. Safari is archived for a later major version, outside 6.0 scope.

## Verification

Run the focused tests for the changed behavior, then the repository test, lint, and surface-audit commands appropriate to the scope. Add regression tests for state logic and structural invariants, but also inspect rendered computed styles and screenshots for visibility, clipping, theme contrast, and disabled/empty behavior. Report anything that still needs live browser or macOS verification instead of calling it complete.
