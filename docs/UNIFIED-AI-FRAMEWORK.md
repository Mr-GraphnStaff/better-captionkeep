# Unified AI Framework

Status: **On the Fly workspace-adapter foundation implemented for 5.4; automatic return remains future work**

Last updated: 2026-10-10

## Product decision

Better CaptionKeep should present one AI experience for every provider-neutral
AI task. Ordinary users must not deploy Azure resources, run an MCP server,
install a native bridge, enter an API endpoint, or obtain an API key.

**BYOAI is the umbrella, not merely the browser-workspace adapter.** A user or
organization may bring an existing AI web workspace, an on-device model, or a
customer-owned hosted assistant/gateway. The unifying rule is that CaptionKeep
does not force a DAF-TECH model account or service. The owner of the AI chooses
its identity, provider, hosting, retention, tools, and cost boundary.

The default path is **Use my AI**: the extension prepares a bounded, reviewed
prompt, copies it only after an explicit user action, and opens the user's
chosen AI workspace. The user remains signed in through the provider's normal
browser session, confirms the workspace, pastes, reviews, and decides whether
to send the prompt.

MCP is not an assistant and is not part of this default path. It may be used
later behind a DAF-TECH or customer-managed gateway when a task needs governed
tools or connectors.

## One user experience

The user makes one choice in Settings:

- **Automatic (recommended):** use on-device browser AI when it can perform the
  task; otherwise open the user's chosen AI workspace with a reviewed prompt.
- **On-device only:** never release meeting text to an external AI provider.
- **Use my AI:** always use the selected ChatGPT, Claude, Copilot, Gemini, or
  other supported workspace adapter.
- **Connected BYOAI:** use a user- or organization-owned assistant/gateway after
  its adapter, authentication, permissions, disclosure, and return contract
  pass live validation. This may be Azure OpenAI, OpenAI, Anthropic, Bedrock,
  Vertex AI, Microsoft Foundry, or a governed internal/MCP-backed service.
- **Organization managed:** an administrator selects the allowed execution
  modes and destinations through browser policy.
- **Off:** disable all AI actions without affecting capture, Evidence Board,
  history, or export.

Provider setup is progressively disclosed. A normal user chooses a provider
and signs in on that provider's own site. Provider-specific fields appear only
when needed. There is no generic "assistant URL" field.

## Provider-neutral task model

Every AI feature calls the same local orchestrator with a task, source evidence,
and privacy mode. Provider adapters do not own product features.

| Task | Preferred execution | Web access required | Expected output |
| --- | --- | --- | --- |
| Research selected words | User's AI workspace | Yes for current research | Answer with visible sources in the provider workspace |
| Explain selected words | On-device, then user's AI | No | Short explanation |
| Draft a live-chat reply | On-device, then user's AI | No | Editable draft; never sent automatically |
| Summarize a meeting | On-device for bounded evidence, then user's AI | No | Source-linked reviewed summary |
| Extract decisions, actions, questions, and risks | On-device, then user's AI | No | Proposed Evidence Board derivatives |
| Translate | Browser Translator API | No after model download | Separate machine-translated derivative |
| Research with automatic return | DAF-TECH or organization gateway only | Yes | Normalized answer and citations in the Evidence panel |

Raw captions remain immutable. AI output is always a derivative linked to the
caption identifiers supplied to the task.

## Architecture

```text
Selected captions or Evidence Board items
                  |
        Privacy and policy boundary
      (scope, Scrubby, preview, consent)
                  |
          Local AI orchestrator
        /           |             \
 On-device AI   Workspace adapter   Governed gateway
 Chrome/Edge*   existing user plan  optional future
        \           |             /
             Normalized derivative
       answer, source IDs, citations, warnings
```

`*` Chrome's Prompt API is available to extensions from Chrome 138. Microsoft
currently documents Edge's Prompt API as a developer preview, so on-device
execution must remain feature-detected rather than required.

## Workspace adapters: the zero-infrastructure path

A workspace adapter has a small, packaged contract:

```text
id
displayName
acceptedTasks
buildReviewedPrompt(task)
resolveDestination(settings)
preloadMode: deep-link | clipboard | page-fill
requiresWorkspaceConfirmation
```

The historical implementation in commit `785e965` and merged PR #9 used the
Anthropic Console form:

```text
https://console.anthropic.com/workbench
  ?input=<reviewed prompt>
  &organization=<Anthropic organization ID>
```

That implementation opened the selected Anthropic organization and populated
the Workbench input. It did not require MCP, Azure, a native host, or a
CaptionKeep assistant service. It is valid product history, but it is no longer
a current integration contract: Anthropic retired legacy Workbench in August
2026. The old URL now redirects to `platform.claude.com/playground`, and the
redirect observed on October 10 discards the old query parameters. Anthropic's
current Playground documentation does not document a prompt-prefill deep link.

The organization ID is routing information, not an authentication secret. The
provider's existing signed-in browser session authorizes the workspace. It is
shown only for the Anthropic Console adapter and is stored as a provider setting,
not described as an assistant connection.

Other adapters may use provider-supported or live-verified prompt deep links.
Where no current deep link exists, a user-approved packaged page adapter may
fill—but never submit—the provider's prompt box after opening the saved
enterprise workspace. This requires a narrow optional host permission and live
compatibility testing. If neither method is reliable, the adapter opens the
approved workspace and copies the reviewed prompt. Better CaptionKeep must
never submit the prompt, scrape the answer, or pretend a return channel exists.

Deep links and provider-page selectors are provider-controlled compatibility
surfaces, not stable APIs. Each adapter therefore needs a live test and a
clipboard fallback. Because a query-string preload places the selected text in
browser navigation history and provider logs, the extension must:

- send only the user-selected excerpt and the explicit question;
- default to Scrubby-cleaned text;
- never put a full meeting transcript in a URL;
- show the destination and disclosure before first use;
- require the user's final Send action inside the provider;
- allow administrators to disable URL preloading while retaining reviewed copy.

## On the Fly

**On the Fly** is the meeting-time entry point into the same framework, not a
separate assistant product.

1. Select caption text or one or more source-linked captions.
2. Choose **On the Fly** and a task such as Research, Explain, or Draft reply.
3. Review the exact excerpt, question, privacy mode, and destination.
4. Explicitly choose **Copy + open** for an approved AI workspace.
5. Confirm the workspace, paste, review, and send inside the AI workspace.

With the zero-infrastructure workspace path, the result stays in the user's AI
workspace. Returning a cited answer automatically to the Evidence panel is a
different capability and must not be promised until a real API-backed service
or governed enterprise gateway exists.

## Connected BYOAI and optional automatic return

Connected assistance is part of BYOAI. Automatic return uses the same task and
result contracts but requires a real customer- or user-owned backend. It is
optional and never required for core extension use.

- **User-hosted assistant:** an individual may connect infrastructure they
  already operate, subject to a supported adapter and explicit disclosure.
- **Organization gateway:** an enterprise may route tasks to Anthropic,
  OpenAI, Azure OpenAI, Microsoft Foundry, Amazon Bedrock, Google Vertex AI,
  or an approved internal gateway.
- **MCP:** if used, it lives behind the gateway as a tool/data connector. It is
  not the model, authentication method, or user-facing destination.

Provider credentials stay on the connected gateway. They are never placed in
Store packages. Anthropic's API organization identifier does not replace an API
credential; Claude Team/Enterprise workspace seats and Anthropic API Console
access are separate integration paths.

## Common request and result contracts

```json
{
  "task": "research.selected_text",
  "requestId": "local UUID",
  "question": "What does this claim mean and is it current?",
  "evidence": [
    {"evidenceId": "C0042", "speaker": "Jordan", "text": "..."}
  ],
  "privacyMode": "scrubbed",
  "locale": "en-US"
}
```

```json
{
  "status": "succeeded",
  "answer": "...",
  "claims": [{"text": "...", "citationIds": ["S1"]}],
  "citations": [{"citationId": "S1", "title": "...", "url": "https://..."}],
  "sourceEvidenceIds": ["C0042"],
  "execution": "on_device | workspace | daf_tech | organization",
  "warnings": []
}
```

Workspace adapters produce only an outbound prompt and destination; they do not
fabricate a successful result object. On-device and gateway adapters may return
the normalized result when they can prove the task completed.

## Cost model

Local translation and supported on-device AI have no model API charge. Workspace
adapters consume the user's existing provider plan and create no DAF-TECH model
bill. A future DAF-TECH research service must use per-install and global spend
limits, disclose its provider boundary, and fail back to **Use my AI** rather
than silently charging or dropping the action.

As of October 10, 2026, both OpenAI and Anthropic list web search at $10 per
1,000 searches plus model token charges. That makes a small sponsored pilot
possible, but it is not free at scale and must be budgeted as a product service.

## Release sequence

1. **Implemented:** provider destination registry with validated HTTPS
   destinations and no prompt content in navigation URLs.
2. **Implemented:** On the Fly text/caption selection actions and bounded,
   source-linked reviewed prompts for research, explanation, live reply, and
   follow-up email drafting.
3. Live-test each provider adapter in clean Chrome and Edge profiles, including
   the correct enterprise workspace and prompt preload behavior.
4. Add feature-detected on-device tasks without changing the external-workspace
   fallback.
5. Pilot automatic return only after selecting who operates the service,
   authentication, retention, abuse controls, cost ceiling, and support model.

No Store description or screenshot may show an automatic answer returning to
the Evidence panel until step 5 passes an actual end-to-end test.

## Authoritative references

- [Chrome Prompt API](https://developer.chrome.com/docs/ai/prompt-api)
- [Microsoft Edge Prompt API](https://learn.microsoft.com/en-us/microsoft-edge/web-platform/prompt-api)
- [Anthropic API access](https://support.anthropic.com/en/articles/8114521-how-can-i-access-the-anthropic-api)
- [Anthropic web search](https://docs.anthropic.com/en/docs/agents-and-tools/tool-use/web-search-tool)
- [OpenAI web search](https://developers.openai.com/api/docs/guides/tools-web-search)
- [Chrome Web Store Manifest V3 requirements](https://developer.chrome.com/docs/webstore/program-policies/mv3-requirements)
