# Chrome Web Store publishing pipeline

Better CaptionKeep uses the Chrome Web Store API v2 to upload reviewed updates
without rebuilding them. Source still reaches `master` only through review, and
the Store workflow accepts only an existing published, non-prerelease GitHub
release whose checksums pass.

## Pipeline

`azure-pipelines.yml` runs on the private `Better CaptionKeep Private` agent
pool. It downloads the published GitHub release, verifies the tag, provenance,
and SHA-256 hashes, and selects the exact
`better_captionkeep-chrome-<version>.zip` package. Chrome credentials are read
at runtime from the private Azure Key Vault by the VM managed identity.

The safe default is `preflight`, which refreshes the OAuth token and reads the
item status without uploading or publishing anything. `upload-only` creates or
updates the Chrome Web Store draft without submitting it. `submit-auto` sends
the verified draft for review and makes it public automatically after Google
approval. `submit-staged` holds an approved revision until `publish-staged` is
run. Store listing, privacy, distribution, artwork, and visibility remain
explicit Dashboard controls.

`store-metadata/chrome.json` is the repository contract for Chrome permissions,
hosts, supported providers, single-purpose wording, privacy URL, and disclosure
text. `npm run store:metadata:check` compares that contract to the Chrome Store
manifest. A new permission or host therefore fails validation before a Store
upload instead of surfacing as an opaque submission error.

The pipeline verifies the release once, prepares Chrome and Edge drafts without
an approval pause, and uses the protected Azure DevOps environment
`bck-store-production` only for submission or publication.

## One-time repository and Google setup

1. Enable the Chrome Web Store API v2 in a Google Cloud project owned or
   controlled by the publisher.
2. Create an OAuth client and obtain a refresh token with the
   `https://www.googleapis.com/auth/chromewebstore` scope from the Google account
   that owns the Better CaptionKeep Store item.
3. Store `CHROME_CLIENT_ID`, `CHROME_CLIENT_SECRET`, and
   `CHROME_REFRESH_TOKEN` in `bck-release-kv-daftech` using the names documented
   in `deployment/azure/README.md`.
4. Keep `CHROME_PUBLISHER_ID` and `CHROME_EXTENSION_ID` as non-secret pipeline
   variables.
5. Never commit or print OAuth credentials, tokens, cookies, or downloaded
   Dashboard data.

The public Chrome extension ID is `nabjdlnkkaonnbnimnmnhjcbigceebml`. Obtain
the publisher ID from **Chrome Developer Dashboard → Publisher → Settings**.

## Release flow

1. Complete the 48-hour test window on the exact release candidate.
2. Merge the reviewed candidate, create its version tag, and let `release.yml`
   create the checksummed draft GitHub release.
3. Review and publish the GitHub release without replacing its artifacts.
4. Queue **Better CaptionKeep Store Release** in Azure DevOps with Chrome
   `upload-only` and the appropriate Edge preparation action.
5. Review the resulting Store draft and any required disclosure or listing
   changes in the Dashboard.
6. Queue the pipeline with either `submit-auto` for immediate publication after
   approval or `submit-staged` for a deliberate hold. Approve
   `bck-store-production` only after the draft and testing matrix are correct.
7. If staged, run `publish-staged` after Google approval. If automatic, verify
   public availability as soon as Google completes review.
8. Record the tag, commit, package hash, workflow run, review status, public
   date, and installed-upgrade evidence in the release record.

Do not upload another version while a Chrome submission is under review. Do not
use the Chrome or Edge test-identity ZIP for a Store submission.
