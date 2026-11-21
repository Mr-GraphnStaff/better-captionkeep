# Better CaptionKeep project folders

Owner-directed layout, November 11, 2026.

The project root is **`P:\Projects\Better CaptionKeep`**. It contains the source
repository, documentation, build tools, and three plainly named build folders:

| Folder | Purpose | Typical action |
| --- | --- | --- |
| `Dev` | Unpacked development build | `npm run build:dev` |
| `QA` | Unpacked release candidate for testing | `npm run build:uat` |
| `Production` | Released distribution packages and production build | Inspect release version and published hashes before use |

These are real directories, not shortcuts to an old `dist` tree. Source code
remains in `teams-captions-saver`; scripts and tests remain in their own folders.
There is one Git checkout. Development and QA do not have separate Git clones.

The existing npm command `build:uat` now writes `QA`; its name is retained for
compatibility. `build:prod`, `build`, `build:chrome-store`, and `build:targets`
are explicit production-writing commands. Development/QA builds and ordinary
`clean:dist` cleanup do not replace the retained Production release. Cleanups
preserve Production; do not run production-writing commands merely to check a
development change. Isolated build tests use the checked launcher's working run.

## Open the extension for testing

Choose **Load unpacked** in the browser's extension manager and select `Dev` or
`QA` beneath the project root. The stable manifest keys preserve the intended
extension IDs. An unpacked installation registered against an old path needs its
path updated in that browser. Store-installed extensions use their installed
copies and do not depend on the location of this source checkout.

## Released version preserved during migration

The November 11 move preserves the existing 6.0.0 distributions byte for byte:

| Package in Production | Published SHA-256 |
| --- | --- |
| `better_captionkeep-6.0.0.zip` | `338b974c7ca57b743a338ee5c38354dbcdabcb607816cbf22b391bfe8c114f55` |
| `better_captionkeep-chrome-6.0.0.zip` | `c8ebf139e9c388870bf70828bf2e7a23fe7cd1be8ef5af9529daf0730a4ec159` |

These identify the [published GitHub release](https://github.com/Mr-GraphnStaff/better-captionkeep/releases/tag/v6.0.0),
not current browser Store approval or installed-provider certification.

## Scratch and historical evidence

`working/` remains the only agent scratch location in the checkout, excluded
from Git and packages. The checked launcher and ownership record must resolve
to this project root. The migration inventory, before/after hashes, source
backups, and recovery receipts are retained under
`working/manifests/layout-migration-2026-11-11` and
`working/relocated/layout-migration-source-backups`.

The existing sibling `P:\Projects\better-captionkeep-sandbox` and archived 5.4
folders contain historical material. They are preserved. New temporary work
uses this project's checked `working/` runs. Historical release records retain
the paths used at the time; use this page for current paths.
