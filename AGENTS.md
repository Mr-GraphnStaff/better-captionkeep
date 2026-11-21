# AGENTS.md

This document describes requirements and expectations for AI coding assistance on Better CaptionKeep.

## Project Overview
Better CaptionKeep originated as a fork of [Zerg00s/Live-Captions-Saver](https://github.com/Zerg00s/Live-Captions-Saver) and is now an independently developed, multi-platform product.
Its first independent feature was **Save As (choose download location)**; the current product supports Microsoft Teams and Google Meet, with additional providers developed through the governed adapter architecture.

## Tech Stack
- **JavaScript (ES6+)**: Core extension logic, exports, event handlers.
- **HTML/CSS**: Popup, options, transcript viewer UI.
- **Chrome Extensions API (Manifest V3)**: Storage, downloads, permissions.
- **Optional**: Node.js for scripts/tests if added later.

## Requirements for AI Agents
1. **Code Style**
   - Follow ES6 standards.
   - Keep functions small and focused.
   - Prefer async/await over callbacks.

2. **Extension Context**
   - Target **Manifest V3** (no V2).
   - Use `chrome.scripting`, `chrome.storage`, `chrome.downloads`.
   - Must work in **Teams PWA** inside Chromium browsers.

3. **New Features Roadmap**
   - `saveAs` dialog for exports (first change).
   - Custom filename patterns and export formats.
   - Lightweight mode (disable AI/analytics features).
   - UI refinements for PWA usage.

4. **Testing**
   - Must be testable by loading unpacked extension into Chrome/Edge/Brave.
   - Console logging for debug.
   - No external server dependencies.

5. **Documentation**
   - Update `README.md` after major changes.
   - Comment code blocks for clarity.
   - Track agent-generated changes in commit messages.

## Expectations
- Suggestions must include **file and function name** for edits.
- All changes should preserve extension stability.
- Legal notice: the original MIT license and attribution must remain intact.

## Transparent defect tracking

Every confirmed defect found during project work must be documented in the
project's GitHub issues, including defects already fixed locally. Search existing
issues first and add evidence to the matching record instead of duplicating it.
Include affected version, synthetic reproduction or precise source evidence,
impact, fix/test status, and remaining acceptance. Link the public issue to the
corresponding Azure Boards work item. Do not close a defect solely because local
unit tests pass or imply an unpublished local fix is deployed. Never publish
credentials, private tenant identifiers, meeting content or unsanitized screenshots.
Clearly distinguish confirmed bugs, hypotheses, and feature requests.

## Project-local product skill routing

- Use `.agents/skills/software-team/SKILL.md` when the user invokes `$software-team` or requests coordinated multidisciplinary delivery. Read its coordination and relevant role playbooks, use the existing 6.0 roadmap and release evidence, and keep the user as team lead. The full portable package is stored with this repository.
- Use `.agents/skills/better-captionkeep-ux-designer/SKILL.md` when reviewing flows, interface states, terminology, hierarchy, accessibility, or release UX acceptance.
- Use `.agents/skills/better-captionkeep-ui-engineer/SKILL.md` when implementing or verifying interface changes.
- Use `.agents/skills/better-captionkeep-qa-engineer/SKILL.md` when designing or executing functional, visual, accessibility, upgrade, failure, or cross-browser testing and release evidence.
- For a UX finding that proceeds to code, apply the UX skill first to establish observable acceptance criteria, then the UI engineering skill to implement it, and finally the QA skill to verify the corrected build independently.

## P: drive workspace policy (owner decision, 2026-10-19)

- Keep all agent-created Better CaptionKeep source, scripts, experiments, reports,
  screenshots, generated deliverables and preservation copies on P:.
- Version 6 source belongs in P:\Projects\Better CaptionKeep. Verify its
  branch and working tree before changes. Dev, QA, and Production are real build
  folders inside that neutral project root. The old hidden better-captionkeep and
  better-captionkeep-6.0 folders are not active development lanes.
- Use one sandbox: P:\Projects\better-captionkeep-sandbox. Use scratch\ for
  disposable scripts and experiments, artifacts\ for review outputs, and
  preserved\ for recoverable copies before authorized replacement or cleanup.
  Keep normal project build outputs in their prescribed project locations.
- Do not create project workspaces or discretionary outputs under C:\Users,
  Documents\Codex, .codex\visualizations, or another personal-profile location.
  Configure subprocess temporary files and caches under the P: sandbox where
  supported. Do not relocate app-managed runtime, authentication, logs, sessions,
  or installed tools as part of this rule.
- If a tool requires project output on C:, report the conflict and use a P:
  capable alternative. Do not silently fall back to C:.
- Report the absolute paths of created deliverables in the final response.
- Instructions are not a filesystem security boundary. Check the active session
  permission profile. If it is unrestricted or includes writable C: artifact
  roots, disclose that enforcement is not active. Never claim that saved config
  overrides app/session permissions. Follow this P: rule even in full access.
- Preserve existing material. Inventory and obtain the owner's cleanup scope
  before moving or deleting old C: work; do not treat scratch as auto-delete.


<!-- owner-working-area-policy:start -->
## Owner-required scratch boundary — November 2, 2026

Each work folder maps to its own remote repository. `working/` is the ONLY
permitted location for agent scratch and temporary work in this checkout.
This owner instruction supersedes older tmp/, temp/, dist/scratch/, QA-folder,
OS-temp and peer-clone recommendations. No child instructions or convenience
exception may waive it; stop on a conflict instead of finding a workaround.

- Before ANY temporary write, run:
  `python C:/Users/DavidFarris/.codex/tools/working_area.py check --root <checkout>`.
  A missing marker, linked path, tracked scratch file or failed exclusion stops
  the operation. Never use force-add, remove exclusions, change the boundary,
  reuse a different repository, or fall back to OS temp to get past a failure.
- Run development/test/research commands through the tool's `run --root
  <checkout> -- <command>` mode. It sets per-run temporary/cache paths inside
  working/, suppresses source-tree Python bytecode and checks for new untracked
  files outside working/. Configure any tool-specific logs, downloads, browser
  profiles, screenshots, reports and disposable checkouts inside that run too.
  If a tool cannot comply, stop rather than run it with an outside destination.
- Keep actual source, deliberate deliverables and runtime dependencies in their
  intended project locations. Never relabel user files or uncommitted source as
  scratch. Never stage, commit, push or package working/. Verify each non-Git
  sync/build/package context excludes it as well.
- Run `maintain --root <checkout>` at task start and finish. It purges only
  completed, explicitly disposable managed runs older than seven days, with no
  live owner, retained marker, links or nested repository. Relocated material,
  rollback databases, recovery records, manifests and user files are retained.
- Relocation requires an inventory, zero tracked paths, no active worktrees,
  verified inside-root paths, and before/after hashes. Keep the recovery receipt.

These instructions and the checked launcher are mandatory operating controls,
not an OS sandbox. Never claim they technically prevent every arbitrary process
from writing elsewhere. Changes to this owner policy require the owner's direction.
<!-- owner-working-area-policy:end -->
