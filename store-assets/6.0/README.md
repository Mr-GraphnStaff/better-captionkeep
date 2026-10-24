# Better CaptionKeep 6.0 Storefront Bundle

This directory is the controlled handoff for Store listing material. It must be
complete and reviewed before 6.0 promotion.

Generated artifacts:

- Five synthetic-data product screenshots for the 6.0 interface, each 1280 by
  800 pixels.
- Chrome small promotional tile, 440 by 280 pixels.
- Chrome marquee promotional tile, 1400 by 560 pixels.
- Edge-compatible screenshots and promotional artwork required by Partner
  Center at submission time.
- Approved title, short description, full description, privacy answers,
  certification notes, and browser-support wording.
- `manifest.json` containing filenames, dimensions, SHA-256 hashes, and release-owner approval bound to those artifact hashes.

Run `npm run store:assets:render` to regenerate the seven PNG files and their
manifest from `source.html`. The artwork uses only synthetic meeting content.
David Farris approved the seven bold DAF-TECH illustrations on October 24,
2026. This approval covers the hashes recorded in `manifest.json`; regeneration
requires renewed visual review and must reset approval. Artwork approval does
not certify an extension package or imply Store acceptance.

The Microsoft Edge Update REST API cannot upload or modify this listing
metadata. The reviewed bundle must be entered in Partner Center and the
resulting metadata-review receipt retained with the release evidence.

Development mockups, prototype captures, and screenshots containing customer
meeting data are not release artifacts.
