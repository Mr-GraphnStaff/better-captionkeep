# Better CaptionKeep 6.0 Product and Release Roadmap

## North star

Version 6.0 is the full product step, not a reskin. The everyday journey is one
decision—**Keep this meeting**—inside a complete dark DAF-TECH interface. The
result is a local, source-preserving Meeting Receipt that can grow into useful
work without changing the captured words.

The trust chain is:

`Source caption → preserved transcript → cited derivative → human review → controlled action`

Advanced controls stay behind progressive disclosure. Capture, recovery,
history, export, Evidence Board, deletion, and current review-first BYOAI remain
available without an account, license, or developer-operated transcript cloud.

This is the design rule for every 6.0 decision: **lightweight front door,
extraordinary back door**. The popup must stay calm enough for a first-time
user. The full Settings workspace is allowed to be the deep operational cockpit
for experts, administrators, integrations, privacy, provenance, diagnostics,
templates, and every advanced control.

## 6.0 product scope

### 1. Complete interface replacement

- Dark theme by default across popup, persistent workspace, Meeting Receipts,
  transcript viewer, Capture Moment review, exports, handoffs, and Settings.
- The DAF-TECH sphere is the structural visual language, not a decorative badge.
- One primary popup action, a clear green/red ready state, and direct Teams,
  Meet, and Zoom Web launchers.
- Keep the full transcript viewer directly reachable through a quiet **Open
  last live transcript** action without competing with the primary meeting
  workflow.
- Live transcript capture starts on for every supported meeting; the user can
  pause it explicitly from Settings and resume it without losing prior text.
- A unified workspace with Transcript, Moments, Live Notes, Evidence, Templates,
  and Ask views. Only the most common view is prominent; the rest remain quiet
  until chosen.
- Remove duplicate actions, old cute/card-heavy styling, overflow, stale names,
  and settings that compete with the meeting decision.
- Keyboard, focus, screen-reader, narrow-width, zoom, and error-state review on
  every surface.

### 2. Capture Moment

- Promote the existing explicit screenshot plumbing into a first-class
  **Capture Moment** action inside the meeting workspace.
- Preserve the PNG separately from the raw transcript and bind it to the active
  meeting, exact observation time, transcript fingerprint/revision, and nearby
  caption evidence.
- Require preview and user approval before local retention.
- Support an optional note/alt text, export, and deletion.
- Never send images to AI, email, or another service automatically.

### 3. Live Notes

- Start with **Generate notes now** using the existing review-first AI boundary.
- Produce Summary, Decisions, Action items, Risks, and Questions as a cited
  draft; invalid or invented citations are rejected.
- Let the user promote reviewed decisions/actions into Evidence markers.
- Add rolling notes only after the manual path is reliable: bounded caption
  deltas, pause/resume, update-now, retry limits, idempotency, and revision
  history. Local capture continues if notes fail or are paused.

### 4. Meeting templates and prompts

- Upgrade the existing prompt-template plumbing into versioned built-ins and
  user-created meeting templates.
- Create, duplicate, edit, select, export, import, and delete templates.
- Store sensitive custom prompts locally by default.
- Keep a non-editable safety envelope: transcript content is evidence, not
  instructions; citations are required; owners/dates cannot be invented; no
  tool execution is permitted.
- Regeneration creates a new derivative revision and never overwrites the raw
  transcript or a prior result.

### 5. Transcript Q&A

- Add one compact Ask field bound to the transcript snapshot visible at ask
  time.
- Every factual answer cites existing caption evidence or says the transcript
  does not establish the answer.
- Preserve question, answer, citations, source fingerprint/revision, and model
  or template version as a separate derivative.
- Do not include images, attendee reports, other meetings, or earlier questions
  unless the user explicitly selects them in a later reviewed design.

### 6. One binary and enterprise readiness

- Keep one package per browser—not separate Core, Pro, or Enterprise forks.
- Use stable capability IDs rather than scattered edition checks.
- Licensing or SSO failure must never disable local Core behavior.
- Managed policy denial always overrides optional feature allowance.
- Enterprise identity and hosted services remain separate trust-boundary work;
  no secret, raw license key, IdP token, or transcript content enters sync
  storage, logs, exports, fixtures, or source control.

### 7. Six certified browsers

- Google Chrome
- Microsoft Edge
- Brave
- Mozilla Firefox
- Opera
- Apple Safari on macOS

Chromium code sharing is not certification. Firefox receives its native
sidebar. Safari uses the same Meeting Receipt workspace in an extension tab
where a native side panel is unavailable. Every browser receives its own build,
provider smoke matrix, version/OS record, and evidence.

## Execution board

| Gate | Deliverable | Status |
| --- | --- | --- |
| 1 | 6.0 popup visual language and one-button meeting decision | Implemented; live UAT open |
| 2 | Persistent workspace visual conversion | Implemented; live responsive UAT open |
| 3 | Full remaining-surface UI conversion | Implemented; live responsive UAT open |
| 4 | Shared cited-derivative/provenance foundation | Implemented for Moments and reviewed Notes/Answers; original-request binding under review; live acceptance open |
| 5 | Capture Moment product workflow | Working local path; live browser UAT open |
| 6 | Manual cited Live Notes | Working reviewed handoff, local cited-note retention, and user-directed Evidence promotion; live UAT open |
| 7 | Rolling Live Notes | Implemented with bounded deltas, pause/resume, update-now, retry limits, idempotency, and restart-safe revision history; live UAT open |
| 8 | User meeting templates/prompts | Local Settings workbench, versioned built-ins/custom revisions and duplication implemented; workspace selection/safety hardening under review; live acceptance open |
| 9 | Transcript Q&A | Working snapshot-bound reviewed handoff plus local cited-answer retention; live UAT open |
| 10 | Six browser-specific build/runtime targets | Implemented; native validation open |
| 11 | Accessibility, privacy, security, and failure hardening | Automated seven-surface audit, extension validation, tests, and dependency audit pass; manual assistive-technology and live failure UAT open |
| 12 | Separate six-browser/provider certification | Packages built for all six; asserted Windows renderer checks passed in Chrome, Edge and Brave; Firefox screenshot captured only; all live provider certification, Opera, and Safari/macOS remain open |
| 13 | Frozen storefront bundle and release candidate | Reproducible screenshots, promotional art, six browser packages, hashes, SBOM, and provenance automation implemented; owner approval and candidate freeze open |
| 14 | Controlled promotion, public parity, and upgrade smoke | Open |

## Non-negotiable source model

The raw caption transcript is authoritative. A moment, note, template result,
answer, correction, or marker is a separate derivative with:

- its own ID, type, revision, creation time, and state;
- the source session, transcript SHA-256, caption count/revision, and exact
  cited caption/evidence IDs;
- generator and template/model identifiers where applicable;
- draft, user-confirmed, superseded, or deleted status.

No derivative may edit, truncate, or silently replace a source caption.

## Release sequence

1. Finish the shared derivative contract and Capture Moment workflow while the
   complete visual system is applied to every extension surface.
2. Deliver manual cited Live Notes; harden the review and promotion path.
3. Add rolling notes with bounded, restart-safe processing.
4. Complete editable local templates and regeneration history.
5. Add transcript Q&A on bounded snapshots.
6. Run automated, privacy, accessibility, and provider regression gates.
7. Certify Chrome, Edge, Brave, Firefox, Opera, and Safari separately.
8. Freeze current UI and features, then create—not before—the final 6.0 Store
   screenshots, promotional art, copy, hashes, SBOM, and provenance.
9. Hold the unchanged candidate window and promote through the governed Store
   process.

Audio/video recording, automatic AI submission, publisher transcript storage,
native Zoom desktop capture, uploaded-media transcription, speech-to-speech,
and PPT/PPTX generation remain outside 6.0.
