# Contributing to Better CaptionKeep

Thank you for helping improve Better CaptionKeep. The extension handles meeting captions, so reliability, privacy, and a narrow permission footprint take priority over speed.

## Before you start

- Search the existing issues before opening a new one.
- Use the bug form for broken behavior and the feature form for proposed capabilities.
- Never include real meeting transcripts, attendee details, credentials, private keys, Partner Center metadata, or other confidential data in an issue, commit, test fixture, or pull request.
- Report security vulnerabilities privately through GitHub's **Security > Report a vulnerability** flow.

## Branch and release model

- `master` is the protected production branch and represents the latest submitted or published store baseline.
- `release/<version>` is a temporary integration branch for a planned release.
- `feature/<short-description>` is for new behavior.
- `fix/<short-description>` is for bug fixes.
- `docs/<short-description>` and `chore/<short-description>` are for documentation and maintenance.

External contributors should fork the repository and create a topic branch in their fork. Do not work directly on `master`. Target the active `release/<version>` branch when an issue is assigned to an upcoming release; otherwise target `master`.

## Development setup

Use Node.js 20 or newer.

```text
npm install
npm run lint
npm run build
```

For functional testing, load the `teams-captions-saver` directory as an unpacked extension in Microsoft Edge. Test against the Teams web/PWA address covered by the issue.

## Pull requests

Keep each pull request focused on one issue or one closely related change set. In the pull request:

- Link the issue it addresses.
- Explain the user-visible behavior before and after the change.
- Identify every manifest permission, host match, storage, privacy, or export change.
- Describe the tests performed and distinguish automated checks from live Edge/Teams testing.
- Preserve the upstream MIT license and attribution.
- Keep local-only files out of Git, including `.captionkeeper.local.env`, PEM files, build archives, and real transcripts.

Automated checks must pass before merge. A maintainer may request live Teams reproduction or store-certification notes before accepting a change.

## Definition of done

A change is complete only when its acceptance criteria are met, automated validation passes, documentation is current, and any required live Edge/Teams scenario has been verified. Passing isolated tests alone does not establish Teams PWA compatibility.
