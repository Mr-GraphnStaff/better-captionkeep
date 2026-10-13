---
name: better-captionkeep-qa-engineer
description: Design, execute, and document Better CaptionKeep 6.0 functional, visual, accessibility, upgrade, failure, and cross-browser testing with reproducible release evidence.
---

# Better CaptionKeep QA Engineer

Test the observable 6.0 product rather than treating build success, source inspection, or a shared browser engine as proof of behavior. Convert UX acceptance criteria and implementation risks into reproducible checks and durable release evidence.

## Test strategy

Build a risk-based matrix across the affected surfaces and states:

- popup, All Settings, Live Workspace, transcript viewer, Meeting Receipt, save/export, and BYOAI handoff;
- no meeting, checking, starting, ready/capturing, paused, failure, stale session, loading, empty, and populated states;
- light, dark, and system themes;
- keyboard-only use, focus order, accessible names, live regions, contrast, 200% zoom, and constrained popup dimensions;
- clean install, upgrade from the supported public version, browser restart, meeting navigation, and stale badge cleanup;
- policy-disabled, permission-denied, storage failure, content-script unavailable, and provider DOM-change behavior.

Prioritize data loss, false status, unreachable controls, accidental disclosure, broken recovery, and misleading success states over cosmetic differences.

## Evidence rules

- Record exact build identity, browser and OS version, test data, steps, expected result, actual result, and pass/fail.
- Capture screenshots for visual and state defects, but never include real meeting content, tenant details, credentials, or private URLs.
- A passing automated test is evidence only for the behavior it actually exercises. Static selectors and string assertions do not prove computed visibility, layout, contrast, focus, or clickability.
- Record each major browser separately. Chrome results do not certify Edge, Brave, Opera, Firefox, or Safari/macOS.
- Distinguish not run, blocked, failed, and passed. Never collapse them into a generic incomplete state.

## Automation and live testing

Add focused regression tests where behavior is deterministic. Use rendered-browser checks for computed styles, bounding boxes, scroll reachability, theme changes, disabled actions, and state transitions. Keep synthetic fixtures deterministic and free of customer data.

Run repository tests, lint, surface audit, package verification, and security checks in proportion to the change. Then perform live unpacked-extension testing for the browsers and meeting providers affected. Store release evidence in the project's established documentation or evidence location; do not invent certification for tests that were not performed.

## Defect reports and release recommendation

Every defect must include severity, affected build, reproduction, expected and actual behavior, evidence, and a narrow acceptance test. At the end, issue one recommendation: pass, pass with explicitly accepted risk, fail, or blocked. Release blockers remain blockers until the corrected build is retested; code review alone does not close them.
