# MCP onboarding repair — 6.0 acceptance contract

October 15, 2026. Public blocker: [#170](https://github.com/Mr-GraphnStaff/better-captionkeep/issues/170).
User acceptance: **FAIL**. A working remote transport does not make setup usable.

## Required user experience

One-time helper setup, then **Add service → Sign in → Verify → Use**.
The normal user must not author JSON, hashes, extension IDs, native manifests or
registry entries. A guide must tell the user what to click, why, what happens next
and how to recover. Advanced controls remain available without dominating setup.

The helper is installed once per browser/user, not separately for every server.
Adding a service must preserve existing connections and credentials. Never
overwrite the current native registration or silently replace the profile list.

The user reviews native permission separately from service sign-in and separately
from each exact operation. No automatic transcript upload, permission grant,
OAuth consent, stdio execution or tool call. Credentials stay in the helper.

## First implementation increment

The current engineering slice is deliberately narrower than acceptance:

- Settings collects service label and remote HTTPS address or local-server choice.
- It exports a nonsecret setup request with the packaged runtime identity, rather
  than asking a person to find/copy their browser ID or hand-author configuration.
- A separate interactive helper preparation tool prompts for local-only details,
  computes configuration/digests and generates matching browser binding and an
  installation plan. It does not silently register/install or execute a server.
- The guided flow returns the user to the existing reviewed import and genuine
  Connect controls. Generating a request, plan or binding is NOT connection proof.

These files are inert data until deliberately processed. A downloaded request is
untrusted; the local helper validates it and the user reviews its identity before
any local mutation. No executable or process arguments come from the browser.
Remote URL validation excludes credentials/query/fragment; the existing transport
continues to enforce its network boundary. No new localhost HTTP service or
credential-bearing browser form is introduced.

## Still required to close #170

1. An actually supported, verifiable helper distribution/install/removal route,
   with platform ownership/ACL checks and no manual registry editing.
2. Safe add-service/upgrade behavior for an existing helper: preserve existing
   profiles, credentials and registration; explicit review for any replacement.
3. Supported service authentication with explicit scope review, cancel/expiry
   recovery and no developer-supplied environment/credential editing in the
   ordinary journey. Cloudflare-specific OAuth is not generic OAuth support.
4. Clear separate states: preparation, installed helper, native connection,
   provider authentication, tool discovery, reviewed operation, verified result.
   No state may claim a later stage succeeded merely from an earlier one.
5. Fresh no-coaching tester success for local stdio and remote HTTP, including
   permission denial, wrong helper, cancel, expiry, restart and disconnect.
6. Browser-specific evidence for Chrome, Edge, Brave, Firefox and Opera. A Chrome
   development runtime used inside Brave is not Brave-specific certification.

The preparation increment must not be offered as a completed onboarding fix.
The lead's earlier failed test remains FAIL until a corrected actual build is
independently retested. Manual JSON import in the development bridge remains a
known friction point, even when the file itself is generated automatically.

## Test and reporting boundary

Use [M01–M10 in the tester packet](TESTER-ACCEPTANCE-6.0.md) plus preparation
regressions for rejected fields, modified identities, unsafe output paths,
existing-output refusal and no external effects by default. Test artifacts and
fixtures contain synthetic data only. Temporary filesystem tests do not establish
Windows native registration, OAuth completion, usability or release acceptance.
Keep any confirmed defect public and linked to Boards, with sensitive details
restricted. No DNS, directory or account operation is authorized by this repair.
