# Better CaptionKeep

**by Señor Farris** — Keep the words. Stay in the conversation.

![Better CaptionKeep by Señor Farris — Scribble, our listening transcript mascot](branding/scribble-concept.png)

[Privacy policy](PRIVACY.md) · [Report an issue](https://github.com/Mr-GraphnStaff/better-captionkeep/issues) · [Contributing](CONTRIBUTING.md) · [MIT license](LICENSE)

Save live captions from Microsoft Teams in Microsoft Edge, including the Teams PWA. Export TXT or Markdown, choose a save location, and revisit saved sessions. Scribble is our listening transcript mascot.

## A new direction for 5.0

Better CaptionKeep began as a fork of Live-Captions-Saver. Version 5.0 is a deliberate move beyond that starting point: a privacy-first, enterprise-ready caption workspace designed to support Microsoft Teams, Zoom, and Google Meet through a shared provider architecture.

The 5.0 roadmap brings together reliable multi-platform capture, local transcript history, local PII/PHI/PCI-like pattern masking through **Scrubby**, profanity and custom-term filtering, managed enterprise configuration, accessible themes, and reviewable AI handoffs. Teams is the working foundation; Zoom and Google Meet adapters will be developed and validated before the next public release. This remains an independent evolution of the original MIT-licensed project, not an upstream endorsement or a claim of regulatory compliance.

## Interface previews

Screenshots below show the current packaged HTML and styling rendered in Microsoft Edge, with extension scripts disabled and no meeting connected. They illustrate the interface, not a live capture test. The banner above is approved mascot concept artwork.

| Capture and settings | Transcript viewer |
| --- | --- |
| <img src="branding/screenshots/popup.png" alt="Better CaptionKeep popup and settings preview" width="320"> | <img src="branding/screenshots/viewer.png" alt="Better CaptionKeep transcript viewer empty-state preview" width="600"> |

## What it does

- Capture displayed Teams captions and speaker information.
- Export TXT or Markdown with a choice of save location.
- Reopen saved sessions and use speaker aliases.
- Optionally include attendee information or hand a transcript to an AI provider.

AI handoffs send text to the selected provider through a URL. Preferences may use browser sync; see the [privacy policy](PRIVACY.md) for the full data-handling details.

## Install for local testing

The independent fork is not yet published on Microsoft Edge Add-ons. Existing upstream store listings install the original extension, not this fork.

1. Open Microsoft Edge and visit `edge://extensions`.
2. Enable Developer mode.
3. Choose **Load unpacked** and select the `teams-captions-saver` directory in this repository. Extract a built ZIP first if testing a package.
4. Open Microsoft Teams in Edge and enable live captions during a meeting.

After the project folder move, reload the extension from its new location if needed.

## Development

Use Node.js 20 or newer, then run `npm install`.

- `npm run lint`: validate the extension manifest and assets.
- `npm run build`: build a ZIP in `dist/`.
- Test capture, TXT/Markdown export, Save As, saved sessions, and Teams PWA behavior in Edge before publication.

Browser API identifiers such as `chrome.storage` remain unchanged because Edge implements those Chromium extension APIs. Internal source paths remain stable.

## Publication status

Target store: **Microsoft Edge Add-ons only**. Version 4.6 is live, with its refreshed listing subject to Microsoft review. Version 4.7 completed internal stabilization and QA, then rolled forward into 5.0 instead of being submitted separately. Version 5.0 is the next planned public release. The [privacy policy](PRIVACY.md) is published. This repository does not imply approval of unreleased versions.

Production changes reach `master` only through review and validation. See the [contribution guide](CONTRIBUTING.md) and [release process](docs/RELEASE_PROCESS.md).

## Attribution and license

An independent fork of [Live-Captions-Saver](https://github.com/Zerg00s/Live-Captions-Saver) by Denis Molodtsov, under the MIT license. Original copyright and permission notices are preserved in LICENSE and included in the packaged extension.

Not affiliated with or endorsed by Microsoft.
