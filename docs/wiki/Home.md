# Better CaptionKeep Wiki

Better CaptionKeep captures captions visible in your browser and keeps the resulting transcript local. It supports Microsoft Teams, Google Meet, and the Zoom Web client. It can also import an official Teams transcript directly from Microsoft 365 when that connection is configured.

## Start here

- [Install and test](Install-and-Test.md)
- [Connect Microsoft 365](Microsoft-365-Connection.md)
- [Understand the three release lanes](Three-Lane-Release-Workflow.md)
- [Privacy and data boundaries](Privacy-and-Data-Boundaries.md)
- [Troubleshooting](Troubleshooting.md)
- [Current release status](Release-Status.md)

## Two different Teams transcript sources

Better CaptionKeep can work with two separate sources:

1. **Local caption capture** records the live captions visible in your browser. The local copy does not leave your browser unless you explicitly export or share it.
2. **Official Microsoft 365 transcript import** retrieves a transcript retained by your tenant after Teams transcription ran. Microsoft 365 retains that official copy; Better CaptionKeep imports a separate local copy for review and export.

A Teams calendar meeting does not by itself create an official transcript. Someone must start Teams transcription, even when live captions are already visible.

## Source of truth

The public repository is [Mr-GraphnStaff/better-captionkeep](https://github.com/Mr-GraphnStaff/better-captionkeep). Security, privacy, deployment, and release evidence remain version-controlled under its `docs` directory. This wiki is the plain-language entry point, not a substitute for those reviewed records.
