# Chrome Web Store publishing pipeline

Better CaptionKeep uses the Chrome Web Store API v2 to upload reviewed updates
without rebuilding them. Source still reaches `master` only through review, and
the Store workflow accepts only an existing published, non-prerelease GitHub
release whose checksums pass.

## Workflow

`.github/workflows/publish-chrome.yml` is manual-dispatch only and uses the
protected `chrome-production` GitHub environment. It checks out the requested
tag, verifies that the tag matches the extension version, downloads every
immutable release artifact, verifies `SHA256SUMS.txt`, and selects the exact
`better_captionkeep-chrome-<version>.zip` package.

The safe default is `upload-only`, which creates or updates the Chrome Web Store
draft without submitting it. `submit-staged` sends the verified draft for review
with `STAGED_PUBLISH`; approval does not make it public until the product owner
publishes it from the Chrome Developer Dashboard. Store listing, privacy,
distribution, artwork, and visibility remain explicit Dashboard controls.

## One-time repository and Google setup

1. Enable the Chrome Web Store API v2 in a Google Cloud project owned or
   controlled by the publisher.
2. Create an OAuth client and obtain a refresh token with the
   `https://www.googleapis.com/auth/chromewebstore` scope from the Google account
   that owns the Better CaptionKeep Store item.
3. In GitHub, use the `chrome-production` environment and require the product
   owner as a deployment reviewer.
4. Add `CHROME_CLIENT_ID`, `CHROME_CLIENT_SECRET`, and `CHROME_REFRESH_TOKEN` as
   environment secrets.
5. Add `CHROME_PUBLISHER_ID` and `CHROME_EXTENSION_ID` as environment variables.
6. Never commit or print OAuth credentials, tokens, cookies, or downloaded
   Dashboard data.

The public Chrome extension ID is `nabjdlnkkaonnbnimnmnhjcbigceebml`. Obtain
the publisher ID from **Chrome Developer Dashboard → Publisher → Settings**.

## Release flow

1. Complete the 48-hour test window on the exact release candidate.
2. Merge the reviewed candidate, create its version tag, and let `release.yml`
   create the checksummed draft GitHub release.
3. Review and publish the GitHub release without replacing its artifacts.
4. Dispatch **Publish Chrome update** with `upload-only`.
5. Review the resulting Store draft and any required disclosure or listing
   changes in the Dashboard.
6. Dispatch the workflow again with `submit-staged`; approve the
   `chrome-production` environment only after the draft is correct.
7. After Google approval, run final smoke testing and publish the staged update
   from the Dashboard.
8. Record the tag, commit, package hash, workflow run, review status, public
   date, and installed-upgrade evidence in the release record.

Do not upload another version while a Chrome submission is under review. Do not
use the Chrome or Edge test-identity ZIP for a Store submission.
