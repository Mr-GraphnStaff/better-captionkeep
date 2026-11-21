# Connect Microsoft 365

Microsoft 365 connection lets BCK discover recent Teams meetings and request an official transcript directly from Microsoft Graph. It is optional: local displayed-caption capture works independently.

**Current acceptance:** employee sign-in and recent-meeting discovery worked in the recorded Chrome/Edge pilot. Official transcript import has not yet passed that pilot's acceptance. Use a synthetic authorized meeting to verify import in your environment before relying on it.

## Two transcript sources

| Meeting control | Result |
| --- | --- |
| Live captions | Words displayed by the meeting provider that BCK can preserve as a browser-local transcript. |
| Teams Start transcription | An official transcript retained by Microsoft 365 under the organization's policy. BCK's optional import requests that separate source. |

An invitation or live captions alone do not create Microsoft's official transcript. Transcription must be permitted and started in the meeting; Microsoft can need time afterward to finish processing it.

## Your administrator connects the organization once

Use [Administrator deployment](Administrator-Deployment) for the signed Administrator Setup 6.0.3 workflow. The administrator reviews the tenant, browser identities, pilot group, delegated permissions and Teams setting before deploying. The organization owns the employee transcript app; BCK does not supply a shared publisher-owned transcript application.

The normal guided deployment provides the tenant/client identifiers through browser policy. Employees do not need the administrator helper, an Azure signing account or a client secret. If your organization deliberately uses a manually registered app instead, its administrator must validate the exact redirect and delegated permissions before supplying its identifiers. That is a separate advanced configuration choice.

The new Intune console settings editor/bridge is not included in this release. Existing managed browser configuration and initial guided provisioning are separate from that later work.

## Connect your employee account

1. Open BCK → **All Settings** and find **Microsoft 365 / Verified Teams transcripts**. Use the full settings tab rather than depending on the toolbar popup staying open.
2. If the organization supplied the connection, use the Microsoft 365 Connect button shown by your build. Older builds can expose the identifiers in an administrator-details disclosure; newer presentation must not be assumed available until its extension release is verified.
3. Review the browser's optional Microsoft identity/Graph access prompt, then complete Microsoft work-account sign-in and any MFA/consent required by your organization.
4. Choose **Refresh** to retrieve up to five recent eligible Teams meetings. Select a meeting, use the current-meeting action or paste its join link in the fallback control.
5. When Microsoft has published an authorized transcript, choose the import action offered by the page. A successful import should open the transcript in the normal local viewer and create its local history entry. Verify both outcomes in the pilot; their availability is not established merely by seeing a meeting card.

Microsoft determines whether this account can access a particular meeting/transcript. The employee app requests delegated calendar, meeting and transcript permissions; it does not become an unattended tenant-wide collector. Some meetings visible in a calendar can still be inaccessible to the transcript API. [Permission details](Deployment-Security-and-Permissions#employee-microsoft-365-permissions).

## Connection details and redirects

Tenant and client IDs identify the organization's configuration; they are not passwords. Enforced values take precedence over local preferences. Changing a local field cannot override an organization's policy.

An administrator troubleshooting a redirect failure must use the exact redirect for the installed Store/build identity. Store, Dev and browser identities are not interchangeable. See [Troubleshooting](Troubleshooting) for AADSTS50011 and setup recovery; use the [Entra registration runbook](https://github.com/Mr-GraphnStaff/better-captionkeep/blob/master/docs/ENTRA-GRAPH-APP-REGISTRATION.md) only for an intentionally managed manual configuration.

## Data and disconnect

Microsoft retains its original transcript according to tenant policy. A successful BCK import creates a separate browser-local copy; the developer does not receive that transcript. Local notes, exports and deliberate AI handoffs have their own retention/destination boundaries.

Disconnecting clears the connector's local session access. It does not revoke tenant consent or delete Microsoft's transcript, an already-imported local copy, an export or an external handoff. Administrators handle access revocation and deployment removal separately. [Security and cleanup](Deployment-Security-and-Permissions#removal-and-access-cleanup).

## Need help?

Use [Support](Support) for sign-in, discovery or import failures. A plain description and sanitized error are enough to start. Keep transcripts, real join links, tenant/client identifiers, account details and deployment receipts out of public reports.
