## Summary

Describe the user-visible change and link the issue it addresses.

Closes #

## Validation

- [ ] `npm ci`
- [ ] `npm run release:candidate`
- [ ] GitHub validation and CodeQL passed
- [ ] Loaded and tested as an unpacked extension in Microsoft Edge, or explained why live testing is not applicable
- [ ] Tested the affected Teams web/PWA domain and window state

## Privacy, permissions, and packaging

- [ ] I identified all manifest permission and host-access changes
- [ ] I identified all storage, export, AI handoff, or network-behavior changes
- [ ] Managed restrictions are enforced at the action boundary, not only by disabled controls
- [ ] Security architecture, threat model, or residual-risk records were updated when trust boundaries changed
- [ ] Workflow actions are pinned to reviewed full commit SHAs
- [ ] No real transcript, attendee data, credentials, Partner Center metadata, PEM files, or local-only files are included
- [ ] The upstream MIT license and attribution remain intact

## Reviewer notes

Call out store-certification implications, remaining live-test gaps, and any behavior that cannot be verified through automated tests.
