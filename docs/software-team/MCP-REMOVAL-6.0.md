# MCP removed from shipping 6.0

Owner decision: David explicitly chose removal until a later release on October 16, 2026. Earlier recommendations and the subsequent tentative retain direction are superseded. No later release is approved by this decision.

## Implemented boundary

Removed MCP Settings/setup/catalog and connected-action controls, worker imports/initialization/dispatch/materialization, optional nativeMessaging from both manifest sources, and unavailable user/admin controls. Normal build/packaging/source-parity checks exclude retained MCP modules, action dispatch contracts/jobs and helper distributions. CI/release promotion rejects stale helper payload and no longer requires helper install/audit/package artifacts. Explicit development source/scripts remain separate for future work.

Core capture, history/export, reviewed BYOAI On the Fly, and historical action-receipt read/delete remain. Existing helper installations, credentials, dormant configuration/jobs and source records are not purged. No uninstall, registry/authentication change, publication, Store submission or tag occurred.

## Executed verification

- Coordinator full serial developer suite: **577 passed; zero failures; zero skips**. Executed node --test --test-concurrency=1 tests/*.test.cjs. This includes retained standalone deferred-module regressions, not MCP acceptance.
- Lint, Store metadata contract/dossier (six required, zero optional permissions), release-status check and eight-page surface audit passed. Root dependency audit: zero vulnerabilities.
- Normal Dev/UAT/Prod lanes, all five browser targets, both Store packages and Edge Intune bundle rebuilt. scripts/verify-release.mjs passed, recording mcpIncluded:false, source/shipping tree digests and dirty working-tree provenance. No candidate freeze claimed.
- Independent QA executed 58 focused regressions and independently inspected real UAT/browser/store artifacts. No blocking removal defect.
- Independent security executed eight focused compatibility tests, four injected rejection fixtures, and read all seven rebuilt ZIPs through project verification and independent ZIP access. No actionable removal finding.
- Exact deferred shipping-test list lives in scripts/test-release.mjs: 53 shipping files, 20 deferred implementation files; historical receipt compatibility and removal acceptance remain required. Default npm test still contains the retained developer suite. Six obsolete worker/UI cases and one earlier catalog rendered case were preserved explicitly as historical fixtures; they are not claimed as current execution.

## Exact artifacts (SHA-256)

| Artifact | SHA-256 |
| --- | --- |
| UAT manifest | fe70eb1f8512e73108721a3d794972746ae8a3c88cc4a9a16aa287e128691d1c |
| Edge Store ZIP | 544f1b33b83ceff24b68e7c1103bf24fcafed76ec8a3e17de0b54804ef2cd143 |
| Chrome Store ZIP | 06140f8dd0ef74dcb7d8bb5486810ee1213a46704b7999861536d745d0aa31ee |
| Chrome browser ZIP | 17159166c54d6f041b85a38b2d6a7996f24f10ae4ed36de188f44b733f6c80ec |
| Edge browser ZIP | c6454dc7f915942493f3e45ff3d435ee35e299f9882efc676b7eadf7bf6da4b3 |
| Brave ZIP | ccf57c8e94f8a729eeb1a99c4683086a33931f2e73f699ea102c1be1dda7c08b |
| Opera ZIP | 85cb5ca97cca038c2ebb32bba790738f6cd800ea870c47ff911b28b44aade4ab |
| Firefox ZIP | f3283edf04ec3aa24aa58be2acb4febc582bf983eacd8689374829abe40937a8 |

## Preservation and limits

The exact before-edit source snapshot, including existing dirty/untracked work, was preserved and integrity checked outside this checkout. See [deferred scope](../deferred/byomcp/README.md). Existing user work was not reset. Current changes remain local on codex/6.0 with earlier work still present; generated provenance truthfully marks the working tree dirty.

Current artifact boundary is verified. Morgan independently matched the rebuilt UAT manifest/path on daf-999, but its supported control inventory returned apps=[] and browsers=[]; it could not establish that a reload would avoid interrupting active work. No reload was attempted. Safe remaining step: when no capture or unsaved extension work is active, open brave://extensions on daf-999 and select Reload for Better CaptionKeep - UAT Release Candidate. Then inspect Settings/Workspace. Installed UI verification, live provider acceptance, Store visual revalidation, candidate freeze and the other normal release gates are separate. Removing MCP is not overall 6.0 release certification. Chrome Store packaging cleans its intermediate staging; its final ZIP, rather than an absent staging directory, was inspected.

The remote DAF-999 Development worker has received the final owner decision, completed checks, preservation boundary and safe installed-Brave reload/verification assignment. It must not resume MCP repair or claim installed UI refreshed from disk checks alone.
