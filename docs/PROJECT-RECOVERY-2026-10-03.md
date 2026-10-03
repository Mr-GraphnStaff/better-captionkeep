# Project source and build recovery — October 3, 2026

## Authoritative working location

- Repository: `P:\Projects\better-captionkeep`
- Working branch: `codex/recover-5.3-project`
- Recovered source commit: `d904259e3a814f6b6fa0efd14c64f175e9fad1d0`
- Upstream review: draft PR #61, `release/5.3` to `master`.

The complete committed source and history were imported from yesterday's
`.integration-53` repository, rather than reconstructing source from unpacked
builds. The original repository remains intact. Existing local `.gitignore`
and `docs/public/` changes were preserved without committing them.

The recovered source includes full-meeting BYOAI evidence, durable archive,
cross-session search, reversible corrections and terminology, DOCX export,
Graph discovery across user calendars, and the existing provider quick starts.

## Project-local builds

- Existing configured Edge QA folder: `dist/edge-unpacked`.
- Frozen recovered snapshot: `dist/release-5.3-d904259e3a81`.
- Configured frozen Edge copy:
  `dist/release-5.3-d904259e3a81/edge-unpacked-qa-configured`.

All 149 files copied into the recovered snapshot matched their original SHA256
hashes. Every file in the configured Edge snapshot matched the existing live
Edge QA folder. The live QA folder was not rebuilt, moved, or overwritten.

Keep loading the existing Edge QA path: moving an unpacked extension can change
its identity and Microsoft OAuth callback. The generic browser-target builder
recreates its output folders; do not run it over the configured QA folder
without preserving and reapplying its local-only QA configuration. Do not put
local credentials, access tokens, or browser storage into commits.

## Fresh validation

- Automated tests: 156 passed, zero failed.
- Extension validation: passed.
- Store metadata and publication dossier consistency: passed for 5.3.0.
- Dependency security audit: passed after replacing the vulnerable `web-ext`
  packaging chain with `archiver`; no advisory suppression or forced downgrade
  was used.

This report identifies 5.3 as the next release candidate. It does not claim
fresh live browser UAT, Store submission, deployment, or approval to merge.

## Next work

1. Run live Chrome/Edge UAT against the recovered 5.3 feature set, including
   Microsoft connection, recent meetings, transcript import, archive/search,
   corrections, DOCX, and complete-meeting AI evidence.
2. Preserve the configured QA identity and local configuration when producing
   subsequent test builds; use this project repository for future source work.
3. Complete independent review and normal release gates before publication.
