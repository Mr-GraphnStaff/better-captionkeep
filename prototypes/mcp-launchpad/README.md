# Multi-MCP meeting launch pad — interactive concept

Decision prototype only; no production code or current helper configuration is
changed. All transcript, connections, vendor authorization and operation results
are synthetic. No AI, network calls, persistence, credentials, clipboard writes,
native messaging or provider operations. `connect-src 'none'` blocks page requests.
Official reference links open documentation only after a user click.

Try: select one of three meeting requests; choose among independent account
connections; review exact operation; confirm target and simulate. Connections
can add a second Cloudflare account, another vendor, a custom remote or local
fixture without replacing existing connections. Back/removal/reset invalidate
approval. Reload resets all fixtures. Tool names/payloads are UX placeholders,
not vendor MCP schema compatibility or claims of supported sign-in.

Current product/helper onboarding and issue170 remain unfinished. This prototype
is for choosing the aspiration and workflow, not release acceptance or a fix to
the installed extension. Existing paused implementation remains untouched.

Observed local in-app browser checks, October 15: default review shows exact
Staging destination with approval disabled until the target checkbox; approval
shows a simulated result. Adding Cloudflare Production increased three demo
connections to four without replacement; subsequent review identified Production
explicitly. Switching to the Engineering example returned to proposal editing;
Reset restored the three fixtures. JavaScript syntax check passed. These are
author-run interaction checks, not independent QA or real MCP integration tests.
The user-facing tab is left at the reset start state for exploration.
