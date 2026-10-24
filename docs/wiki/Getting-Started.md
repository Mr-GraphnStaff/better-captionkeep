# Capture Your First Meeting

This guide describes the **6.0 release-qualification build**, not an assertion
that 6.0 is publicly available. Confirm the installed version and consult
[Installation](Installation) and [Release status](Release-Status).

Better CaptionKeep reads captions already displayed by the supported meeting page. It does not listen to the microphone or record video.

## Capture controls

For 6.0, live transcript capture starts by default in supported meetings. Open **All Settings → Capture controls** to pause capture or configure saving when a meeting ends. Open **Live Workspace** to review captured words; if meeting captions are unavailable, use the visible caption recovery action. In Teams, attendee capture and official Microsoft 365 transcription remain separate explicit actions. Turning capture off stops new local capture without deleting words already collected. Provider and organization policies may prevent captions, rosters, or official transcription from becoming available. For the public 5.4 interface, consult its versioned release instructions.

## Microsoft Teams

1. Join the meeting in Teams on the web or the Teams PWA in a Chromium browser.
2. In Teams, turn on **Live captions**.
3. Open Better CaptionKeep and confirm **Live transcript is on**, the correct provider and an increasing caption count. Choose **Open Live Workspace** to review the words.
4. Leave the meeting normally. Better CaptionKeep finalizes the local transcript and makes it available in History.

If you also want an official transcript retained by Microsoft 365, someone with permission must separately start **Teams transcription**. Live captions and transcription are different controls.

## Google Meet

1. Join the meeting at `meet.google.com`.
2. Turn on captions if they are not already visible.
3. Open Better CaptionKeep and confirm capture is active.
4. End or leave the meeting to finalize the local transcript.

## Zoom Web

1. Join through the Zoom Web client at `app.zoom.us`.
2. Enable the meeting's subtitle or caption overlay.
3. Open Better CaptionKeep and confirm capture is active.

Zoom Web may not expose speaker names in the rendered caption overlay. Better CaptionKeep labels those records as **Unknown speaker** instead of inventing attribution.

## Confirm capture before relying on it

Use a short synthetic test meeting first. Confirm the provider, live state and
increasing caption count. Provider interfaces can change, and captions that are
not displayed cannot be captured. **Open last live transcript** and the
workspace's **Full transcript** action provide the full viewer.

## Appearance and controlled qualification

Open **All Settings → Appearance** for CaptionKeep (the dark teal default), Light, Midnight, Slate, High contrast
or Follow system. Appearance choices do not alter capture permissions or managed privacy restrictions.

Chrome, Edge, Brave, Firefox and Opera are the five 6.0 targets. Each requires
its own test evidence; shared Chromium code does not certify another browser.
Firefox uses its own package/sidebar. Safari and MCP setup are deferred.

For controlled Chromium qualification, use the supplied
`P:\Projects\better-captionkeep-dev\dist\uat` package with its recorded source
identity. The parent `dist` folder is not an extension package. Preserve ordinary
Store installations and archives; use the build owner's test instructions.

Next: [Review, save, and export](Review-Save-and-Export).
