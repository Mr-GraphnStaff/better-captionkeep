# Support and Bug Reports

Plain language and invented examples are enough; you do not need to diagnose the cause. For usage or deployment help, or to tell us what worked and what was confusing, [ask a question or share feedback](https://github.com/Mr-GraphnStaff/better-captionkeep/issues/new?template=feedback.yml). GitHub requires an account to submit a report.

Open **All Settings → Feedback and support** for a focused [bug report](https://github.com/Mr-GraphnStaff/better-captionkeep/issues/new?template=bug_report.yml), [feature request](https://github.com/Mr-GraphnStaff/better-captionkeep/issues/new?template=feature_request.yml), or [translation report](https://github.com/Mr-GraphnStaff/better-captionkeep/issues/new?template=localization_report.yml). Search existing issues first and add sanitized evidence to a matching record.

## Identify the installed build

The extension and Administrator Setup have separate versions. A Store installation and a local Development build can behave differently even when their visible extension version is the same. Include what you know; Unknown is acceptable:

- Browser name/full version, operating system and selected theme.
- Extension version and Store installation versus controlled Development/UAT package.
- Provider: Teams Web/PWA, Google Meet or Zoom Web.
- For Administrator Setup, the installer version from the downloaded filename, separately from the extension version.
- Expected and actual behavior, steps and whether the problem repeats.
- Sanitized UI screenshot/error and affected tester case ID, if available.

For deployment problems, say where it stopped: download, installation, Microsoft sign-in, approval, Intune delivery, employee connection or transcript import. You do not need a receipt path to open a report. The managed Windows installation route targets Edge and Chrome; identify the browser actually affected. MCP and Safari are deferred rather than missing setup steps.

For a local build load error, include the error text and say Development or QA. Do not delete working installations or tenant resources to obtain a reproduction. Follow [Administrator Deployment](Administrator-Deployment) and [Troubleshooting](Troubleshooting) for recovery.

## Protect private information

Never include meeting content, participant names, join links, meeting IDs, private tenant details, passwords, MFA codes, tokens, cookies, client secrets or keys in public issues. Use invented meeting data for reproductions. Theme/translation reports should identify the affected control/state and viewport without exposing a real meeting.

Do not upload raw setup receipts or full logs; they can contain organization configuration and resource identifiers. Maintainers will not ask you to post security-key PINs, device sign-in codes or credentials.

For sensitive vulnerabilities, follow [SECURITY.md](https://github.com/Mr-GraphnStaff/better-captionkeep/blob/master/SECURITY.md) instead of posting exploit details publicly.

Confirmed defects remain tracked even when fixed locally. The coordinator links the public issue to Azure Boards and distinguishes local repair, independent retest, published delivery and remaining acceptance. A passing unit test alone does not close a release defect.

## What happens after a report

1. Maintainers classify the report as a bug, question, feature request or duplicate and ask for missing information in the issue.
2. Confirmed bugs receive reproduction evidence and an affected-build record. Internal engineering work links back to the public issue; users do not need to file a second report elsewhere.
3. Corrections are reviewed and checked against the reported case. A local fix is not described as a published update.
4. When a fix ships, the issue records its released version and update route. You can retry that version and confirm the result in the same issue.

Subscribe to an issue for updates. Feedback informs priorities but is not a delivery promise. Support is maintainer-led; no enterprise response-time SLA is advertised.

See [Troubleshooting](Troubleshooting) for safe first steps and [Release status](Release-Status) for dated distribution evidence.
