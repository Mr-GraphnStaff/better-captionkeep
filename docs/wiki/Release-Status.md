# Versions, downloads and known limitations

Updated November 21, 2026. Extension and Windows Administrator Setup versions are separate. Check the version actually installed in your browser and the full installer release tag.

| Component | Available release / last verified status | Download or details |
| --- | --- | --- |
| Browser extension | **6.0.3** published on GitHub | [6.0.3 release](https://github.com/Mr-GraphnStaff/better-captionkeep/releases/tag/v6.0.3) |
| Windows Administrator Setup | **6.0.3-r2**, signed Windows x64 installer; executable filename retains 6.0.3 | [Signed r2 release](https://github.com/Mr-GraphnStaff/better-captionkeep/releases/tag/admin-setup-v6.0.3-r2) |
| Chrome Web Store | **6.0.3** publicly listed and served by the Store, verified November 21. The reported installation remains enabled and its popup opens despite a metadata warning; complete installed-upgrade, capture and import acceptance remain unverified. | [Chrome listing](https://chromewebstore.google.com/detail/better-captionkeep/nabjdlnkkaonnbnimnmnhjcbigceebml) |
| Microsoft Edge Add-ons | 6.0.0 was the last verified live baseline. The corrected 6.0.3 submission was last verified In review on November 20. Current public approval has not been independently confirmed. | [Edge listing](https://microsoftedge.microsoft.com/addons/detail/better-captionkeep/edefcbdhahfolgkoamkbknjppojpaffk) |

Store observations are dated checks, not live monitoring. GitHub availability, Store review, Store publication and an installed upgrade are different states. Follow [Installation](Installation) for regular use or the [five-browser guide](Browser-Installation-and-Microsoft-365) for controlled testing; do not assume a Store download is 6.0.3 until its installed version confirms it.

## What to verify before relying on it

- Test displayed-caption capture and export in the browser/provider you will actually use. A package or synthetic test does not establish a complete live acceptance matrix.
- Optional Microsoft 365 import has an [open retrieval issue](https://github.com/Mr-GraphnStaff/better-captionkeep/issues/255). An empty lookup can be mislabeled as incomplete processing even when Teams opens the transcript. See [Troubleshooting](Troubleshooting).
- Initial organization provisioning needs the approved Windows helper, identity permissions, licensing and a limited pilot. Verify endpoint policy/installation, employee sign-in and transcript import independently. [Administrator deployment](Administrator-Deployment).
- A local unpacked extension can have a different OAuth callback and may not be approved by the native helper. Use the [browser guide](Browser-Installation-and-Microsoft-365).

Safari, MCP connections/tool execution, native Teams desktop capture and the later Intune-console settings editor are outside this release.

## Release history and support

[Extension 6.0.3 release notes and assets](https://github.com/Mr-GraphnStaff/better-captionkeep/releases/tag/v6.0.3) · [Administrator 6.0.3-r2](https://github.com/Mr-GraphnStaff/better-captionkeep/releases/tag/admin-setup-v6.0.3-r2) · [Earlier extension 6.0.0](https://github.com/Mr-GraphnStaff/better-captionkeep/releases/tag/v6.0.0) · [Support](Support)

Extension 6.0.1 and 6.0.2 were development labels. Administrator Setup has its own release history. Old receipts and local development snapshots are not current installation instructions.

<details>
<summary>Maintainer source-freeze and acceptance records</summary>

These retained machine-generated records describe source/candidate evidence, including unfinished checks. They do not report current Store availability or turn unpassed tests into passes. Use the dated customer table above for distribution status.

<!-- captionkeep-6.0.3-status:start -->
> **6.0.3 delivery status:** 6.0.3 is candidate on `master`. Candidate frozen: yes.
> Live provider certification outstanding: chrome, edge, brave, firefox, opera.
> Open release gates: fullScopeAcceptance, accessibilityAndFailureUat, unchangedWindow, storeApproval, publicParity, installedUpgrade. Azure Boards epic: **#395**.
> Owner publication exception: David Farris; accepted unfinished gates: fullScopeAcceptance, accessibilityAndFailureUat, unchangedWindow; live certifications: chrome, edge, brave, firefox, opera. These checks remain unpassed.
> This development record does not change prior publication records or inherit prior owner exceptions.
<!-- captionkeep-6.0.3-status:end -->

<!-- captionkeep-6.0-status:start -->
> **6.0 delivery status:** 6.0.0 is candidate on `master`. Candidate frozen: yes.
> Live provider certification outstanding: chrome, edge, brave, firefox, opera.
> Open release gates: fullScopeAcceptance, accessibilityAndFailureUat, unchangedWindow, storeApproval, publicParity, installedUpgrade. Azure Boards epic: **#335**.
> Owner publication exception: David Farris; accepted unfinished gates: fullScopeAcceptance, accessibilityAndFailureUat, unchangedWindow; live certifications: chrome, edge, brave, firefox, opera. These checks remain unpassed.
> This status does not change historical 5.4 publication records.
<!-- captionkeep-6.0-status:end -->

</details>
