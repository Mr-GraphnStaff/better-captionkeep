# Microsoft Entra App Registration for Verified Teams Transcript

Status: **customer-owned, single-tenant setup for 5.3.2 and later**.

Better CaptionKeep does not operate a shared Microsoft Entra application. Each organization that wants **Verified Teams Transcript** registers its own application in its own tenant, grants only the documented delegated permissions, and enters the resulting tenant ID and client ID in Better CaptionKeep. Those two identifiers remain in that browser profile, or may be supplied through managed browser policy.

## What this registration does

The registration gives the extension a public identity for interactive delegated Microsoft Graph access inside one organization. An administrator controls consent and Teams transcript access. A signed-in user must still explicitly select and import a transcript that Microsoft authorizes that user to access.

The extension uses OAuth 2.0 authorization-code flow with PKCE through `chrome.identity.launchWebAuthFlow`. Do not create or provide a client secret, certificate private key, tenant password, application-only credential, or exported refresh token.

## Before creating the registration

Record the tenant owner, app owner, browsers to support, Better CaptionKeep extension IDs, exact redirect URIs, approved permissions, and rollback owner. The extension shows its runtime redirect URI in **Administrator connection details**. It has this form:

```text
https://<extension-id>.chromiumapp.org/microsoft
```

Known Better CaptionKeep identities are:

```text
Dev unpacked:  https://pjpibiimicedkckleehljlklmblkacph.chromiumapp.org/microsoft
UAT unpacked:  https://ecpjboeanaehianibdbgijldbikdgkhm.chromiumapp.org/microsoft
Local Prod:    https://nffdfdkkbbbmngcibbeindpjlfkcnikg.chromiumapp.org/microsoft
Chrome Store:  https://nabjdlnkkaonnbnimnmnhjcbigceebml.chromiumapp.org/microsoft
Edge Store:    https://edefcbdhahfolgkoamkbknjppojpaffk.chromiumapp.org/microsoft
```

Register only the identities the organization will use. Store and governed unpacked IDs remain stable across normal upgrades, so the redirect does not change for every release. An ad hoc unpacked folder can receive a different extension ID and is unsupported.

## Create the customer-owned single-tenant application

1. In the Microsoft Entra admin center, open **Identity > Applications > App registrations > New registration**.
2. Use a recognizable organization-owned name such as **Better CaptionKeep - Contoso**.
3. Select **Accounts in this organizational directory only**.
4. Leave the initial redirect URI empty and select **Register**.
5. Record the **Directory (tenant) ID** and **Application (client) ID**. They are public configuration identifiers, not passwords.
6. Assign at least two organization-controlled owners to the registration where policy permits.

This design does not let one customer access another customer's tenant. Microsoft issues tokens only for the configured tenant, the token tenant must exactly match that tenant ID, tenant consent remains authoritative, and Graph still evaluates the signed-in user's access.

## Configure Chromium redirect URIs

1. Open **Authentication** on the new registration.
2. Select **Add a platform > Single-page application**.
3. Add the exact `https://<extension-id>.chromiumapp.org/microsoft` URI for each approved Better CaptionKeep identity.
4. Enable **Allow public client flows** if the tenant requires that setting for this browser-extension flow.
5. Do not add wildcard redirects.
6. Do not enable implicit access-token or ID-token issuance.
7. Do not create a client secret or certificate for the extension.

If Entra returns `AADSTS50011`, compare the URI shown in the error with the URI displayed by Better CaptionKeep and add that exact value to the app registration. Do not use a wildcard, relay, or embedded secret.

## Add Microsoft Graph delegated permissions

Under **API permissions > Add a permission > Microsoft Graph > Delegated permissions**, add only:

| Permission | Purpose |
| --- | --- |
| `Calendars.ReadBasic` | Show up to five recent Teams meetings using only basic event and join information |
| `OnlineMeetings.Read` | Resolve the specific Teams meeting the user selected |
| `OnlineMeetingTranscript.Read.All` | List and retrieve an official transcript the signed-in user is permitted to access |

`openid`, `profile`, and `offline_access` are protocol scopes requested during authentication. Do not add broader calendar, mail, files, chat, directory, recording, write, or application permissions.

Grant administrator consent according to the organization's policy. Retain a sanitized permission record, never tokens or transcript content.

## Enable the Teams transcript API control

Microsoft Graph permission alone is insufficient. In the Teams admin center:

1. Open **Meetings > Meeting settings**.
2. Under **Transcript API access**, enable Microsoft Graph access for the approved scope.
3. Decide whether speaker attribution is allowed.
4. Record the setting, scope, approver, date, and rollback plan.

Teams transcription must actually run during the meeting. Live captions and a calendar invitation do not by themselves create an official tenant transcript.

## Configure Better CaptionKeep

For an individual installation:

1. Open Better CaptionKeep.
2. Expand **Administrator connection details**.
3. Enter the Directory tenant ID and Application client ID.
4. Select **Save Microsoft 365 setup**.
5. Select **Connect Microsoft 365**, approve the browser's optional Microsoft access request, and sign in with an account from that tenant.

The identifiers are stored in `chrome.storage.local`; they are not browser-synchronized, included in settings exports, sent to Better CaptionKeep, or embedded in Store packages. Access and refresh tokens remain in browser session storage.

For managed deployment, set all three policies:

| Managed setting | Value |
| --- | --- |
| `enableGraphTranscriptImport` | `true` |
| `graphTenantId` | Directory tenant GUID |
| `graphClientId` | Application client GUID |

Managed values take precedence and lock the local setup fields. Setting `enableGraphTranscriptImport` to `false` disables the connection.

## Validation

Use a synthetic scheduled Teams meeting with no confidential or personal content.

1. Start Teams transcription and verify participants receive the Teams notice.
2. End the meeting and wait for Microsoft to produce the transcript artifact.
3. Connect Better CaptionKeep with the approved organizational account.
4. Refresh recent meetings, select the synthetic meeting, and import its transcript.
5. Confirm it opens in the normal viewer, is labeled Microsoft Graph, and retains source provenance separately from local live capture.
6. Verify disconnect, revoked consent, missing transcript, wrong tenant, expired session, and disabled transcript API all fail closed.

## Expected failures

| Condition | Expected result |
| --- | --- |
| Tenant ID or client ID missing/invalid | Connection remains disabled and setup guidance is shown |
| Redirect URI absent | Microsoft returns `AADSTS50011`; add the exact runtime URI |
| Wrong-tenant token | Better CaptionKeep rejects the session |
| Consent or Teams API access absent | Microsoft denies the delegated request |
| Meeting has no official transcript | No import is created |
| User lacks access to the meeting | Graph denies access or returns no eligible transcript |
| Token expires or is revoked | Reauthentication is required |

## Rollback

1. Disconnect Microsoft 365 and clear the local setup, or disable/remove the three managed policies.
2. Revoke user sessions and admin consent if required.
3. Disable Teams transcript API access if it was enabled only for Better CaptionKeep.
4. Delete the organization-owned app registration after retaining the approved change record.

Rollback prevents future retrieval. It does not delete official transcripts retained by Microsoft or local sources the user previously retained.

## Authoritative references

- [Chrome Identity API](https://developer.chrome.com/docs/extensions/reference/api/identity)
- [Microsoft identity platform authorization-code flow](https://learn.microsoft.com/en-us/entra/identity-platform/v2-oauth2-auth-code-flow)
- [Microsoft Graph calendar view](https://learn.microsoft.com/en-us/graph/api/user-list-calendarview?view=graph-rest-1.0)
- [Microsoft Graph list transcripts](https://learn.microsoft.com/en-us/graph/api/onlinemeeting-list-transcripts?view=graph-rest-1.0)
- [Teams transcript API tenant control](https://learn.microsoft.com/en-us/microsoftteams/meeting-transcript-api-access)
- [Microsoft Graph permissions reference](https://learn.microsoft.com/en-us/graph/permissions-reference)
