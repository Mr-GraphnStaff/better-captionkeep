# Better CaptionKeep enterprise security review record

Use this document as the adopting organization's review and approval record. Copy it into the organization's governed change or risk system and replace every placeholder. Do not record real transcript content, credentials, Store secrets, or personal data in this file.

## Review identity

| Field | Value |
| --- | --- |
| Organization | `<organization>` |
| Business sponsor | `<name or role>` |
| Security architect | `<name or role>` |
| Privacy/Legal reviewer | `<name or role>` |
| Endpoint engineering owner | `<name or role>` |
| Help-desk owner | `<name or role>` |
| Source revision | `<full Git commit SHA>` |
| Extension version | `<version>` |
| Store | `<Microsoft Edge Add-ons or Chrome Web Store>` |
| Store extension ID | `<32-character ID>` |
| Deployment profile hash | `<SHA-256>` |
| Package/release hash | `<SHA-256>` |
| Review date | `<YYYY-MM-DD>` |
| Next review date | `<YYYY-MM-DD>` |

## Proposed use

Describe the approved business purpose, intended users, supported meeting platforms, and meeting categories.

`<approved use>`

### Prohibited use

Identify meetings or data classes for which capture is not authorized, such as privileged legal matters, protected investigations, highly restricted research, payment-card authentication data, classified material, or sessions where notice/consent requirements are not satisfied.

`<prohibited use>`

## Architecture decision

- [ ] The reviewer read `docs/SECURITY-ARCHITECTURE.md`.
- [ ] The deployment uses an unchanged Store identity and official Store update URL.
- [ ] The extension is not represented as a recording consent mechanism, DLP system, regulated-data classifier, or compliance certification.
- [ ] The organization accepts that caption-provider DOM changes can cause incomplete transcripts.
- [ ] The organization accepts that local storage has no additional encryption layer supplied by the extension.
- [ ] The authoritative transcript and derivative cleaned/evidence data distinction is understood.

## Data-protection decisions

| Decision | Selected value | Owner/evidence |
| --- | --- | --- |
| Highest permitted meeting classification | `<classification>` | `<owner/link>` |
| Full-disk encryption required | `Yes/No` | `<evidence>` |
| Managed Windows account required | `Yes/No` | `<evidence>` |
| Managed browser profile required | `Yes/No` | `<evidence>` |
| Browser preference sync allowed | `Yes/No/Restricted` | `<evidence>` |
| Transcript history allowed | `Yes/No` | `<evidence>` |
| Maximum stored sessions | `<1-10>` | `<evidence>` |
| Session retention | `<1-365 days>` | `<evidence>` |
| Attendee capture allowed | `Yes/No` | `<Privacy/Legal decision>` |
| Clipboard release allowed | `Yes/No` | `<DLP decision>` |
| Local file export allowed | `Yes/No` | `<approved locations>` |
| Evidence email draft allowed | `Yes/No` | `<mail/DLP decision>` |
| AI handoff allowed | `Yes/No` | `<AI governance decision>` |
| Approved AI providers/workspaces | `<destinations or none>` | `<AI governance evidence>` |
| Scrubbed-only release required | `Yes/No` | `<evidence>` |

## Selected managed policy

Attach or link the exact reviewed `managed-policy.json`. Record differences from the committed standard or hardened profile.

```json
{
  "replace": "with the approved managed policy"
}
```

The reviewer confirms:

- [ ] Every policy key is supported by the extension's managed schema.
- [ ] The generated detection script reports the expected state on a pilot device.
- [ ] The remediation script changes only the selected browser's Better CaptionKeep policy subtree.
- [ ] Removed settings do not remain as stale registry values after remediation.
- [ ] Policy values shown in `edge://policy` or `chrome://policy` match the approved record.

## Threat and risk disposition

Record the disposition of every high risk in `docs/SECURITY-ARCHITECTURE.md`.

| Risk | Disposition | Control or acceptance owner | Due date |
| --- | --- | --- | --- |
| R-01 local storage and exports | `<mitigate/accept/avoid>` | `<owner>` | `<date>` |
| R-02 unauthorized release path | `<mitigate/accept/avoid>` | `<owner>` | `<date>` |
| R-03 provider DOM integrity | `<mitigate/accept/avoid>` | `<owner>` | `<date>` |
| R-06 attendee privacy | `<mitigate/accept/avoid>` | `<owner>` | `<date>` |
| R-07 Scrubby limitations | `<mitigate/accept/avoid>` | `<owner>` | `<date>` |
| R-08 repository review governance | `<mitigate/accept/avoid>` | `<owner>` | `<date>` |

## Pilot evidence

Use synthetic meeting content. Do not attach real meeting text.

| Test | Edge | Chrome | Evidence/reference |
| --- | --- | --- | --- |
| Store identity and force installation | `<pass/fail/N/A>` | `<pass/fail/N/A>` | `<reference>` |
| Managed settings locked in UI | `<pass/fail/N/A>` | `<pass/fail/N/A>` | `<reference>` |
| Teams Web caption capture | `<pass/fail/N/A>` | `<pass/fail/N/A>` | `<reference>` |
| Teams PWA caption capture | `<pass/fail/N/A>` | `<pass/fail/N/A>` | `<reference>` |
| Google Meet caption capture | `<pass/fail/N/A>` | `<pass/fail/N/A>` | `<reference>` |
| Zoom Web promoted-version capture | `<pass/fail/N/A>` | `<pass/fail/N/A>` | `<reference>` |
| Source-loss and recovery warning | `<pass/fail/N/A>` | `<pass/fail/N/A>` | `<reference>` |
| Session maximum and retention | `<pass/fail/N/A>` | `<pass/fail/N/A>` | `<reference>` |
| Attendee capture prohibition | `<pass/fail/N/A>` | `<pass/fail/N/A>` | `<reference>` |
| Clipboard prohibition | `<pass/fail/N/A>` | `<pass/fail/N/A>` | `<reference>` |
| Scrubbed-only export enforcement | `<pass/fail/N/A>` | `<pass/fail/N/A>` | `<reference>` |
| File-export prohibition, if selected | `<pass/fail/N/A>` | `<pass/fail/N/A>` | `<reference>` |
| AI-handoff prohibition or allowlist | `<pass/fail/N/A>` | `<pass/fail/N/A>` | `<reference>` |
| Evidence mail prohibition, if selected | `<pass/fail/N/A>` | `<pass/fail/N/A>` | `<reference>` |
| User deletion and uninstall behavior | `<pass/fail/N/A>` | `<pass/fail/N/A>` | `<reference>` |
| Intune unassignment and rollback | `<pass/fail/N/A>` | `<pass/fail/N/A>` | `<reference>` |
| Help-desk diagnostic procedure | `<pass/fail/N/A>` | `<pass/fail/N/A>` | `<reference>` |

## Supply-chain evidence

- [ ] The commit exists on the reviewed protected branch or immutable tag.
- [ ] Required validation and CodeQL checks passed.
- [ ] At least one independent approval was recorded.
- [ ] Release ZIP hash matches `SHA256SUMS.txt`.
- [ ] `release-provenance.json` names the expected revision and packages.
- [ ] The runtime CycloneDX SBOM was reviewed.
- [ ] The GitHub artifact attestation verifies for the repository and revision.
- [ ] The Store-distributed extension ID and version match the deployment record.
- [ ] No developer/private PEM, token, transcript, or local environment file is present.

## Operations and incident readiness

- [ ] Pilot and production rings have named owners.
- [ ] Browser and provider UAT cadence is documented.
- [ ] Release pause, Intune pause, removal, and rollback have been tested.
- [ ] Help desk knows how to gather sanitized version, policy, capture-health, and browser information.
- [ ] Security incidents use private vulnerability reporting.
- [ ] The organization has a process for exported files, clipboard history, mail, backups, and AI-workspace copies.
- [ ] Minimum-version enforcement will be enabled only after the safe Store version is verified available.

## Exceptions

| Exception | Business justification | Compensating controls | Owner | Expiry |
| --- | --- | --- | --- | --- |
| `<none or description>` | `<reason>` | `<controls>` | `<owner>` | `<date>` |

## Decision

- [ ] Rejected
- [ ] More evidence required
- [ ] Approved for time-bounded pilot
- [ ] Approved for staged production
- [ ] Approved with documented exceptions

Decision statement:

`<decision, scope, conditions, and expiration>`

| Approver role | Name | Date | Reference/signature |
| --- | --- | --- | --- |
| Business sponsor | `<name>` | `<date>` | `<reference>` |
| Security Architecture | `<name>` | `<date>` | `<reference>` |
| Privacy/Legal | `<name>` | `<date>` | `<reference>` |
| Endpoint Engineering | `<name>` | `<date>` | `<reference>` |
