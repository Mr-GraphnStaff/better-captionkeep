# Better CaptionKeep

**by Señor Farris** — Keep the words. Stay in the conversation.

![Better CaptionKeep by Señor Farris — Scribble, our listening transcript mascot](branding/scribble-concept.png)

[Privacy policy](PRIVACY.md) · [Report an issue](https://github.com/Mr-GraphnStaff/better-captionkeep/issues) · [Contributing](CONTRIBUTING.md) · [MIT license](LICENSE)

Save live captions from Microsoft Teams and Google Meet in Chrome or Microsoft Edge, including the Teams PWA. Export TXT or Markdown, choose a save location, revisit saved sessions, and select a synchronized interface theme. Scribble is our listening transcript mascot.

## Better CaptionKeep 5.0

Better CaptionKeep began as a fork of Live-Captions-Saver. Version 5.0 moves decisively beyond that starting point: a privacy-first, enterprise-ready caption workspace designed to support Microsoft Teams, Zoom, and Google Meet through a shared provider architecture.

Version 5.0 combines multi-platform capture with local transcript history, local PII/PHI/PCI-like pattern masking through **Scrubby**, profanity and custom-term filtering, managed enterprise configuration, accessible themes, and reviewable AI handoffs that do not place transcript text in provider URLs. Teams remains the foundation, Google Meet is now a supported live-capture provider, and Zoom remains a later target. This is an independent evolution of the original MIT-licensed project, not an upstream endorsement or a claim of regulatory compliance.

## Interface previews

Screenshots below show the current packaged HTML and styling rendered in Microsoft Edge, with extension scripts disabled and no meeting connected. They illustrate the interface, not a live capture test. The banner above is approved mascot concept artwork.

| Capture and settings | Transcript viewer |
| --- | --- |
| <img src="branding/screenshots/popup.png" alt="Better CaptionKeep popup and settings preview" width="320"> | <img src="branding/screenshots/viewer.png" alt="Better CaptionKeep transcript viewer empty-state preview" width="600"> |

## What it does

- Capture displayed Teams and Google Meet captions and speaker information.
- Export TXT or Markdown with a choice of save location.
- Reopen saved sessions and use speaker aliases.
- Optionally include attendee information or hand a transcript to an AI provider.
- Choose CaptionKeep, Light, Midnight, or Follow system appearance across every extension page.
- Work in a branded transcript viewer with a sticky search, speaker-filter, copy, save, and history toolbar.
- Keep the popup calm with expandable settings sections; everyday capture controls remain visible first.
- Launch Teams or Google Meet from a compact meeting-app row. Zoom remains a clearly labeled preview until its adapter is ready.
- Recover an interrupted Google Meet capture from a recent local checkpoint for the same meeting page, then commit it to local history once the meeting ends.
- See capture health in the popup, including the number of caption lines and how recently the last caption arrived.
- Prepare evidence-backed meeting notes with caption IDs for decisions, actions, risks, and unanswered questions before any optional AI handoff.
- Export/import user preferences or let administrators enforce selected controls through managed browser policy.

AI handoffs prepare a local, editable prompt for review before you choose whether to copy or share it. Privacy Scrubber is visible and on by default: it masks supported sensitive patterns locally, leaves the saved original unchanged, and requires a second confirmation before an unmasked prompt can be copied. Pattern detection reduces accidental disclosure risk but does not guarantee HIPAA, PCI DSS, or other regulatory compliance. For managed ChatGPT or Claude accounts, first open the approved enterprise workspace and copy its URL into **Settings → Enterprise destinations**. Better CaptionKeep accepts only official HTTPS provider domains, never places transcript text in a provider URL, and asks you to confirm the active workspace before pasting. Preferences, including enterprise destinations and the selected theme, may use browser sync; see the [privacy policy](PRIVACY.md) for the full data-handling details.

## Themes

Open the extension popup and select **Settings → Appearance → Theme**. The selection applies immediately to the popup, transcript viewer, export page, and AI handoff page. CaptionKeep preserves the original cream-and-teal appearance; Follow system responds to the operating-system light or dark preference.

Choose **Automatically** to save transcripts without opening a Better CaptionKeep save page, or **Ask me each time** to choose a different location for every transcript. Advanced download settings can remember a dedicated local folder where the browser permits it, configure a subfolder beneath Downloads, open Downloads, and recover pending exports.

## Install for local testing

Version 4.6 is the previous Microsoft Edge Add-ons baseline. Version 4.7 is a completed, retired stabilization baseline and was not submitted to the Store. Version 5.0 is the current public release line.

### Chrome and Edge 5.0 sideloads

Run `npm run build:targets` to create four ignored test artifacts:

- `dist/chrome-unpacked` and `dist/better_captionkeep_-_chrome_test-5.0.0.zip`
- `dist/edge-unpacked` and `dist/better_captionkeep_-_edge_test-5.0.0.zip`

The unpacked folders each contain the effective browser-labeled `manifest.json`. They use separate extension identities and local storage from the published Edge 4.6 extension, so testing does not update or overwrite the Store installation.

For Chrome, open `chrome://extensions`; for Edge, open `edge://extensions`. Enable Developer mode, choose **Load unpacked**, and select the corresponding folder above. Remove the unpacked test extension when the checkpoint is finished.

1. Open Microsoft Edge and visit `edge://extensions`.
2. Enable Developer mode.
3. Choose **Load unpacked** and select the `teams-captions-saver` directory in this repository. Extract a built ZIP first if testing a package.
4. Open Microsoft Teams in Edge and enable live captions during a meeting.

After the project folder move, reload the extension from its new location if needed.

## Development

Use Node.js 20 or newer, then run `npm install`.

- `npm run lint`: validate the extension manifest and assets.
- `npm run build`: build a ZIP in `dist/`.
- `npm run build:intune`: generate the Edge force-install and managed-policy bundle in `dist/intune/`.
- `npm run build:intune:chrome`: after the Chrome Store assigns an extension ID, generate the Chrome force-install and managed-policy bundle in `dist/intune-chrome/`.
- `npm run build:intune:local-only`: generate the optional high-security bundle that disables AI handoff.
- `npm run build:chrome-store`: generate and verify the production-labeled Chrome Web Store candidate in `dist/chrome-store/`.
- Test capture, TXT/Markdown export, Save As, saved sessions, and Teams PWA behavior in Edge before publication.

Release and enterprise references: [standalone product record](docs/PROJECT-EMERGENCE.md), [5.0 release notes](docs/RELEASE-NOTES-5.0.md), [security and privacy design](docs/SECURITY-PRIVACY.md), [EUC deployment](docs/EUC-DEPLOYMENT.md), [platform adapter boundary](docs/PLATFORM-ADAPTERS.md), the evidence-based [5.0 release gate](docs/RELEASE-5.0.md), and the gated [Edge publishing pipeline](docs/EDGE-PUBLISH-PIPELINE.md).

Browser API identifiers such as `chrome.storage` remain unchanged because Edge implements those Chromium extension APIs. Internal source paths remain stable.

## Publication status

Target stores: **Microsoft Edge Add-ons and the Chrome Web Store**. Version 4.7 was retired from publication. Version 5.0 is the fully independent current release line, with Google Meet as its first new live-capture provider. The [privacy policy](PRIVACY.md) is published. Repository release status does not imply certification or approval by either store. Chrome submission preparation is tracked in the [Chrome Web Store checklist](docs/CHROME-WEB-STORE-SUBMISSION.md).

Production changes reach `master` only through review and validation. See the [contribution guide](CONTRIBUTING.md) and [release process](docs/RELEASE_PROCESS.md).

## Attribution and license

Better CaptionKeep originated from [Live-Captions-Saver](https://github.com/Zerg00s/Live-Captions-Saver) by Denis Molodtsov and is now independently developed as its own product and GitHub repository. The original MIT license, copyright, and permission notices remain preserved in LICENSE and in the packaged extension.

Not affiliated with or endorsed by Microsoft.
