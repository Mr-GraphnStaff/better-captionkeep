# Troubleshooting

## Captions are not being captured

Confirm that captions are visibly displayed in the supported meeting page. Better CaptionKeep does not transcribe audio itself. Reopen the extension and check capture health. If the count does not increase during a synthetic test, record the browser, extension version, provider, and sanitized error details.

## The transcript did not save

Open **History** and check for the completed session or a recovery entry. Confirm the configured save behavior and browser download permissions. Do not clear extension storage until you have checked recovery.

## Zoom captions have no speaker names

The Zoom Web subtitle overlay may not expose speaker attribution. Better CaptionKeep uses **Unknown speaker** rather than inventing a name.

## Microsoft 365 controls are missing

Chrome 5.1.0 does not contain Verified Teams Transcript. Edge 5.3.1 has a known defect that hides it. In 5.3.2 and later, the section stays visible but Connect remains disabled until the organization supplies valid tenant and client IDs locally or through managed policy.

## AADSTS50011 redirect mismatch

The extension is sending a redirect that the Entra app does not contain. An administrator must compare the exact URI shown under **Administrator connection details** with the application registration. Do not add a wildcard or repeatedly add path-generated identities; governed unpacked lanes and Store installations have stable IDs.

## A recent Teams meeting has no official transcript

Teams transcription must have been started separately from live captions. Microsoft may also need processing time after the meeting ends. A calendar invitation by itself is not sufficient.

## Manifest missing or unreadable during controlled testing

Select `dist/dev`, `dist/uat`, or `dist/prod` itself—not the parent `dist` directory and not a ZIP. The selected folder must contain `manifest.json` at its root.

## Unknown script-fetch error during controlled testing

Reload the current canonical lane, clear historical errors, and reload again. If the error returns, treat the build as mixed or stale and report it; do not work around it by creating another folder.

## Imported meeting does not open in the viewer

Treat that as a product defect. Record which meeting card position was selected, whether import confirmation appeared, and whether the session exists in local History. Do not post meeting names, transcript text, or participant data publicly.

Still stuck? See [Support and bug reports](Support).
