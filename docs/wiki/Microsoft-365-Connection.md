# Connect Microsoft 365

> **Release context:** Microsoft 365 setup is part of the 6.0 qualification build. The last documented public baseline is 5.4.0; see [Release status](Release-Status) for dated Store evidence. Candidate qualification is separate from Store publication and installed-upgrade verification.

The connector retrieves an official Teams transcript directly from Microsoft Graph into the browser's private local history. Better CaptionKeep's developer does not receive the transcript.

## Before the meeting

Teams has two different controls:

- **Live captions** display words in the meeting and allow Better CaptionKeep to create a local browser transcript.
- **Start transcription** tells Microsoft 365 to retain an official transcript in the organization's tenant.

A calendar invitation or live captions alone does not create the official Microsoft 365 transcript. Turn on transcription separately when organizational policy and meeting roles permit it.

## Connect and import

1. Your Microsoft 365 administrator creates an organization-owned single-tenant Entra app registration using the linked runbook.
2. Open Better CaptionKeep → **All Settings**, find Microsoft 365, and expand **Administrator connection details**. In 6.0 the connection/import workspace is in this full browser tab, so setup and sign-in do not depend on keeping the toolbar popup open.
3. Enter the organization's Directory tenant ID and Application client ID, then select **Save Microsoft 365 setup**. These public identifiers stay in this browser profile.
4. Select **Connect Microsoft 365**, approve the one-time browser access request for Microsoft identity and Graph, and complete Microsoft sign-in. This optional access is not requested during extension installation or update.
5. Select **Refresh** to list up to five recent eligible Teams meetings.
6. Choose a meeting, or use the current-meeting/manual-link fallback.
7. Select **Import verified transcript**. Better CaptionKeep opens it in the normal viewer with the same local review and export functions.

Microsoft may need time after a meeting ends to finish producing the transcript. Refresh and retry if Teams still reports it unavailable.

## Administrator requirements

Better CaptionKeep does not operate a shared Entra app. Each organization owns a single-tenant app registration, grants the documented delegated permissions, and registers the exact Store redirect URI for each browser it deploys. Wildcard redirects do not work.

Store installations keep Store-assigned identities. The three governed Chromium unpacked lanes also have fixed identities. Register exact redirects for the identities actually tested; a Store identity or Chromium test redirect does not certify a different browser target. Live authentication and transcript import must be accepted separately for each supported browser.

See [Administrator deployment](Administrator-Deployment) and the full [Entra registration runbook](https://github.com/Mr-GraphnStaff/better-captionkeep/blob/master/docs/ENTRA-GRAPH-APP-REGISTRATION.md).

## Local capture remains independent

Microsoft 365 connection is optional. Displayed-caption capture does not require Microsoft sign-in or official transcription. The official import is a separate source; reviewed summaries and AI handoffs do not overwrite its original transcript. No shared publisher tenant, MCP helper, or automatic AI submission is required for 6.0.
