# Better CaptionKeep 6.0 Release Record

> **October 16, 2026 — lead scope decision:** BYOMCP is removed from the shipping 6.0 feature set and deferred to a later release. Earlier MCP implementation and acceptance entries below are historical development evidence. Current 6.0 has no MCP connection, native-helper permission, tool-execution interface or helper distribution. Local capture, archive, exports, reviewed BYOAI handoff and historical receipt readability remain. Other release gates remain open.

<!-- captionkeep-6.0-status:start -->
> **6.0 delivery status:** 6.0.0 is candidate on `master`. Candidate frozen: yes.
> Live provider certification outstanding: chrome, edge, brave, firefox, opera.
> Open release gates: fullScopeAcceptance, accessibilityAndFailureUat, unchangedWindow, storeApproval, publicParity, installedUpgrade. Azure Boards epic: **#335**.
> Owner publication exception: David Farris; accepted unfinished gates: fullScopeAcceptance, accessibilityAndFailureUat, unchangedWindow; live certifications: chrome, edge, brave, firefox, opera. These checks remain unpassed.
> This status does not change historical 5.4 publication records.
<!-- captionkeep-6.0-status:end -->

## Owner decision — October 24, 2026

David Farris gave GO to proceed with release qualification, reported positive
UAT, and explicitly approved the bold DAF-TECH artwork. The approval is bound
to [seven image hashes](../store-assets/6.0/manifest.json). The
[preparation record](release-state/6.0-preparation.md) distinguishes completed
CI/package checks from remaining exact-candidate acceptance and rollout checks.
No new repository or parallel source folder is needed for promotion.

## GitHub publication — October 24, 2026

[Version 6.0.0](https://github.com/Mr-GraphnStaff/better-captionkeep/releases/tag/v6.0.0)
was published on GitHub at 03:47:23 America/Chicago (08:47:23 UTC), with 15
assets. The release tag identifies commit
`7470bbf1fe2347ce9c850ed7666ac326e79e7278`, promoted through protected `master`.
[Final Package run 40079055054](https://github.com/Mr-GraphnStaff/better-captionkeep/actions/runs/40079055054)
and the published asset digests verify all eight frozen hashes and 14
attestation subjects. Its seven ZIPs are byte-identical to the qualified
bounded-repair packages from run 40078175305. Provenance identifies both the
final tag commit and reviewed source `9dabe8174ad51ef07662e739ab0ee2affec5cd75`.

The GitHub API reports `isImmutable: false`; server-enforced release immutability
is not claimed. The approved source and artifacts are operationally frozen,
with hashes, provenance and attestations retained. **Chrome accepted 6.0 for
review and Microsoft accepted the Edge certification submission.** Certification
approval, current 6.0 public listings and installed-upgrade verification remain
pending. The machine state remains candidate
until the Store and upgrade outcomes are complete; owner exceptions remain
explicit and do not turn unfinished acceptance into passes.

## Store submission receipts — October 24, 2026

[Store pipeline 858](https://dev.azure.com/DAF-TECH/Better%20CaptionKeep/_build/results?buildId=858)
succeeded using tag `v6.0.0` at `7470bbf1fe2347ce9c850ed7666ac326e79e7278`.
Chrome accepted 6.0 for review at 08:58:01 UTC with state **PENDING_REVIEW**,
configured for immediate publication after approval. Microsoft accepted the
Edge update for certification at 08:58:33 UTC; the submission operation
succeeded, which is not certification approval.

Chrome's pre-submission API check still reported public **5.4.0**. Store
certification decisions, 6.0 public listings and installed-upgrade verification
remain pending. The machine record therefore stays candidate with those gates
false; the existing owner acceptance exceptions remain explicitly unpassed.

## Status

The final bounded repair candidate is frozen at source `9dabe8174ad51ef07662e739ab0ee2affec5cd75` with
all eight hashes in [`6.0.json`](release-state/6.0.json). Clean Package run
[40078175305](https://github.com/Mr-GraphnStaff/better-captionkeep/actions/runs/40078175305)
passed: 454 tests passed, none failed and three were explicitly skipped. Independent
review verified all seven shipping ZIPs differ from the preserved original only
in `content_script.js`; manifests and approved artwork are unchanged. All 14
artifact attestations verify the clean source. Every newly observed source gap
receives 15 seconds to recover; a visible dialog can extend the wait to at most
two minutes. The badge stays OFF while the source is missing, and a remaining
post-call dialog cannot indefinitely suppress archival. Actual Teams/PWA markup
and confirmations open beyond that bound remain live acceptance work. Frozen-head
and the final tag build verified the exact hashes again.

David explicitly authorized publication with the
[documented owner exception](release-state/6.0-owner-exception.md).
Full-scope/accessibility/failure acceptance, five exact-package live browser
certifications and the unchanged window remain unpassed and visibly waived.
The permission delta is zero. Store submissions are accepted; certification
approval, public parity and installed-upgrade verification remain separate
rollout outcomes.

The executable scope and gate sequence are maintained in
[`ROADMAP-6.0.md`](ROADMAP-6.0.md).

The working product applies the dark DAF-TECH theme to the real Manifest V3
popup, side panel, viewer, export, handoff, extras, and platform guidance;
keeps one primary **Open Live Workspace** action during capture; offers Teams,
Meet, and Zoom launchers when no meeting is active; and preserves local capture, Meeting Receipt,
Evidence Board, export, privacy, and BYOAI engine. Rolling Live Notes are
bounded, cited, pauseable, restart-safe, and locally revisioned.

**Historical development evidence — October 14, 2026:** the revised five-target build and packaging checks passed
with SHA-256 hashes, a CycloneDX SBOM and a pending browser/provider certification
record. The versioned Store art was regenerated. Full candidate provenance and
freeze remain separate gates; these development packages are not certified.
On the current Windows host, isolated renderer smoke passed in installed Chrome,
Edge and Brave. Firefox has a screenshot capture only, not an asserted renderer pass.
This is not provider certification. Opera is not
installed; its native runtime remains an explicit live-test gate.

The [Software Team review](SOFTWARE-TEAM-REVIEW-6.0-2026-10-13.md) records the
source findings and acceptance criteria. Rendered checks must assert behavior
and fail on defects; screenshot capture alone is not a pass.

## Browser commitment

Release certification must be recorded separately for:

- Google Chrome
- Microsoft Edge
- Brave
- Mozilla Firefox
- Opera

Shared Chromium packaging is not certification evidence for Chrome, Edge,
Brave, and Opera. Firefox requires its own compatible package and
live validation. Unsupported or untested browsers must remain explicitly
unverified.

Safari is not supported, packaged, certified, or required for 6.0. The lead
removed it on October 14, 2026, reserving reconsideration for a later major
version. [Archived groundwork](deferred/safari/README.md) is recoverable history,
not an active release target or current installation procedure.

## Storefront gate

Version 6.0 cannot be called release-complete until package and storefront
evidence agree for every distribution channel.

1. Freeze the candidate commit and package hashes.
2. Complete the versioned bundle under `store-assets/6.0/`.
3. Review title, short and full descriptions, screenshots, promotional art,
   privacy answers, and certification notes against the frozen product.
4. Upload and submit the exact frozen package through the governed release path.
5. Apply Microsoft Edge listing metadata and artwork manually in Partner
   Center. Microsoft's Edge Update REST API has no product-metadata endpoint.
6. Capture the Store submission or review receipt for package and metadata.
7. After approval, verify the public version, title, copy, artwork, privacy
   presentation, and installation page directly in every Store.
8. Verify an existing installation upgrades and passes the affected functional
   smoke test.

A package may be **Public** while its storefront is still stale. In that state,
the release remains open and must not be described as complete.

## Evidence to retain

- Candidate commit, tag, package hashes, SBOM, and provenance.
- Automated validation and security-audit results.
- Per-browser live test date, browser version, operating system, and result.
- Store package submission identifiers and certification results.
- Partner Center metadata-review receipt for Edge.
- Public-page captures showing approved copy and artwork.
- Existing-install upgrade and post-upgrade smoke results.
