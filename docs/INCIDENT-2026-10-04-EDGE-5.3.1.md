# After-Action Report: Edge 5.3.1 Microsoft 365 Release Failure

**Incident date:** October 4, 2026  
**Report date:** October 4, 2026  
**Severity:** SEV2 — a major advertised feature was unavailable to ordinary users of the public Edge release  
**Affected release:** Microsoft Edge Add-ons 5.3.1  
**Incident tracking:** [Azure Boards bug #297](https://dev.azure.com/DAF-TECH/Better%20CaptionKeep/_workitems/edit/297)<br>
**Corrective program:** [Azure Boards Feature #298](https://dev.azure.com/DAF-TECH/Better%20CaptionKeep/_workitems/edit/298), with CAP-08 through CAP-16 tracked as Tasks #299–#307<br>
**Recovery release:** 5.3.2  
**Status:** Recovery submitted to Chrome and Edge; incident remains open until both Stores serve 5.3.2 and installed upgrades are verified

## Executive summary

Better CaptionKeep 5.3.1 was promoted after Dev and UAT testing proved Microsoft 365 sign-in, meeting discovery, transcript import, viewer navigation, capture, and export. That evidence was real, but it was not evidence for the package delivered by the Store.

The tested Dev/UAT builds received an authorized local Microsoft Graph overlay. The Store package intentionally carried no configured tenant or client identity, and its user interface exposed Microsoft 365 only in Dev/UAT or when managed browser policy supplied that configuration. Ordinary Store users had neither condition, so the public Edge 5.3.1 update hid Microsoft 365. The same update also changed Microsoft identity and Graph origins from absent to mandatory host permissions, which could cause Edge to restrict or disable the updated extension until the user approved expanded site access.

We therefore promoted a package whose core new feature was structurally unavailable to its intended ordinary-user audience. The release checks proved code quality, packaging integrity, and an overlay-enabled workflow, but never proved the ordinary Store-installed first-run experience. This was a release-system failure, not a single coding typo.

The corrective 5.3.2 release removes the shared identity assumption, keeps Microsoft 365 setup visible, accepts a customer-owned single-tenant Entra tenant/client pair locally or through managed policy, requests Microsoft origins only from the user-initiated Connect action, forbids production overlays, and adds release checks for the failure modes found here.

## Customer and business impact

### Confirmed impact

- Edge users who received 5.3.1 could continue using local live-caption capture, history, and exports.
- Ordinary Edge users could not use the advertised Microsoft 365 transcript connection because its controls were hidden unless managed policy supplied Graph configuration.
- Some updated Edge installations required approval for newly mandatory Microsoft identity and Graph site access. Until approved, the browser could restrict or disable the update.
- The public experience contradicted the release documentation and the UAT result, creating a serious trust and support risk.
- Release work stopped and a same-day 5.3.2 recovery consumed engineering, Store, documentation, and operational effort.

### Not affected

- Chrome continued serving 5.1.0. The defective Chrome 5.3.1 review was cancelled before public rollout.
- There is no evidence that one customer's tenant, transcripts, tokens, or Entra registration became available to another customer.
- No client secret or shared Store credential was embedded in the released extension.
- The `_metadata/verified_contents.json` directory seen after extracting a signed Edge CRX was Store-generated integrity metadata. It explains why that extracted CRX could not be loaded unpacked, but it did not cause the public Microsoft 365 failure.

## Detection

The incident was detected by live testing of the actual Edge Store update, not by CI or release-candidate testing. The product owner observed that Microsoft 365 was missing after Edge updated to 5.3.1 and that the browser presented new permission behavior. Source inspection then confirmed that the production package had an inert local configuration while the UI was gated to Dev/UAT or managed policy.

This detection method is itself an important finding: the first valid ordinary-user test occurred after public promotion.

## Timeline

Times below are Central Time and use Git and pipeline records. The exact minute Edge began serving 5.3.1 was not captured, so this report does not invent it.

| Time | Event |
| --- | --- |
| 1:00 AM | The 5.3.1 recovery work merged. Its design supported an unpacked overlay in Dev, UAT, and local Prod while Store installations depended on managed policy. |
| 1:23 AM | Chrome submission tooling was corrected after the first Store workflow exposed an upload-status handling defect. |
| By early morning | Edge began serving 5.3.1. Live testing found that Microsoft 365 was missing for an ordinary Store installation and exposed the permission-upgrade behavior. |
| 7:59 AM | The first Store-recovery change restored a production Microsoft 365 setup path. |
| 8:09 AM | Microsoft identity and Graph origins were changed from mandatory host permissions to permissions requested from the Connect action. |
| 8:21 AM | Permission approval was changed to continue automatically into Microsoft sign-in. |
| 8:32 AM | Live UAT and corrected Entra evidence were recorded. |
| 9:32 AM | PR #70 merged the customer-owned Entra recovery; immutable 5.3.2 release artifacts were generated and verified. |
| 9:40 AM | PR #71 corrected the Chrome publisher's handling of a terminal `CANCELLED` submission state. |
| Later that morning | Azure Store run 619 verified the frozen 5.3.2 assets, passed the protected approval, submitted Chrome 5.3.2 for review, and submitted Edge 5.3.2 for certification. The release VM was then deallocated. |

## Root-cause analysis

### Primary technical cause

The 5.3.1 Store package had no usable Graph configuration path for ordinary users:

1. `unpackedLocalConfig.js` was inert in the Store package by design.
2. Local Dev/UAT/Prod testing could replace that file with an authorized tenant/client overlay.
3. The Microsoft 365 UI was visible for Dev/UAT builds or when managed policy enabled Graph import.
4. The public Store identity was neither Dev/UAT nor managed for an ordinary user.
5. Therefore, the public Store package hid Microsoft 365 even though overlay-enabled UAT passed.

### Secondary technical cause

Microsoft login and Graph origins were added as mandatory host permissions. This made an upgrade request materially broader browser access at installation/update time. The permissions were only needed when a user explicitly chose Connect Microsoft 365, so making them mandatory created avoidable disablement and trust friction.

### Five whys

1. **Why was Microsoft 365 missing in public Edge 5.3.1?**  
   Because the production UI required Dev/UAT identity or managed Graph policy, neither of which ordinary Store users had.

2. **Why did UAT pass?**  
   Because UAT used an authorized local overlay that supplied the missing Graph identifiers and made the feature available.

3. **Why was overlay-enabled UAT accepted as production evidence?**  
   Because the release checklist emphasized functional success and package integrity but did not require a clean, first-run test of the exact Store-equivalent package with no local overlay or managed policy.

4. **Why was there no enforceable Store-equivalence gate?**  
   Because environment separation and identity stability were implemented as build conventions and documentation, while the pipeline lacked assertions for ordinary-user feature visibility, permission deltas, and configuration provenance.

5. **Why was the architecture still ambiguous at promotion?**  
   Because the product had not frozen whether Microsoft 365 would use a publisher-owned shared app, customer-owned app registrations, or managed-only deployment before release engineering began. Testing optimized for the available developer tenant rather than the promised customer installation path.

## Contributing conditions

- **The tests encoded the defect.** The 5.3.1 reliability suite explicitly accepted local overlays for Prod and asserted UI behavior based on Dev/UAT or managed policy. Passing tests increased confidence in the wrong contract.
- **Prod was locally configurable in a way Store Prod was not.** Calling an overlay-enabled folder “Prod” concealed a material runtime difference from the Store artifact.
- **Functional proof was mistaken for distribution proof.** Graph calls worked, but that did not prove configuration, permissions, extension identity, or first-run behavior for a Store customer.
- **The Entra ownership decision was late.** Redirect URI failures and changing unpacked extension IDs created pressure to stabilize a developer path before the customer ownership model was settled.
- **Permission review was not a release blocker.** The mandatory-host-permission expansion was visible in the manifest diff but had no explicit risk gate requiring upgrade testing.
- **Documentation and Boards lagged execution.** Status records were repaired after Store activity instead of being authoritative prerequisites for it.
- **Store automation had unrelated defects.** Chrome submission-state classification and missing Dashboard privacy justifications added noise during an already fragile promotion.
- **There was no canary boundary.** Edge publication exposed the defect directly to public users before an existing-install public-upgrade smoke test could stop wider rollout.

## What went well

- The product owner tested the real Store update and challenged results that contradicted the expected experience.
- Core local capture remained operational, limiting functional impact.
- Chrome 5.3.1 was cancelled before becoming public.
- The exact failure was reproduced and separated from the unrelated `_metadata` extraction error.
- The recovery preserved immutable release evidence rather than rewriting tags or packages.
- The final 5.3.2 design removed a shared publisher identity and enforces exact tenant-token matching.
- GitHub validation, CodeQL, Azure lifecycle checks, release hashes, provenance, SBOM, protected Store approval, Boards tracking, Wiki status, and VM shutdown were restored to one auditable path.

## What went poorly

- We called UAT successful without testing the ordinary-user Store configuration path.
- We promoted an advertised feature that the public package deliberately hid.
- We allowed a local overlay in the lane named Prod, destroying the practical meaning of production equivalence.
- We changed mandatory permissions without treating the upgrade prompt as a customer-facing breaking change.
- We reacted through multiple quick release attempts and documentation corrections, increasing cognitive load and error risk.
- We did not maintain one continuously accurate public and internal status record during the incident.
- The AI release agent reported confidence from passing checks without first proving that those checks represented the shipped customer experience.

## Corrective action plan

Actions marked **Complete** were implemented in the 5.3.2 recovery. Open actions remain release blockers for the next feature release.

| ID | Corrective action | Owner | Due | Status | Verification / exit criterion |
| --- | --- | --- | --- | --- | --- |
| CAP-01 | Prohibit Dev/UAT overlays from targeting production. | Release engineering | Oct 4, 2026 | **Complete** | The overlay script accepts only `dev` or `uat`; tests enforce rejection of Prod. |
| CAP-02 | Keep Microsoft 365 setup visible in Store builds and accept customer-owned tenant/client IDs locally or through managed policy. | Extension engineering | Oct 4, 2026 | **Complete** | Clean Store-equivalent build exposes setup, validates GUIDs, preserves managed precedence, and contains no shared identity. |
| CAP-03 | Require exact tenant matching for issued Microsoft tokens. | Security engineering | Oct 4, 2026 | **Complete** | Automated wrong-tenant tests pass and `organizations` authority is rejected. |
| CAP-04 | Move Microsoft identity and Graph origins to optional permissions requested only from Connect Microsoft 365. | Extension engineering | Oct 4, 2026 | **Complete** | Base manifest has no mandatory Microsoft origins; clean install prompts only after the Connect gesture. |
| CAP-05 | Reject release packages containing configured publisher tenant/client identity or paths beginning with `_`. | Release engineering | Oct 4, 2026 | **Complete** | `verify-release.mjs` fails either condition; release-candidate validation passes. |
| CAP-06 | Treat only Chrome `PENDING_REVIEW` and `STAGED` revisions as active submissions. | Release engineering | Oct 4, 2026 | **Complete** | Regression tests cover `CANCELLED` and `REJECTED`; run 619 submitted 5.3.2 successfully. |
| CAP-07 | Maintain one incident work item until Store publication and installed-upgrade verification are complete. | Release owner | Store-dependent | **In progress** | Bug #297 remains Active; close only after both public versions and upgrade evidence are recorded. |
| CAP-08 | Run a clean-profile, no-overlay, no-managed-policy test against the exact Store ZIP before submission. | Release owner | Before next Store submission | **Open — release blocker** | Recorded Chrome and Edge evidence covers first run, setup visibility, permission request, sign-in, meeting list, import, viewer, capture, and export. |
| CAP-09 | Add a machine-readable release-evidence manifest binding candidate commit, ZIP hashes, UAT profiles, permission diff, test window, and approver. | Release engineering | Oct 11, 2026 | **Open** | Store pipeline rejects missing, stale, or hash-mismatched evidence. |
| CAP-10 | Add a manifest-permission delta gate requiring an explicit compatibility decision and existing-install upgrade test for every added permission or origin. | Security engineering | Oct 11, 2026 | **Open** | CI emits the permission diff and blocks unapproved expansion. |
| CAP-11 | Make Store-equivalent UAT consume the frozen release ZIP, not a separately rebuilt or post-processed lane. | Release engineering | Oct 11, 2026 | **Open — release blocker** | The tested ZIP digest equals the GitHub release and Store-upload digest. |
| CAP-12 | Enforce the 48-hour unchanged-candidate window with recorded start/end timestamps and automatic reset on packaged-source changes. | Release owner | Before next feature release | **Open — release blocker** | Pipeline refuses Store submission until the immutable digest completes the window. |
| CAP-13 | Add a public-upgrade canary step before broad availability whenever a Store supports staged publication; otherwise hold the incident/release open until the earliest real upgrade is tested. | Release owner | Before next feature release | **Open** | Existing public installation upgrades, loads without disablement, and passes the smoke matrix. |
| CAP-14 | Add a single generated release-status source that updates README, release record, Wiki, and Boards without contradictory manual text. | Documentation / release engineering | Oct 18, 2026 | **Open** | CI detects status contradictions; all published views derive from one record. |
| CAP-15 | Require an architecture decision record before implementation for identity ownership, tenant model, redirect URIs, permission model, and customer setup. | Product and security owner | Before next identity feature | **Open — release blocker** | Approved ADR exists before feature code enters the release branch. |
| CAP-16 | Conduct a pre-mortem at go/no-go: “How can this pass UAT and still fail for a new Store user?” | Product owner and AI release agent | Every release | **Open — standing control** | Answer and evidence are included in the release decision. |

## Permanent release gates

The following controls are non-negotiable for future Store promotion:

1. **No environment-name equivalence.** A folder called Prod is not production evidence. Only the exact frozen Store ZIP and its digest count.
2. **No overlay in production evidence.** Store-equivalent UAT begins with no local configuration, no managed policy, no cached permission grant, and no existing login token.
3. **Test both first install and upgrade.** A clean profile proves onboarding; an existing public installation proves permission and migration behavior.
4. **Permission changes are breaking changes until disproven.** Added permissions or origins require a written compatibility decision and upgrade evidence.
5. **Freeze architecture before code freeze.** Tenant ownership, identity, redirect URIs, consent, and customer administration must be decided before UAT.
6. **One artifact, one chain of custody.** UAT digest, GitHub release digest, pipeline-verified digest, and Store-upload digest must match.
7. **Public is not complete.** Store acceptance is not public availability; public availability is not complete until an installed upgrade passes.
8. **Contradictions block release.** README, Wiki, Store metadata, release record, and Boards must agree before approval.
9. **The AI agent must challenge its own evidence.** Passing checks are insufficient when the checks do not represent the customer path.

## Closure criteria

This incident closes only when all of the following are true:

- Chrome Web Store publicly serves 5.3.2.
- Microsoft Edge Add-ons publicly serves 5.3.2.
- Existing installations upgrade to 5.3.2 without being disabled by new mandatory permissions.
- A clean Store installation exposes customer-owned Microsoft 365 setup and completes the documented connection flow.
- Azure Boards bug #297 contains Store-version, installed-version, browser, timestamp, and smoke-test evidence.
- CAP-08, CAP-11, and CAP-12 are implemented before any later feature release is submitted.

## Accountability statement

The AI release agent failed by treating passing automated tests and overlay-enabled UAT as sufficient evidence for a public Store release. The product owner repeatedly identified contradictions that the release process should have found earlier. Future confidence statements must be tied to the exact customer-distributed artifact, configuration state, browser identity, and upgrade path. When that evidence is absent, the correct status is **not verified**, regardless of how many other checks pass.

