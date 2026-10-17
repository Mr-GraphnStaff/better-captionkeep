# Chrome Web Store publishing pipeline

## 6.0 development promotion guard (October 16)

The current 6.0 branch is development and cannot upload or submit. Before any
Store credential access/network call, mutating actions require a frozen accepted
candidate in `docs/release-state/6.0.json`, all five passed live certifications,
the pre-submission acceptance gates, the exact source HEAD and a clean source
worktree. Evidence/status views may change without changing the source commit.
The Store ZIP must match the candidate's channel digest; upload uses that same
verified byte snapshot even if the file changes during authentication.

`candidate.promotion` must bind `commit` and the complete candidate `hashes` map,
a nonempty `approvedBy`, the exact `targets.chrome` / `targets.edge`, and an
`unchangedSince` timestamp at least 48 hours earlier. It must also bind `uat`
(`passed: true`) and `permissionDelta` (`approved: true`) to the same commit/hash
map. Each has `report: {path, sha256}` identifying an unchanged repository-relative
acceptance report. These are release-owner attestations, not proof of identity or
an independently measured continuous freeze; retain the actual protected CI,
freeze observation and approvals. Never backdate evidence or infer acceptance
from green local tests. The present development record supplies none of these.

`submit-existing*` and `publish-staged` are disabled before credentials/network:
the implemented Store APIs do not establish that a remote draft/revision still
contains the approved ZIP bytes. An editable local receipt or same version is
insufficient. Use a newly verified upload-and-submit path only when separately
authorized. Staged submission can still request a hold, but its later publication
requires separately reviewed Dashboard handling or a future verified immutable
remote-revision implementation. The historical staged-automation steps below
are not currently executable. Read-only `preflight` and cancellation remain
available; neither authorizes publication.

Better CaptionKeep uses the Chrome Web Store API v2 to upload reviewed updates
without rebuilding them. Source still reaches `master` only through review, and
the Store workflow accepts only an existing published, non-prerelease GitHub
release whose checksums pass.

## Pipeline

`azure-pipelines.yml` runs on the private `Better CaptionKeep Private` agent
pool. It downloads the published GitHub release, verifies the tag, provenance,
GitHub-hosted artifact attestations, and SHA-256 hashes, and selects the exact
`better_captionkeep-chrome-<version>.zip` package. Chrome credentials are read
at runtime from the private Azure Key Vault by the VM managed identity.

The safe default is `preflight`, which refreshes the OAuth token and reads the
item status without uploading or publishing anything. `upload-only` creates or
updates the Chrome Web Store draft without submitting it. `submit-auto` sends
the verified draft for review and makes it public automatically after Google
approval. `submit-staged` holds an approved revision until `publish-staged` is
run. Store listing, privacy, distribution, artwork, and visibility remain
explicit Dashboard controls.

`cancel-review` uses the official Chrome Web Store API v2 cancellation method
to return an active pending review to draft state. Use it only when the current
submission must be corrected; it does not modify the public version or upload a
new package.

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
4. Confirm the release includes its signed Sigstore attestation bundle;
   the Azure release job fails closed if any artifact is unattested or came
   from a self-hosted GitHub runner.
5. Queue **Better CaptionKeep Store Release** in Azure DevOps with Chrome
   `upload-only` and the appropriate Edge preparation action.
6. Review the resulting Store draft and any required disclosure or listing
   changes in the Dashboard.
7. Queue the pipeline with either `submit-auto` for immediate publication after
   approval or `submit-staged` for a deliberate hold. Approve
   `bck-store-production` only after the draft and testing matrix are correct.
8. If staged, run `publish-staged` after Google approval. If automatic, verify
   public availability as soon as Google completes review.
9. Record the tag, commit, package hash, workflow run, review status, public
   date, and installed-upgrade evidence in the release record.

Do not upload another version while a Chrome submission is under review. Do not
use the Chrome or Edge test-identity ZIP for a Store submission.
