# Connect Microsoft 365

> **Availability:** Verified Teams Transcript is part of the corrected 5.3 candidate and is not available in the public 5.1.0 Store build as of October 4, 2026.

The connector retrieves an official Teams transcript directly from Microsoft Graph into the browser's private local history. Better CaptionKeep's developer does not receive the transcript.

## Before the meeting

Teams has two different controls:

- **Live captions** display words in the meeting and allow Better CaptionKeep to create a local browser transcript.
- **Start transcription** tells Microsoft 365 to retain an official transcript in the organization's tenant.

A calendar invitation or live captions alone does not create the official Microsoft 365 transcript. Turn on transcription separately when organizational policy and meeting roles permit it.

## Connect and import

1. Open Better CaptionKeep.
2. Open **Verified Teams transcripts**.
3. Select **Connect Microsoft 365** and complete Microsoft sign-in.
4. Select **Refresh** to list up to five recent eligible Teams meetings.
5. Choose a meeting, or use the current-meeting/manual-link fallback.
6. Select **Import verified transcript**.
7. Better CaptionKeep opens the imported transcript in the normal viewer with the same local review and export functions.

Microsoft may need time after a meeting ends to finish producing the transcript. Refresh and retry if Teams still reports it unavailable.

## Administrator requirements

The organization must configure the approved Entra application, delegated Graph permissions, tenant consent, Teams transcript API access, and the exact browser redirect URI. Wildcard redirects do not work.

Store installations keep Store-assigned identities. The three governed unpacked test lanes also have fixed identities, so their redirects are registered once and remain stable across rebuilds.

See [Administrator deployment](Administrator-Deployment) and the full [Entra registration runbook](https://github.com/Mr-GraphnStaff/better-captionkeep/blob/master/docs/ENTRA-GRAPH-APP-REGISTRATION.md).
