# Better CaptionKeep 6.0 Development Gate

## Status

Version 6.0 is active development on `codex/6.0`. It is not a release
candidate, certified browser build, Store submission, or public release.

The executable scope and gate sequence are maintained in
[`ROADMAP-6.0.md`](ROADMAP-6.0.md).

The working product applies the dark DAF-TECH theme to the real Manifest V3
popup and side panel, keeps one primary **Keep this meeting** action, restores
direct Teams, Meet, and Zoom launchers, and preserves the existing local
capture, Meeting Receipt, Evidence Board, export, privacy, and BYOAI engine.

## Browser commitment

Release certification must be recorded separately for:

- Google Chrome
- Microsoft Edge
- Brave
- Mozilla Firefox
- Opera
- Apple Safari on macOS

Shared Chromium packaging is not certification evidence for Chrome, Edge,
Brave, and Opera. Firefox and Safari require their own compatible packages and
live validation. Unsupported or untested browsers must remain explicitly
unverified.

## Storefront gate

Version 6.0 cannot be called release-complete until package and storefront
evidence agree for every distribution channel.

1. Freeze the candidate commit and package hashes.
2. Complete the versioned bundle under `store-assets/6.0/`.
3. Review title, short and full descriptions, screenshots, promotional art,
   privacy answers, and certification notes against the frozen product.
4. Upload and submit the immutable package through the governed release path.
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
