# AI-assisted extension assurance standard

Status: Required for Better CaptionKeep 5.4 release evidence  
Owner: Better CaptionKeep release control  
Last reviewed: 2026-10-05

## Purpose

Better CaptionKeep uses AI-assisted engineering and is adding optional AI
workflows. Those are separate facts and require separate controls:

- **AI-assisted engineering** means an AI coding agent contributed source,
  tests, documentation, or analysis. It does not reduce the publisher's
  responsibility for the finished extension.
- **AI-powered behavior** means customer evidence may be released to a model or
  assistant after an explicit user review. It requires additional runtime
  privacy, security, provenance, and consent controls.

Microsoft publishes an Edge submission process and general Add-ons policies,
but no Edge-specific equivalent to Chrome's current coding-agent extension
guide was identified during the 2026-10-05 review. This standard therefore
turns the common Chrome and Edge obligations into one release gate.

## Required engineering evidence

Every AI-assisted change must have:

1. a named work item, scoped branch, and reviewable source diff;
2. no obfuscated or remotely executed extension code;
3. a reproducible build from tracked source and locked dependencies;
4. focused tests for the changed behavior plus the full regression suite;
5. Manifest V3, CSP, permission, host-access, and referenced-asset checks;
6. rendered Chrome and Edge validation for affected extension surfaces;
7. a record of limitations, failures, and unverified assumptions;
8. a human go/no-go decision based on the frozen candidate, not an agent's
   assertion that the work is complete.

AI-generated text, translations, tests, and code are drafts until these checks
pass. An unrun test suite, source inspection, or mock is not live validation.

## Required runtime AI controls

Any feature that sends meeting evidence to an AI or assistant must:

- remain optional and leave core capture, review, and export usable without it;
- show the exact evidence, context, destination, purpose, and source scope
  before release;
- require an affirmative user action for every submission;
- classify transcript text, notes, links, and returned model content as
  untrusted data rather than instructions;
- minimize payload size and default to scrubbed evidence;
- use an enrolled local bridge or authenticated customer-hosted endpoint, never
  an arbitrary destination;
- keep model and connector credentials out of the extension package and
  CaptionKeep storage;
- provide cancellation, expiration, idempotency, status, and receipt behavior;
- preserve the captured transcript as the authority and label AI output as a
  derivative with source-caption citations;
- require a separate customer-controlled confirmation before Jira, Microsoft
  365, or another connector creates or changes external data;
- support managed disablement and immediate destination revocation;
- disclose the external dependency and data flow in the product UI, privacy
  material, and both store listings.

## Cross-store release review

The candidate may advance only when all applicable items are evidenced:

| Area | Chrome and Edge evidence |
|---|---|
| Purpose | Listing and first-run experience accurately describe one coherent meeting-evidence purpose. |
| Permissions | Every permission and host is necessary, implemented, and justified in plain language. |
| Privacy | Local-only defaults and each optional transfer are accurately disclosed; opt-out stops future transfers. |
| External dependencies | Local bridge, customer endpoint, model, account, and connector requirements fail clearly and gracefully. |
| AI safety | Injection, oversized input, hostile links, stale selections, cross-tenant destinations, duplicate jobs, and forged receipts are tested. |
| Human control | Users review outbound evidence and separately confirm external mutations. No silent or background submission occurs. |
| Localization | Claimed languages provide a reasonably similar experience and clearly label uncertified AI-assisted preview translations. |
| Quality | Clean profiles show responsive startup, usable failure states, working documentation links, and no console/service-worker errors. |
| Package | Store ZIPs exclude secrets, development artifacts, MCP dependencies, and unreviewed executable code. |
| Release | The exact candidate digest completes the required unchanged window and written go/no-go review. |

## Current release boundary

Connected-assistant, automatic research, connector-action, and MCP runtime
features are not part of the release extension. Their earlier experimental
contracts and tests were removed pending a new product roadmap and architecture
decision. The general controls above remain the minimum bar if runtime AI work
is proposed again.

Current release evidence must cover only the capabilities actually packaged:
local capture and review, manual Evidence Board markers, exports, the existing
reviewed AI handoff, managed policy, and supported meeting providers.

## Authoritative references

- Chrome: [Build extensions with coding agents](https://developer.chrome.com/docs/extensions/ai/build_with_ai)
- Chrome: [Extensions and AI](https://developer.chrome.com/docs/extensions/ai)
- Chrome: [Chrome Web Store program policies](https://developer.chrome.com/docs/webstore/program-policies/policies)
- Microsoft: [Publish a Microsoft Edge extension](https://learn.microsoft.com/en-us/microsoft-edge/extensions/publish/publish-extension)
- Microsoft: [Developer policies for Microsoft Edge Add-ons](https://learn.microsoft.com/en-us/legal/microsoft-edge/extensions/developer-policies)

The linked store policies remain authoritative when this internal standard is
more permissive or becomes stale.
