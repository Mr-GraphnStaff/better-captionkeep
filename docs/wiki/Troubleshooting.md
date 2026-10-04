# Troubleshooting

## Manifest file is missing or unreadable

Choose the lane folder itself, not a parent folder or ZIP. The selected folder must contain `manifest.json` at its root:

- `dist/dev`
- `dist/uat`
- `dist/prod`

## An unknown error occurred when fetching the script

Reload the current build, open **Errors**, select **Clear all**, and reload again. If the error returns, record the exact lane and service-worker error. Current builds include the required inert local-configuration script in every lane; a repeated fetch error indicates mixed or stale build files.

## Microsoft 365 controls are missing

Confirm that the selected unpacked lane was configured after its most recent rebuild. Rebuilding replaces local configured identifiers with the safe inert placeholder. Dev, UAT, and Prod support the same configured connector behavior.

## AADSTS50011 redirect URI mismatch

The extension is sending a redirect URI that is not registered for the Entra application.

1. Open **Administrator connection details** in Better CaptionKeep.
2. Copy the exact runtime redirect URI.
3. Add that exact URI to the Entra app registration as a web redirect URI.
4. Save the registration, disconnect, and retry sign-in.

Each unpacked lane has its own extension identity. Registering the UAT redirect does not automatically register Dev or Prod.

## A recent meeting has no official transcript

An official transcript exists only when Teams transcription ran. Live captions and a calendar meeting are not sufficient. Microsoft may also need processing time after the meeting ends.

## The meeting imports but the viewer does not open

Treat that as a product defect. Record which meeting card was selected, whether the import confirmation appeared, and whether the session exists in local history. Do not include transcript content or participant names in a public issue.
