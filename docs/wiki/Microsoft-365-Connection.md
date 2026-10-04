# Connect Microsoft 365

The Microsoft 365 connector retrieves an official Teams transcript directly from Microsoft Graph into the browser's private local history. Better CaptionKeep's developer does not receive the transcript.

## Before the meeting

Live captions and Teams transcription are different controls:

- **Live captions** provide the browser-visible words that Better CaptionKeep can capture locally.
- **Teams transcription** creates the official tenant transcript that Microsoft 365 can later return.

Turn on both when you want both sources. A calendar invitation or live captions alone does not guarantee that Microsoft will retain an official transcript.

## Connect and import

1. Open Better CaptionKeep.
2. Open **Verified Teams transcripts**.
3. Select **Connect Microsoft 365** and complete Microsoft sign-in.
4. Select **Refresh** to list the five recent eligible Teams meetings.
5. Choose a meeting.
6. Select **Import verified transcript**.
7. Better CaptionKeep opens the imported transcript in the normal transcript viewer with the same review and export functions.

Microsoft may need time after the meeting ends to finish producing the official transcript. Refresh and retry when Teams still reports that the transcript is unavailable.

## Local unpacked configuration

Dev, UAT, and Prod use the same connector behavior. Each unpacked lane has a separate browser-extension identity and therefore a separate redirect URI:

```text
https://<extension-id>.chromiumapp.org/microsoft
```

The exact URI shown under **Administrator connection details** must be registered in the Entra application. Wildcards do not work.

Configured tenant and client identifiers are written only into the selected ignored local lane. Version-controlled source and Store ZIPs contain an inert placeholder instead of those configured values.

For the administrator procedure, see the repository's [Entra registration runbook](https://github.com/Mr-GraphnStaff/better-captionkeep/blob/master/docs/ENTRA-GRAPH-APP-REGISTRATION.md).
