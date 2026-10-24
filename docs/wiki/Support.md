# Support and Bug Reports

Open **All Settings → Feedback and support** for a focused [bug report](https://github.com/Mr-GraphnStaff/better-captionkeep/issues/new?template=bug_report.yml), [feature request](https://github.com/Mr-GraphnStaff/better-captionkeep/issues/new?template=feature_request.yml), or [translation report](https://github.com/Mr-GraphnStaff/better-captionkeep/issues/new?template=localization_report.yml). Search existing issues first and add sanitized evidence to a matching record.

## Identify the installed build

6.0 is in release qualification; a `6.0.0` version label alone is not a frozen candidate identity. Include:

- Browser name/full version, operating system and selected theme.
- Extension version and Store installation versus controlled Development/UAT package.
- Provider: Teams Web/PWA, Google Meet or Zoom Web.
- Exact loaded package/folder, source commit and ZIP digest when supplied by the build owner.
- Expected and actual behavior, steps and whether the problem repeats.
- Sanitized UI screenshot/error and affected tester case ID, if available.

The five 6.0 targets are Chrome, Edge, Brave, Firefox and Opera. Report each environment actually tested; do not infer another browser passes. MCP and Safari are deferred rather than missing setup steps.

For controlled Chromium qualification, the next package is `P:\Projects\better-captionkeep-dev\dist\uat`. Firefox needs its own package. Do not create another workspace or delete existing archives to troubleshoot.

## Protect private information

Never include meeting content, participant names, join links, meeting IDs, private tenant details, passwords, MFA codes, tokens, cookies, client secrets or keys in public issues. Use invented meeting data for reproductions. Theme/translation reports should identify the affected control/state and viewport without exposing a real meeting.

For sensitive vulnerabilities, follow [SECURITY.md](https://github.com/Mr-GraphnStaff/better-captionkeep/blob/master/SECURITY.md) instead of posting exploit details publicly.

Confirmed defects remain tracked even when fixed locally. The coordinator links the public issue to Azure Boards and distinguishes local repair, independent retest, published delivery and remaining acceptance. A passing unit test alone does not close a release defect.

See [Troubleshooting](Troubleshooting) for safe first steps and [Release status](Release-Status) for dated distribution evidence. Local archival of 5.4 folders does not withdraw public Store installations or erase historical incident records.
