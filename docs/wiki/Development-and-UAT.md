# Development and controlled testing

This page is for source contributors and controlled testers. For normal installation, use [Installation](Installation) or the [browser-specific package guide](Browser-Installation-and-Microsoft-365). See [Release status](Release-Status) for available versions and acceptance limits.

## Source revisions and build output

Use a checked-out revision of [the repository](https://github.com/Mr-GraphnStaff/better-captionkeep). Follow its `AGENTS.md`, working-area rules, package scripts and applicable contribution instructions. A local directory name is not proof of the source commit, release state or approval.

The currently published source build scripts use the following relative outputs. A different work branch can have a different layout; inspect that revision rather than copying a machine-specific path from a report.

| Build target | Published-source output | Purpose |
| --- | --- | --- |
| Development | `dist/dev` | Controlled development build |
| UAT / Release Candidate | `dist/uat` | Chromium candidate for acceptance |
| Production targets | `dist/prod` | Staged target packages and release evidence |

Git branches and build directories are different concepts. The governed branch route is scoped work → `dev` → `qa` → `master`; see [Three-lane release workflow](Three-Lane-Release-Workflow). A package appearing in a Production-named directory does not establish publication or acceptance.

## Build and load a controlled package

1. Use the Node.js version required by the checked-out `package.json`; the current published CI uses Node.js 22.
2. Install locked dependencies with `npm ci` through the applicable checked working-area launcher.
3. Use `npm run build:dev` or `npm run build:uat` for the intended target, following that revision's scratch/output rules. Preserve existing installations, private overlays and recovery material before a build can replace them.
4. Open the intended browser's extension manager (`chrome://extensions`, `edge://extensions`, `brave://extensions` or `opera:extensions`), enable Developer mode and select Load unpacked.
5. Choose the complete target folder containing `manifest.json` from that build. Do not choose a ZIP, the source repository root or a parent distribution folder.
6. Verify the loaded path, version and extension identity. After a rebuild, save permitted in-progress work before reloading the extension and affected meeting page.

Do not rebuild an accepted frozen candidate and then reuse its old hashes or approval. A changed candidate needs renewed affected checks and a fresh identity record. Do not run Production-writing commands merely to inspect a development change.

## Firefox

Use the adapted Firefox package, not the Chromium UAT manifest. Current published source stages it under `dist/prod/firefox-unpacked`; downloaded releases can be extracted into any approved stable test folder. In Firefox, open `about:debugging` → This Firefox → Load Temporary Add-on and choose the target manifest. Temporary installation ends at restart and is not a signed Mozilla end-user distribution. Copy Firefox's actual identity callback for Microsoft 365 testing; do not construct a Chromium callback.

## Acceptance evidence

Record exact commit/package hashes, browser/OS/provider, synthetic test steps and observed outcomes. Sign-in, meeting discovery and official transcript import are separate checks. Live captions are not an official tenant transcript. Each browser/provider needs its own evidence; shared code or a successful package build does not certify it.

Keep real meeting data, private organization identifiers, credentials, raw deployment receipts and unsanitized screenshots out of public issues. Use [Support](Support) for a sanitized defect report and the private vulnerability route for sensitive security findings.

The [release process](https://github.com/Mr-GraphnStaff/better-captionkeep/blob/master/docs/RELEASE_PROCESS.md) and [current source record](https://github.com/Mr-GraphnStaff/better-captionkeep/blob/master/docs/release-state/6.0.3.json) preserve exact evidence, unpassed checks and any explicitly bound exceptions. An exception does not turn an unperformed test into a pass.
