# Better CaptionKeep 6.0 — hands-on QA and acceptance

> **October 16, 2026 — lead scope decision:** BYOMCP is removed from the shipping 6.0 feature set and deferred to a later release. Earlier MCP implementation and acceptance entries below are historical development evidence. Current 6.0 has no MCP connection, native-helper permission, tool-execution interface or helper distribution. Local capture, archive, exports, reviewed BYOAI handoff and historical receipt readability remain. Other release gates remain open.

Prepared October 15, 2026 for David Farris and invited testers.
Scope: the complete shipping 6.0 product with MCP excluded.
Source baseline: record the exact clean candidate commit supplied by the build owner. **Development testing, not a frozen
release candidate or release certification.** Record the actual installed build
below; version `6.0.0` alone does not identify its contents.

## Start here

Start with **Brave + a private Teams test meeting**, a second participant and
made-up meeting content. Run the first-session checks below before the deeper
sections. Repeat the provider journey on Meet and Zoom Web afterward.
Do not install or connect an MCP helper for 6.0 testing.

Do not use confidential workplace meetings, real personal records or production
changes as test material. This document does not authorize an external write,
directory lookup, installation, account grant, Store submission or publication.

### Identify what you are testing

| Field | Fill in for this run |
| --- | --- |
| Tester / date / time zone | |
| Browser name and full version / OS version | |
| Provider / web or Teams PWA | |
| Extension version / ID / actual loaded folder | |
| Source commit and clean/dirty status supplied by build owner | |
| ZIP SHA-256, if using a supplied package | |
| Confirm no MCP helper/native payload is included in the tested package | |
| Clean profile, existing development installation, or real Store upgrade | |
| Relevant policy restrictions / prerequisites missing | |

Use the extension's browser management card to verify the version and loaded
folder. A localhost preview is **not** the installed extension. Do not replace or
remove your ordinary Store installation or real archive to create a test profile.
Ask the build owner for the exact package/folder and identity if uncertain.

For this release qualification, Load unpacked selects the prepared Chromium
UAT build at `P:/Projects/better-captionkeep-dev/dist/uat` (the folder containing
manifest.json). This is the single next Chromium UAT path; the retained
`dist/dev` build is historical testing context, not the next candidate to load.
The prepared UAT source is `0be537813a7eae20a71d5f7781ba64f6f0a2fbcf`;
it remains unfrozen, so confirm current source and artifact identity with the
build owner before testing.
After an agreed rebuild, Reload that extension card and refresh test meeting tabs.
An existing folder may be stale: the build owner must confirm its source identity.
Do not load the older 5.4 checkout. Firefox requires its own browser-target
package at `P:/Projects/better-captionkeep-dev/dist/prod/firefox-unpacked` or
its supplied Firefox ZIP and installation instructions; do not use Chromium
Load unpacked instructions or the Chromium UAT package.

### Record every result

David reported positive UAT 6 results on October 24, 2026 in Brave, Opera,
Firefox and Edge, and identified `P:/Projects/better-captionkeep-dev/dist` as
the build location. Preflight found only `dist/dev` at the time; that suggests
the development build but does not establish the browser's registered folder
or exact package identity. Credit this as positive owner-reported UAT. Browser
versions, providers and cases exercised have not yet been recorded here; the
report does not assign blanket PASS results. Add those details to the run
records when available and retain the original observation.

Use **PASS**, **FAIL**, **BLOCKED** (cannot run: name the prerequisite), or
**NOT RUN**. Every case starts NOT RUN; a checkbox or prior automated result is
not a manual pass. A missing required feature is FAIL; unavailable credentials or
test hardware are BLOCKED. Use N/A only with a recorded, approved scope reason.

Copy this record for each case and browser/provider combination:

```text
Run ID / case ID:
Build / browser / provider:
Result: NOT RUN
Steps actually performed / input:
Expected:
Actual:
Evidence filename or private location:
Severity / GitHub issue / linked Azure work item:
Retested build / result / tester:
```

## First session — begin with these checks

Use this short script so missing words and fabricated answers are recognizable:
participant A: “QA checkpoint alpha. We decided to use a blue test banner.”
Participant B: “I will draft the banner. We have not agreed a deadline.”
Later say “QA checkpoint beta.” During the pause check say “PAUSE-ONLY CHARLIE.”
Do not expect provider speech recognition to be word-perfect; compare preserved
text to the captions actually displayed, including their stable corrections.

| ID | What to do | Expected result |
| --- | --- | --- |
| F01 | On an unrelated page, open the extension. Open Settings using the gear, then return. | Clear waiting/no-meeting state, no active-capture badge. Settings and return controls work; no false success. |
| F02 | Join the test meeting. Before manually enabling captions, observe what the extension does; then speak the script with captions visible. | Live capture is on by default and starts without pressing Keep. If captions cannot be enabled, explain the provider/permission limitation and recovery; never claim capture before available. Record any manual enabling required. No automatic AI submission or provider transcription claim. |
| F03 | Open the popup, use the primary meeting action, then open last live transcript. | Workspace and transcript are reachable, current meeting identity is correct, both speakers' available captions appear. Opening workspace does not disable the popup's controls. |
| F04 | Inspect toolbar, popup and workspace while speaking and during silence. | States agree. Waiting for speech is not “off”; provider transcription status is not confused with local capture. Count reflects retained captions, not invented activity. |
| F05 | Pause Capture in Settings. Say PAUSE-ONLY CHARLIE. Resume, then say beta. | New local capture stops during pause, prior words survive, resume works. The paused-only line is not later silently backfilled into the captured transcript. |
| F06 | Open and close attendee capture controls and workspace; reopen each. Use both any in-app close control and the provider's panel close. | Controls remain operable. A one-way or permanently disabled button is a failure. Provider panels are not repeatedly forced open after deliberate close. |
| F07 | Leave the meeting, remain on its recap/calendar page, then navigate to an unrelated page. Also check with another meeting still active in another tab. | This tab no longer claims active capture. Any remaining capture indication identifies a genuinely active meeting rather than stale state. No captions from the departed session continue appearing. |
| F08 | Pause and rejoin the same meeting; separately create/join a different test meeting and speak a distinct phrase. | Same-meeting pause persistence is observable and respected. A distinct new meeting starts live capture ON by default and can then be paused explicitly. No silent carryover of the previous meeting's pause, captions or derivatives. |
| F09 | Finish the test session; open Meeting Receipts/history, reopen it, then close and restart the browser. | Retained transcript/history survive restart and still identify the correct meeting. No duplicate session or silent loss. |
| F10 | Export TXT and another available format; exercise Save As, cancel once, then save. Open the files. | Expected text and readable speaker attribution; cancellation is recoverable. File type/name/location follow the chosen settings. No false saved confirmation after a failed/canceled download. |

Result of first session: ______. Blocking cases: ______. Evidence: ______.

## Appearance, usability and accessibility

Run these in the actual popup, All Settings, Live Workspace, transcript viewer,
history/Receipt, Moment review and AI handoff/shareable-summary surfaces. Include
empty and populated states, not just the happy-path screenshot.

| ID | What to do | Expected result |
| --- | --- | --- |
| U01 | Inspect the entire popup in waiting, starting, capturing, paused and error states. Capture a sanitized screenshot of each obtainable state. | Elongated-orb shell: visible curved shoulders/base, restrained rim lighting and readable flat controls. Sphere is structural, not merely a round logo in a rectangle. One primary action; Teams/Meet/Zoom and gear remain recognizable. Known sphere drift is an open acceptance item, not an assumed pass. |
| U02 | Use the real popup at normal display scaling, then increased scaling. Resize supported full-page/panel surfaces narrow; inspect long meeting/speaker names. | No clipped essential status, overlapping footer, horizontal page scroll or unreachable actions. Native popup limits respected; any necessary vertical scrolling is obvious and usable. |
| U03 | Select dark, light and system themes; change OS appearance in system mode. Visit every surface. | Fresh default dark; chosen theme consistent, readable text/controls and visible focus. No dark header with unreadable dark text in light mode. |
| U04 | Complete the basic journey with Tab/Shift+Tab/Enter/Space/Escape only. Test page zoom 200% and 400% where supported, OS high contrast/reduced motion and a screen reader. | Logical order, named controls, no traps; dialogs restore focus. Status/errors announced without repeating the entire transcript. Essential content reflows or remains reachable. Record screen reader/version and exact checks; do not infer WCAG conformance. |
| U05 | In a long transcript, scroll up, select older text, search, change views and receive more captions. Use Follow latest. | New captions do not steal selection/focus/scroll. Follow latest resumes deliberately; older available text remains usable beyond the latest 150 captions. Record session length, caption count and any delays. |
| U06 | Try an advertised non-English locale, long Unicode names and RTL content. | Required controls and error messages remain understandable; identifiers/citations retain their meaning. Untranslated or clipped advertised UI is recorded, not waived. |

## Meeting tools and source preservation

Keep a raw export before these cases and compare afterward. Derivatives must not
rewrite the original caption transcript. If a named control cannot be located,
record the screen and FAIL/BLOCKED reason rather than guessing a hidden route.
BYOAI tests require a separately approved destination and synthetic text only.

| ID | What to do | Expected result |
| --- | --- | --- |
| P01 | Capture Moment: preview, cancel, repeat and approve with a note/description; export and delete it. Switch active tabs during preview. | Only intended supported meeting image is retained after approval. Wrong-tab/stale previews cannot be silently accepted. Image stays separate, is described and is never automatically sent. |
| P02 | Generate notes through the reviewed handoff; review/import a supported cited result. Try one made-up citation, then promote a valid decision. | Summary/Decisions/Actions/Risks/Questions remain drafts with real source references. Invalid citation rejected; no invented owner/deadline. Promotion is explicit; raw source unchanged. |
| P03 | Exercise rolling notes: update now, repeat without new text, pause/resume, correct an earlier available caption and restart. Interrupt the optional notes path. | Bounded separate revisions, no duplicate effects, source-aware correction and recoverable history. Caption capture continues if notes fail. Do not assume a background model exists. |
| P04 | In Templates, create, duplicate, edit, select, export, import and delete a synthetic template. Generate twice. | Revision/selection retained correctly; safety envelope cannot be edited away. New result is a separate revision. Malformed/oversized import explains failure without losing prior templates. |
| P05 | Ask “What banner did we choose?” then “What deadline did we agree?” Review supported responses. Try changed/missing citations and switch meetings during review. | Answer cites the original selected snapshot or says it is not established. No invented deadline; no rebinding an old request to another source/meeting. |
| P06 | Mark a decision/follow-up, edit its note, navigate its citation, then unmark/delete. Review any returned Evidence artifact. | Correct source and nearby caption, no cross-meeting association; deletion/review states are clear. External results are not presented as spoken captions. |
| P07 | Use viewer search, speaker filtering, corrected/raw views, local dictionary, Copy All, file types, Print/PDF and History. | Filters are explicit, supported corrections separate, exports contain intended scope. Print/PDF readable; no unexpected internal/private metadata. Links remain navigable. |
| P08 | If enabled, request meeting-chat snapshot and translation. Test unavailable capability; use only synthetic chat. | Chat capture explains loaded-row limits, not full history. Translation is separately labeled; unsupported browser/language has an honest fallback, not silent cloud upload. |
| P09 | Create a shareable summary from explicit excerpts. Review/edit for intended recipients; test confidentiality and privileged label choices; copy/export/print. Edit after review. | Original preserved; edits invalidate review. Default stamp is CONFIDENTIAL — DRAFT — REVIEW REQUIRED; reviewed stamp is CONFIDENTIAL — FOR AUTHORIZED RECIPIENTS ONLY. Recipient review required before copy/export. Privileged label requires explicit legal-guidance confirmation, not an automated determination. No automatic email/AI send or hidden transcript/source metadata in email output. Inspect actual PDF/clipboard contents. |

## MCP exclusion — 6.0 shipping checks

MCP is deferred. Do not install a helper, grant native permission or attempt service sign-in for this release. The [historical MCP cases](../deferred/byomcp/TESTER-ACCEPTANCE.md) remain future work.

| ID | What to do | Expected result |
| --- | --- | --- |
| D01 | Inspect the exact installed 6.0 package manifest and Settings/Live Workspace. | No nativeMessaging permission, MCP setup/connection/catalog/action controls, helper payload or native execution modules. Advanced core settings and reviewed BYOAI handoff remain available. |
| D02 | Open a synthetic archive containing a pre-existing action receipt, then delete it through ordinary controls. | Historical receipt remains readable and removable; no new MCP operation, sign-in or connection is attempted. |
| D03 | Run normal capture/history/export/On the Fly cases on this same build and inspect extension errors. | Core works; no missing-script error or native-helper dependency. Optional helper files, credentials and dormant historical settings are not purged. |

## Failure, privacy, archive and upgrade

Run destructive/storage/policy scenarios only with disposable data/profiles and
a prepared test environment. If you cannot safely simulate them, record BLOCKED.

| ID | What to do | Expected result |
| --- | --- | --- |
| R01 | Reload meeting tab/workspace; close/reopen popup; restart browser during a controlled session. Deny an optional permission/download. | Recoverable status and retained source; no duplicated/mixed meetings or false capture/save success. Core does not depend on optional integrations. |
| R02 | Use synthetic email/phone data with Privacy Scrubber, clipboard/export restrictions and administrator-prepared policy denial. Inspect actual outputs. | Configured transformations apply; policy cannot be bypassed through another surface, MCP or images. No tokens, secrets or private identifiers in diagnostics. Scrubbing is not guaranteed anonymization. |
| R03 | Search/reopen older receipts; delete one disposable source with its associated Moments, Notes, Answers, evidence and pending excerpts; test retention in a prepared profile. | Intended scope clearly confirmed; source and associated retained copies no longer reopen or reappear after restart. Other meetings unaffected. Already exported external files are not claimed deleted. |
| R04 | In a prepared disposable profile, simulate storage-full/write failure and a long meeting. Record duration, caption count, CPU/memory observations and responsiveness. | Visible failure, no false durable-save claim or silent truncation; optional feature failure does not corrupt source. Assess against an agreed budget, not an invented performance threshold. |
| R05 | Upgrade a backed-up supported 5.4 test installation using an approved same-identity upgrade route; verify settings, archives, exports, capture and changed permissions. | Data preserved and permission changes handled honestly. A different-ID unpacked install is NOT upgrade proof. Final real Store-installed upgrade must be verified after authorized availability. Do not uninstall to upgrade. |

## Separate browser/provider results

Enter result + run-record reference in every cell; each starts **NOT RUN**.
Repeat F01–F10 for each cell, and all applicable U/P/D/R cases per browser.
Certification requires all applicable journeys, not merely a passing first session.

| Browser | Teams Web | Google Meet | Zoom Web |
| --- | --- | --- | --- |
| Chrome | NOT RUN | NOT RUN | NOT RUN |
| Edge | NOT RUN | NOT RUN | NOT RUN |
| Brave | NOT RUN | NOT RUN | NOT RUN |
| Firefox | NOT RUN | NOT RUN | NOT RUN |
| Opera | NOT RUN | NOT RUN | NOT RUN |

Record Teams PWA separately in supported Chromium installations, including
minimized/background behavior. Firefox native sidebar requires its own interaction
evidence. A provider/browser access restriction is BLOCKED, not a silent scope cut.
Safari is archived for a later major version and is not a 6.0 target or blocker.

## Report a bug and stop safely

Stop a risky test on wrong resource/meeting, unexpected disclosure, lost source,
duplicate write, unreviewed dispatch or misleading verified success. Preserve
private evidence and do not blindly retry an uncertain external operation.

Report case ID, build/browser/provider, exact steps, expected/actual behavior,
frequency, impact and sanitized screenshot/log. Use Critical for catastrophic
loss/disclosure; High for blocked core workflow or dangerous false success;
Medium for substantial workaround; Low for limited polish. Severity is not
scheduling priority. Confirmed defects belong in GitHub (search existing issues
first) and must link to Azure Boards; security-sensitive details go through the
private security channel, never public credentials or real meeting content.
Team lead/coordinator handles tracker entry if tester lacks access.

## Acceptance summary and sign-off

- PASS / FAIL / BLOCKED / NOT RUN counts: ______
- Open defects, severity and retest evidence: ______
- Developer coaching required / confusing steps: ______
- Browsers/providers actually exercised: ______
- Recommendation: not ready / ready for more development QA / ready for candidate acceptance: ______
- Tester / date / exact build identity: ______

This packet covers the sixteen [roadmap gates](../ROADMAP-6.0.md): F/U cover
1–3, P/R source checks cover 4–9, browser matrix covers 10/12, U/R/D cover 11,
D01–D03 cover the gate 15 no-MCP boundary, and P09 covers 16. Gates 13/14 additionally require release-owner
evidence: clean frozen artifact/hash/provenance, final matching artwork/copy,
extension SBOM, manifest permission delta, unchanged 48-hour window,
authorized submission/approval, public parity and real installed upgrade.
Gate 10 also requires owner evidence for stable capability IDs and one package
per browser without paid feature tiers; the browser matrix alone cannot prove it.
Inherited CAP, multilingual and Evidence Actions commitments remain in the
[release acceptance matrix](RELEASE-ACCEPTANCE-6.0.md); this practical packet does
not waive them. Dated implementation comments in older audits are not current
test results. Consult the [execution ledger](EXECUTION-6.0.md) for later changes.
No release approval follows from green automated tests or this document's creation.
