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

## Project-local product skills

- Use `.agents/skills/better-captionkeep-ux-designer/SKILL.md` when reviewing flows, interface states, terminology, hierarchy, accessibility, or release UX acceptance.
- Use `.agents/skills/better-captionkeep-ui-engineer/SKILL.md` when implementing or verifying interface changes.
- Use `.agents/skills/better-captionkeep-qa-engineer/SKILL.md` when designing or executing functional, visual, accessibility, upgrade, failure, or cross-browser testing and release evidence.
- For a UX finding that proceeds to code, apply the UX skill first to establish observable acceptance criteria, then the UI engineering skill to implement it, and finally the QA skill to verify the corrected build independently.
