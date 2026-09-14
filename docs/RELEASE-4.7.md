# Better CaptionKeep 4.7 Release Candidate Checklist

## Automated gates

- [ ] `npm test`
- [ ] `npm run lint`
- [ ] `npm run build:targets`
- [ ] Chrome and Edge manifests match the source runtime contract
- [ ] Each ZIP has one root manifest and no local Partner Center metadata, private keys, or temporary files
- [ ] Record Git commit and SHA-256 for both packages

## Browser and Teams matrix

- [ ] Edge unpacked: install, popup, all themes, config export/import, direct folder picker, manual Downloads subfolder, and Open Downloads fallback
- [ ] Chrome unpacked: install, popup, all themes, config export/import, direct folder picker, manual Downloads subfolder, and Open Downloads fallback
- [ ] Popup platform row: Teams opens the official web app; Zoom and Google Meet open only the local 5.0 coming-soon page
- [ ] `teams.cloud.microsoft`: live capture, minimize/restore, reload recovery warning, copy, cleaned copy, TXT/MD export
- [ ] `teams.microsoft.com`: injection and equivalent capture/export smoke test when the tenant still serves this host
- [ ] Viewer: search, speaker filter, Scrubby output toggle, history load/delete
- [ ] AI handoff: prompt remains internal, Scrubby defaults on, unmasked copy double-confirms
- [ ] Enterprise destinations: exact official HTTPS host accepted; deceptive/insecure host rejected
- [ ] Managed policy pilot: force Scrubby, restrict provider, disable AI handoff

## Release boundary

- Production runtime supports Teams only.
- Pattern masking is described as risk reduction, never compliance certification.
- The published 4.6 package remains untouched until 4.7 passes this matrix and receives explicit submission approval.
