> **Archived / superseded scope — October 14, 2026:** The lead removed Safari
> completely from 6.0. This original preparation is preserved for a later major
> version, not active support, an installation offer, or a release gate. Reverify
> procedures, dependencies and package identity before any future use.

# Better CaptionKeep 6.0: Mac test handoff

For David's brother. Draft instructions, checked 2026-10-14. The fresh ZIP and
candidate hash must be supplied after the build; this document is not a package
or a Safari certification result.

## What we need from you

A real Mac, Safari, and a controlled test meeting. Tell us the macOS version,
Safari version, Intel/Apple silicon, and whether you can install a temporary
extension. Do not buy software, join a paid program, upgrade your OS, or change
company policies just to run this test without agreeing first.

Use synthetic test names and harmless phrases. Do not send passwords, tokens,
customer meetings, attendee names, or private screenshots. You may stop at any
step and send the error text with sensitive details removed.

## Kit checklist for David before sending

- Fresh Safari-target extension folder/ZIP with `manifest.json` at its root.
- Exact 6.0 source commit, filename, SHA-256 and date; checksum matches bytes.
- These instructions and a blank results form with candidate identity.
- No Windows-only path dependencies, private transcript fixtures or secrets.
- Describe it as development testing, not a Store-approved extension.

## Easiest route: temporary macOS Safari installation

Apple now documents folder/ZIP installation without an Xcode project. In Safari
Settings, enable developer features in Advanced if necessary, then open Developer
and choose **Add Temporary Extension**. Accept the unsigned-extension prompt and
select the supplied Safari-target folder or ZIP. Check it appears under temporary
Extensions, enable it, and review site access for the three test providers.
Temporary extensions disappear after Safari quits or after 24 hours; repeat
installation if necessary. Do not mistake this reset for lost persistent capture
support in an installed release. If your Safari has no temporary-install option,
record its version and use the fallback below. Apple does not establish a minimum
version for that option on the linked page; we have not verified your machine.
See [Apple: running a Safari web extension](https://developer.apple.com/documentation/safariservices/running-your-safari-web-extension).

## Fallback: Xcode development wrapper

Use an Xcode version supported by your current macOS according to
[Apple's Xcode compatibility table](https://developer.apple.com/xcode/system-requirements).
Do not assume the newest Xcode fits an older Mac. In Terminal, check which tool
your installed Xcode provides:

```sh
xcrun safari-web-extension-packager --help
```

Apple renamed the former `safari-web-extension-converter` tool. If your older
installation only offers that name, use its own help. With the current packager,
substitute the actual extracted folder path:

```sh
xcrun safari-web-extension-packager "/actual/path/to/safari-extension" --macos-only --swift --copy-resources
```

Open the generated project, choose its macOS app scheme, and Run. Review all
manifest warnings; send them back rather than dismissing them. Enable the
extension in Safari Settings. Unsigned development builds require Safari's
developer settings; that allowance resets when Safari quits. Packaging and
distribution remain separate from this local test.
See [Apple: packaging a web extension](https://developer.apple.com/documentation/safariservices/packaging-a-web-extension-for-safari)
and [running it](https://developer.apple.com/documentation/safariservices/running-your-safari-web-extension).

## Test in this order

1. **Open it outside a meeting.** Popup fits; dark DAF sphere theme; no false
   capture badge. Gear opens Settings. Teams, Meet and Zoom Web controls remain
   reachable. Record unsupported permissions/APIs or blank pages immediately.
2. **Join Google Meet in Safari.** Use a second participant to speak three
   synthetic phrases. Enable provider captions if needed. Confirm captured
   words appear; open Live Workspace. Safari uses an extension tab rather than
   Chromium's side panel. Check the popup/badge agrees with actual capture.
3. **Read while captions arrive.** Transcript is chronological. Select words or
   a caption; actions appear only then. Follow latest pauses without jumping;
   Clear and Follow latest recover the normal reading state. Resize and zoom.
4. **Pause, leave, rejoin.** Pause local capture explicitly; old words survive.
   Leave while paused, open an unrelated page, then join a new meeting. No stale
   ON badge and no mixing earlier words into the new Receipt.
5. **Keep/open/export/delete.** Open last live transcript and history. Save an
   offered text format; check actual contents and filename. Cancel once. Delete
   the synthetic Receipt and confirm its related evidence disappears.
6. **Advanced features.** Create/select a custom template. Generate a reviewed
   Notes handoff; Ask a question, then add new captions before retaining the
   cited answer. Reject an invented citation. External AI use is optional and
   explicit: a handwritten synthetic reviewed answer suffices for local tests.
7. **Moment.** Capture a harmless screen, preview, cancel once, then approve with
   optional description. Export PNG and delete. No image should send itself.
8. **Keyboard/VoiceOver.** Navigate views and caption actions using Tab, arrow
   keys, Enter/Space. Try archive dialog and Escape. With VoiceOver, check names,
   state and readable status/error feedback. Report noise/traps/unlabeled items.
9. **Other providers.** Repeat core capture/pause/leave/rejoin/export on Microsoft
   Teams web and Zoom Web if accessible. Record blocked/unavailable honestly;
   Meet alone cannot certify either provider. Native desktop apps are not this
   test target. Try supported theme choices and 200% zoom on each main surface.

## Results to return

```text
Candidate filename / SHA-256 / source commit:
Mac model architecture / macOS / Safari / Xcode (if used):
Install route: temporary / Xcode
Provider + date + test step:
Expected result:
Actual result: pass / fail / blocked / not tested
Reproduction steps and sanitized error:
Optional synthetic screenshot filename:
Keyboard and VoiceOver observations:
```

Send only the result and sanitized synthetic evidence, not your browser profile
or transcript archive. Quit/uninstall the temporary extension or disable the
development app's extension when finished. Do not change ordinary Safari
security settings beyond the documented development test; restore any settings
you changed. David records results against the exact candidate and owns the
release decision; participation is not automatic approval.
