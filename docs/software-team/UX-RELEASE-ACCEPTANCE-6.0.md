# 6.0 release-wide UX acceptance

Assessment date: 2026-10-14. Working development, not release approval.
Scope: the complete [6.0 roadmap](../ROADMAP-6.0.md), including the lightweight
front door and powerful back door. No feature is removed or waived here.

## Highest launch risks

1. **Live end-to-end acceptance remains open on all six browsers.** Synthetic
   rendering cannot establish that meeting entry, pause, departure, recovery,
   export, and rejoin work together in real provider pages. Run the journeys
   below separately in Chrome, Edge, Brave, Firefox, Opera, and Safari/macOS.
2. **Manual accessibility acceptance is incomplete.** Native controls, contrast
   checks, static audits, and keyboard fixtures are useful evidence, not a
   screen-reader or WCAG conformance statement. Test the entire product with
   keyboard, zoom, and assistive technology on the frozen package.
3. **Store artwork must match the frozen product.** `store-assets/6.0/source.html`
   draws its own presentation, including older popup labels/arrangement; the
   dated manifest has pending owner approval. Regenerating those PNGs alone
   does not prove product fidelity. Compare every frame with actual packaged
   runtime captures and correct discrepancies before approval.

## Evidence boundary

The final reading-first iteration has 26 passing focused actual-function and
workflow regressions, plus an executed Chrome rendered test, independently
repeated by QA. Tests cover source-bound reviewed answers, template versions,
draft separation, selected-caption policy races, source loss, native archive
focus, contextual keyboard actions, chronology, focused-row survival beyond
150 captions, highlighted-word persistence, and populated 300/400/1280 px fit.
See `tests/advanced-ui-rendered.test.cjs`, `tests/reading-first-selection.test.cjs`,
and `tests/advanced-ui-workflows.test.cjs`. These use synthetic content and API
fixtures, not live-provider sessions. Root owns the current full pipeline result;
do not copy a test count from this document into a later release declaration.

Synthetic runtime images are under `output/qa/workspace-reading-first-*.png`.
They are product evidence, not approved Store assets. No private meeting content
belongs in test fixtures, public issues, or marketing screenshots.

## Surface acceptance inventory

| Surface | Automated/static evidence | Required hands-on acceptance and next action |
| --- | --- | --- |
| Popup (`popup.html`, `popup-v6.css`) | Width/state checks; shared theme tokens; actual packaged renderer gate | Exercise no meeting, starting, capturing, paused, disconnected, permission denied, recovery, and saved history. One clear primary action; sphere and toolbar agree; gear/launchers/last transcript accessible at 200% zoom. |
| All Settings (`popup.html?view=settings`; `settings.html` routes there) | Settings visibility and theme checks; configuration/policy tests | Keyboard through every section and return to front door. Verify managed denial clearly explains disabled controls; no hidden/unreachable features; advanced settings never unexpectedly start a meeting source. |
| Live workspace (`sidepanel.html`) | Reading-first Chrome checks above | Real caption stream plus >150 captions while reading/selecting. Follow latest resumes deliberately; arrows/Enter/Space and shared actions work; tab order follows Transcript, Notes, Moments, Evidence, Templates, Ask. Validate Firefox native sidebar and Safari extension-tab fallback. |
| Transcript/Receipt viewer (`viewer.html`) | Rendered viewer and native archive focus checks | Search/speaker filters/correction dictionary, raw vs corrected view, history, delete, scrubbed output, print/PDF, translate, save and return. Keyboard and screen reader must identify active filters and archive dialog. |
| Export (`export.html`) | Static surface audit plus export/privacy tests | Each offered format and save-location behavior; cancel/download failure; long text and Unicode; verify scrub setting and actual downloaded content. Printing is a separate visual acceptance task. |
| Reviewed AI handoff (`handoff.html`) | Safety-envelope and provenance tests; rendered surface check | Edited prompt, copy chunks, evidence export, discard, workspace selection, empty/expired source and managed denial. Explain that external AI receives data only through an explicit user action and generated prose remains a draft requiring review. |
| Capture Moment review (`extras.html`) | Rendered approval/PNG/managed-denial tests | Actual screen preview matches intended tab; approve/cancel/note/alt text/export/delete. Image stays separate from transcript; inaccessible image described; no automatic sending. |
| Provider guidance (`platform-coming-soon.html`) | Static surface audit | Every platform launcher lands in current accurate guidance or a supported provider. Zoom desktop is not Zoom Web; no false browser/provider availability claim. |

## Full product journeys: do not certify by screenshot alone

Record browser/version/OS, candidate commit/package SHA-256, expected result,
actual result, and sanitized evidence for each row. A missing prerequisite is
**blocked/not tested**, never pass. Use controlled synthetic meetings.

| Journey | Observable acceptance |
| --- | --- |
| First meeting | Open a supported provider; automatic local capture starts when displayed captions are available, without confusing local capture with provider-owned transcription. Clear recovery guidance if unavailable. |
| Keep/finish/open | Primary popup action opens the live workspace during capture; completed local Receipt and quiet last-transcript action retain all captured source words. |
| Pause/resume/rejoin | Explicit pause stops new local capture; prior text survives. Leaving while paused and joining another meeting creates a distinct source. Toolbar never claims active capture on unrelated pages. |
| Failure/recovery | Reload, worker suspension, source disappearance, denied storage/download, and interrupted save produce useful persistent feedback. Recovery preserves source identity and does not mix meetings. |
| Live Notes | Generate reviewed Summary/Decisions/Actions/Risks/Questions; reject invented citations/owners/dates; promote only reviewed evidence; raw source unchanged. |
| Rolling Notes | Pause/update/resume, earlier-caption correction, repeated updates, restart, and retry exhaustion preserve bounded/idempotent revision history. Capture continues independently of notes failures. |
| Templates | Create/duplicate/edit/select/import/export/delete; version snapshot retained in derivatives; rollback imports cannot masquerade as old versions; overflow is explained, not silently dropped. |
| Ask | Answer binds to original question/source snapshot, not newer captions or another meeting. Exact unsupported-answer result allowed; invented citations rejected. |
| Moments/Evidence | Review PNG before retaining, attach optional description/note, export/delete, follow exact nearby citations. Mark/unmark/delete and reviewed promotion retain source lineage. |
| Privacy/enterprise | Scrub actual outputs; managed denial overrides optional allowance. Local Core works without identity/license services. Tenant sign-in/import requires its own authorized test environment and is not covered by local synthetic render evidence. |
| Archive/delete/upgrade | Search and reopen older Receipts; delete source and associated excerpts/snapshots. Upgrade existing installation preserving supported preferences/archive; record real distribution-channel result. |
| Appearance/language | Default dark DAF sphere stays consistent; light/system/slate/high-contrast and OS theme change remain readable. Long names/Unicode/RTL and translated copy do not overflow or reverse citation meaning. |

## Manual accessibility and localization checklist

- Keyboard-only traversal on every surface: visible focus, logical order,
  no trap outside a genuine modal, Escape and opener focus restoration.
- Screen reader: Windows NVDA with a supported browser and macOS VoiceOver
  with Safari. Verify tab names/states, transcript navigation, polite status
  updates, errors, counts, modal boundaries, labels and Moment descriptions.
- 200% and 400% zoom, narrow viewport, OS high contrast and reduced motion;
  no essential clipped text or unreachable contextual action. Do not assume
  a 300 px fixture establishes all zoom/reflow requirements.
- Locale files exist, but newer workspace/handoff copy includes hardcoded
  English. Inventory untranslated strings before claiming full localization;
  obtain language-owner review for advertised locales and check RTL behavior.
- Avoid announcing the entire transcript on every poll. Check actual assistive
  output rather than inferring it from ARIA attributes.

## Artwork/copy approval gate

After source freeze, regenerate hashes/manifest and compare real product captures
to all five feature images and both promotional tiles. Keep synthetic content,
DAF sphere, dark default and calm front door. Verify current action labels,
Notes/Ask review boundaries, provider names, Zoom Web scope, no account/cloud
claim qualifications, privacy policy, and version 6.0 in every channel. Do not
claim six certified browsers until their independent records pass. The owner
must approve artwork/copy; automation must not invent that approval.

Next: execute the matrix, resolve every failure through a public sanitized
issue, then attach exact candidate evidence to the release gate. Mac tester
instructions are in [MAC-TEST-HANDOFF-6.0.md](MAC-TEST-HANDOFF-6.0.md).
