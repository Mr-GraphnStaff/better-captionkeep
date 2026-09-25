# Edge publishing pipeline

Better CaptionKeep uses a gated delivery path for Microsoft Edge Add-ons updates. Source changes still reach `master` only through a reviewed pull request. Automation builds and verifies an immutable release; it does not push source changes directly to the protected branch.

## Pipelines

`validate.yml` runs the complete release-candidate gate for pull requests and protected release branches: tests, manifest validation, all package builds, and release-provenance verification.

`release.yml` runs for version tags and can also be dispatched manually. It builds the Store and browser-test packages, records SHA-256 checksums and provenance, uploads a workflow artifact, and creates a draft GitHub release for a new tag. A person reviews and publishes the draft release.

`azure-pipelines.yml` runs on the private Azure agent, requires a published
non-prerelease GitHub release, and verifies every SHA-256 checksum before using
Microsoft's Edge Add-ons Update API. It never rebuilds a replacement ZIP.
`preflight` validates configuration without a Store mutation. `upload-only`
creates the draft. `submit` submits the verified draft for certification after
the `bck-store-production` approval.

The API can update a package and submit a draft, but it cannot update Store descriptions, keywords, screenshots, availability, properties, or privacy answers. Those remain explicit Partner Center review steps.

## One-time repository setup

For Store update automation:

1. In Partner Center, open **Microsoft Edge → Publish API**, enable the v1.1 experience, and create API credentials.
2. Store `EDGE_CLIENT_ID` and `EDGE_API_KEY` in the private Azure Key Vault using the names documented in `deployment/azure/README.md`.
3. Keep the public product identifier as the ordinary pipeline variable `EDGE_PRODUCT_ID`.
5. Never store Partner credentials in the repository, workflow files, release artifacts, logs, or extension package.

API keys have expiration dates. Rotate the Key Vault secret before expiry and test with `upload-only` before allowing a certification submission.

## Release flow

1. Merge a reviewed release pull request after validation and live acceptance.
2. Create and push a version tag matching `package.json` and `manifest.json`, such as `v5.0.1`.
3. Review the generated draft GitHub release, package checksum, and provenance, then publish the release. Published release artifacts are immutable and the workflow refuses to replace them.
4. Queue **Better CaptionKeep Store Release** with the same tag and Edge
   `upload-only`.
5. Review the resulting Partner Center draft and any required metadata changes.
6. Queue the pipeline with `submit` and complete certification notes. The `bck-store-production` approval is the final human gate before automation changes Partner Center.
7. Preserve the submitted tag, commit, package hash, workflow run, and Partner Center status in the release record.

Do not submit another Edge package while a submission is in review. Microsoft reports that case as `InProgressSubmission`, and the existing reviewed package must remain untouched.
