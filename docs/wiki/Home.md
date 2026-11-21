# Better CaptionKeep

**A DAF-TECH product — Keep the meeting. Keep the evidence.**

Keep a local transcript of captions displayed in Microsoft Teams web/PWA, Google Meet and Zoom Web. Review the conversation, find the source behind a note, and export the words you need. Better CaptionKeep is free, with no required BCK account or paid feature tier. It does not record microphone audio or video or join meetings as a bot.

![Better CaptionKeep meeting workspace illustration](https://raw.githubusercontent.com/Mr-GraphnStaff/better-captionkeep/27eb0227579c388c6ad22b6ba7e8b3f7586797f5/store-assets/6.0/01-one-button-meeting.png)

*Illustrated product panel with sample meeting text.*

## Start here

| What you want to do | Guide |
| --- | --- |
| Install in Chrome, Edge, Brave, Opera or Firefox | [Browser installation and Microsoft 365 setup](Browser-Installation-and-Microsoft-365) |
| Save the captions from a meeting | [Capture your first meeting](Getting-Started) |
| Find, review or export saved words | [Workspace, review and export](Review-Save-and-Export) |
| Set up Microsoft 365 and a Windows organization pilot | [Administrator deployment](Administrator-Deployment) |
| Resolve a problem or ask a question | [Troubleshooting](Troubleshooting) and [Support](Support) |

## Versions and downloads

The extension's **6.0.3 GitHub release** and the separate signed **Windows Administrator Setup 6.0.3-r2** are available. Browser Stores can distribute a different version while an update is being reviewed. Check [Release status](Release-Status) and the version actually installed in your browser before following version-specific steps.

## Microsoft 365 is optional

Local displayed-caption capture works without an Entra app or Intune. The optional Microsoft 365 connection uses your organization's app and delegated access to request a selected official Teams transcript. The Windows administrator app provides a guided initial setup route for supported Edge/Chrome deployments; manual setup is described in the browser guide.

Official transcript import has an [open retrieval issue](https://github.com/Mr-GraphnStaff/better-captionkeep/issues/255). An empty lookup does not establish that Teams is still processing a transcript. Verify the complete sign-in, discovery and import workflow with a synthetic meeting before relying on it in your organization. Live browser/provider acceptance remains separate from package availability.

## Privacy and control

Original captions remain separate from notes, corrections, markers and reviewed summaries. Exports and optional AI/email handoffs follow the destinations you choose. Privacy Scrubber reduces supported sensitive patterns; it does not guarantee anonymization. Read [Privacy and data boundaries](Privacy-and-Data-Boundaries) and [security and permissions](Deployment-Security-and-Permissions) before using real meeting information.

Safari, MCP connections/tool execution and the later Intune-console settings editor are outside this release. The browser extension does not capture the native Teams desktop client's captions.

## Help and project information

[Support](Support) · [Release status](Release-Status) · [Source and MIT license](https://github.com/Mr-GraphnStaff/better-captionkeep) · [Private vulnerability reporting](https://github.com/Mr-GraphnStaff/better-captionkeep/security/advisories/new)
