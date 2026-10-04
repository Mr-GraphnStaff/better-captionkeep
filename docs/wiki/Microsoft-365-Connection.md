# Connect Microsoft 365

> **Availability — October 4, 2026:** Edge now publicly serves 5.3.2 with the customer-owned Microsoft 365 setup. Chrome continues to serve 5.1.0 while 5.3.2 remains in review. Existing Edge upgrade verification is still open.

The connector retrieves an official Teams transcript directly from Microsoft Graph into the browser's private local history. Better CaptionKeep's developer does not receive the transcript.

## Before the meeting

Teams has two different controls:

- **Live captions** display words in the meeting and allow Better CaptionKeep to create a local browser transcript.
- **Start transcription** tells Microsoft 365 to retain an official transcript in the organization's tenant.

A calendar invitation or live captions alone does not create the official Microsoft 365 transcript. Turn on transcription separately when organizational policy and meeting roles permit it.

## Connect and import

1. Your Microsoft 365 administrator creates an organization-owned single-tenant Entra app registration using the linked runbook.
2. Open Better CaptionKeep and expand **Administrator connection details**.
3. Enter the organization's Directory tenant ID and Application client ID, then select **Save Microsoft 365 setup**. These public identifiers stay in this browser profile.
4. Select **Connect Microsoft 365**, approve the one-time browser access request for Microsoft identity and Graph, and complete Microsoft sign-in. This optional access is not requested during extension installation or update.
5. Select **Refresh** to list up to five recent eligible Teams meetings.
6. Choose a meeting, or use the current-meeting/manual-link fallback.
7. Select **Import verified transcript**. Better CaptionKeep opens it in the normal viewer with the same local review and export functions.

Microsoft may need time after a meeting ends to finish producing the transcript. Refresh and retry if Teams still reports it unavailable.

## Administrator requirements

Better CaptionKeep does not operate a shared Entra app. Each organization owns a single-tenant app registration, grants the documented delegated permissions, and registers the exact Store redirect URI for each browser it deploys. Wildcard redirects do not work.

Store installations keep Store-assigned identities. The three governed unpacked test lanes also have fixed identities, so their redirects are registered once and remain stable across rebuilds.

See [Administrator deployment](Administrator-Deployment) and the full [Entra registration runbook](https://github.com/Mr-GraphnStaff/better-captionkeep/blob/master/docs/ENTRA-GRAPH-APP-REGISTRATION.md).
