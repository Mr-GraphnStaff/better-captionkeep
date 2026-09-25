# Chrome Web Store submission

This checklist creates a separate Chrome Web Store item without changing the Microsoft Edge Add-ons submission. The first Chrome upload must come from a reviewed commit and must not use either browser's `- Test` sideload package.

The first 5.0.0 item is already public. Updates use the gated Chrome Web Store
API v2 workflow in [`CHROME-PUBLISH-PIPELINE.md`](CHROME-PUBLISH-PIPELINE.md).
The dashboard steps below remain the source for listing, privacy, distribution,
artwork, reviewer instructions, and the final staged-publication decision.

## Build and identify the candidate

1. Run `npm ci`, `npm test`, and `npm run lint`.
2. Run `npm run build:chrome-store`.
3. Record the printed SHA-256 value and preserve the exact ZIP from `dist/chrome-store/`.
4. Load `dist/chrome-store-unpacked/` through `chrome://extensions` and complete Chrome UAT before uploading the ZIP.
5. Confirm the installed name is **Better CaptionKeep**, the version is **5.0.0**, and no title contains `Test` or `development`.

Do not upload from `dist/chrome-unpacked/` or a ZIP with `chrome_test` in its name. Those artifacts intentionally have a separate testing identity.

## Store listing

- **Name:** Better CaptionKeep
- **Summary:** Capture, protect, review, and export live captions from Microsoft Teams and Google Meet.
- **Category:** Productivity
- **Language:** English
- **Privacy policy:** `https://github.com/Mr-GraphnStaff/better-captionkeep/blob/master/PRIVACY.md`

### Detailed description

Better CaptionKeep helps you stay in the conversation while preserving the live captions already displayed in Microsoft Teams and Google Meet.

Capture captions locally, review a readable transcript, search by speaker, and export TXT or Markdown files. Saved-session history and recovery checkpoints help protect work when a meeting page changes or the browser interrupts capture.

Privacy Scrubber is on by default and can mask common sensitive patterns before copy, export, or an optional AI handoff. The original saved transcript remains available for review. Scrubby reduces accidental disclosure risk but is not a compliance guarantee or a replacement for enterprise DLP.

Better CaptionKeep is Bring Your Own AI (BYOAI): AI handoff is optional and review-first. Better CaptionKeep prepares an editable prompt inside the extension; it does not put transcript text in a provider URL, paste it automatically, or submit it on the user's behalf. Individuals and organizations can choose supported assistants, while administrators can enforce privacy settings and approved destinations through managed browser policy.

The local Evidence Board can remain open beside a supported meeting. Users mark captured captions as decisions, actions, questions, risks, follow-ups, or important moments and can copy or save a source-linked Markdown brief. Markers remain local and do not modify the raw transcript.

Better CaptionKeep does not record microphone audio or video, run advertising or analytics, or send transcripts to a developer-operated service.

Keep the words. Stay in the conversation.

## Privacy questionnaire working answers

Recheck the labels shown in the dashboard because Google may revise the questionnaire.

- **Single purpose:** Capture, protect, review, and export live captions rendered by supported Microsoft Teams and Google Meet pages.
- **Personally identifiable information:** Yes. Speaker and optional attendee names may identify people.
- **Personal communications / user-generated content:** Yes. Meeting captions are communications supplied by meeting participants.
- **Website content:** Yes. The extension reads captions, meeting titles, and optional attendee details rendered by the supported meeting pages.
- **Authentication information, financial information, health information, location, browsing history, and web activity:** The extension does not intentionally collect these categories as structured account or activity data. Spoken meeting content can nevertheless contain sensitive information, which is why the policy must disclose transcript handling and Scrubby's limits.
- **Sale, advertising, creditworthiness, or unrelated use:** No.
- **Remote code:** No. All executable extension code is packaged in the ZIP.

### Permission justifications

- **`activeTab`:** Lets the popup identify and communicate with the supported meeting tab the user is actively viewing.
- **`downloads`:** Saves user-requested TXT or Markdown transcript exports and opens the browser's downloads folder when requested.
- **`storage`:** Stores preferences, managed settings, recovery checkpoints, and up to ten saved transcript sessions in extension-controlled browser storage.
- **Host access — `teams.microsoft.com` and `teams.cloud.microsoft`:** Reads captions and optional attendee information rendered during Microsoft Teams meetings.
- **Host access — `meet.google.com`:** Reads captions rendered during Google Meet meetings.

## Listing artwork

Use the reviewed assets under `store-assets/5.0/` only after Chrome UAT confirms that they accurately represent the candidate:

- `01-live-capture.png` — 1280 x 800 screenshot
- `small-promotional-tile.png` — 440 x 280 required small tile
- `large-promotional-tile.png` — 1400 x 560 optional marquee tile

Add up to four more 1280 x 800 Chrome screenshots if available. Do not upload screenshots that expose real participant names, meeting links, organization identifiers, or transcript content.

## Reviewer test instructions

1. Install the extension in Chrome and pin **Better CaptionKeep**.
2. Start or join a Google Meet meeting and enable live captions.
3. Speak a short test phrase and verify the popup reports capture activity.
4. Open the transcript viewer and verify the captured phrase can be searched and copied.
5. Export the transcript as TXT or Markdown and verify the download completes.
6. In Settings, confirm Privacy Scrubber is enabled by default. AI handoff can be enabled, but the generated prompt remains on the extension review page until the reviewer explicitly copies it.
7. Microsoft Teams can be tested through either `teams.microsoft.com` or `teams.cloud.microsoft`; sign-in and meeting access are supplied by the reviewer's Microsoft environment.

No developer-operated server, test credential, paid subscription, microphone recording, or video recording is required for the extension itself.

## Dashboard sequence

1. Dismiss the welcome panel and complete the publisher profile.
2. Select **New item** and upload the verified Chrome Store ZIP. Uploading creates the draft item; it does not publish it.
3. Copy the new 32-character Chrome extension ID. Set `CAPTIONKEEP_CHROME_EXTENSION_ID` and run `npm run build:intune:chrome` to produce the Chrome Intune bundle.
4. Complete **Store listing**, **Privacy**, **Distribution**, and **Test instructions** with the reviewed material above.
5. Keep automatic publishing disabled for the first submission.
6. Review the draft, candidate hash, screenshots, disclosures, and distribution before selecting **Submit for review**.
7. Publish only after Google approves the item and the approved candidate passes final Chrome and Brave smoke tests.
