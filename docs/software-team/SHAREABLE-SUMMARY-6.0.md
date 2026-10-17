# Reviewed shareable summary — 6.0 acceptance

Lead decision: October 14, 2026. Required 6.0 scope. This is a new product capability, not a certification that an AI or a label establishes privilege. No real work transcript is used in development or public evidence.

Tracking: public feature [#151](https://github.com/Mr-GraphnStaff/better-captionkeep/issues/151), Azure Boards Task #347 under Feature #336; independent policy findings [#152](https://github.com/Mr-GraphnStaff/better-captionkeep/issues/152) and [#153](https://github.com/Mr-GraphnStaff/better-captionkeep/issues/153) remain open pending applicable acceptance.

## Journey

Transcript viewer → More transcript tools → Prepare shareable summary. The original remains unchanged. All source excerpts start unselected. The user selects authorized material and can prepare/copy a bounded prompt for their organization-approved AI destination, or write a draft manually. No model is called, no email is sent and no MCP action is launched by this workflow. The tool cannot automatically determine privilege or guarantee adequate exclusions.

The draft is independently editable. Only the summary and selected handling label enter copy/TXT/Print-PDF output. Source IDs, transcript links, source title, attendee reports, omitted material and internal review flags are not automatically included. Users must not paste the internal-review section of an AI response into the email draft. Sensitive material typed by the user still requires human review; the product does not promise it can recognize and remove all privileged substance.

## Labels and release checks

- Default preview: `CONFIDENTIAL — DRAFT — REVIEW REQUIRED`.
- Reviewed confidential output: `CONFIDENTIAL — FOR AUTHORIZED RECIPIENTS ONLY`.
- Optional privileged output: `ATTORNEY–CLIENT PRIVILEGED — CONFIDENTIAL — FOR AUTHORIZED RECIPIENTS ONLY`, requiring an explicit designation and separate legal-guidance confirmation. Never assign it automatically from attorney names, keywords, source labels or AI output.
- Require a nonempty draft and explicit review for intended recipients. Changing source selection, draft text, label or legal-guidance confirmation invalidates review. Recheck policy and source identity/revision before release.
- If the source disappears, changes identity/content, or managed policy cannot be read, fail closed. Do not silently rebind the draft to another meeting.
- Source and policy are checked again across the asynchronous release sequence, with delivered storage-change events invalidating approval. Browser APIs do not provide an atomic transaction across live meeting DOM and managed policy. These checks are best-effort observations, not a guarantee against a change after the last observation or recipient redistribution.
- Respect disableClipboard, disableFileExport, disableEvidenceEmail, disableAiHandoff and required scrubbing. Policy checks must be fresh at each applicable output action; managed denial overrides local choices.
- Browser Print/PDF output must never reveal hidden source controls, restricted transcript excerpts or internal UI. Unreviewed keyboard printing must be blank or blocked. Labels must remain visible in the printable document; verify pagination rather than promising platform-specific header behavior.
- No new automatic persistence, network endpoints, permissions or telemetry. In-page draft is lost when closed/reloaded; raw transcript stays governed by existing retention/hold procedures. No automatic original deletion.

## Verification

Module tests: default/explicit labels, review gates, hostile/invalid fields, no automatic privilege inference, no silent truncation, explicitly selected prompt material only, immutable originals and no source metadata in default output.

UI tests: accessible controls, light/dark and narrow layout, selection/edit/label invalidation, fresh source/policy denial, successful clipboard/TXT/print with synthetic content, no output when source deleted/switched, and no source text in browser print. Independent review plus five-browser live acceptance remain required before release. This document initially records requirements, not a completed test result.

## Local verification — October 14, 2026

Nineteen focused module/UI/independent-review tests pass, including actual Chrome rendering at 300px in CaptionKeep dark and light themes, summary-only clipboard output, blank unreviewed browser printing, hidden source controls in print media, and labelled explicit-print content. Long source lists render in yielding batches with a 251-caption completeness regression. Independent tests reproduced policy absence and asynchronous policy/source changes before repair and pass on the repaired source. The full integrated suite passed 449 tests with zero failures/skips. Lint, the expanded eight-page surface audit, release-state validation and development build passed.

Synthetic screenshots are in ignored `output/qa/shareable-review-300-captionkeep.png` and `shareable-review-300-light.png`. Real print-dialog/PDF pagination, native downloads, assistive technology and all five installed provider/browser combinations are not certified by these fixtures. This addition is local development work, not a published feature or legal approval.
