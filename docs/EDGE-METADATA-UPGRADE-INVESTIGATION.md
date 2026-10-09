# Edge Store `_metadata` Upgrade Investigation

Status: **Upstream Edge update-loader defect confirmed by package-boundary evidence on October 9, 2026.**

Tracking: [MicrosoftEdge-Extensions issue #820](https://github.com/microsoft/MicrosoftEdge-Extensions/issues/820), Better CaptionKeep Bug #317.

## Observed behavior

After Microsoft Edge Add-ons updates Better CaptionKeep, `edge://extensions`
can report:

> Cannot load extension with file or directory name _metadata. Filenames
> starting with "_" are reserved for use by the system.

Clearing the diagnostic leaves the extension functional. The warning has only
been observed at the Store-update boundary and does not recur by disabling and
re-enabling the same installed version.

## October 9 reproduction and package boundary

- Browser: Microsoft Edge Beta `156.0.4314.8` on Windows.
- Store extension ID: `edefcbdhahfolgkoamkbknjppojpaffk`.
- Installed version: `5.3.3`.
- Installed Store directory creation: `2026-10-07T18:11:37Z`.
- Immutable GitHub release asset: `better_captionkeep-5.3.3.zip` from tag
  `v5.3.3`.
- Submitted ZIP SHA-256:
  `EF413334EDDC69D7B843F93D06E674E6360FE8066C5AAB3F75AFD0771CA6B3CC`.
- The submitted ZIP contains 56 entries and no `_metadata` path.
- Edge's installed Store copy contains
  `_metadata/verified_contents.json`.
- Installed metadata SHA-256:
  `31F17DAA58A7EC2C8184274F576E5B92F61781C28634E380026322072499F023`.
- The metadata payload identifies Store item
  `edefcbdhahfolgkoamkbknjppojpaffk`, version `5.3.3`, and contains both
  `publisher` and `webstore` signatures.
- Other Edge Store extensions in the same browser profile also contain
  `_metadata`, confirming that it is normal Store-generated integrity data.

The evidence rules out the submitted ZIP, source tree, and extension manifest
as the origin of `_metadata`. The diagnostic is consistent with Edge
intermittently applying unpacked-extension reserved-name validation to a signed
Store update that already contains Edge-generated integrity metadata.

## Product-side control

The package builder rejects every underscore-prefixed file or directory except
Chromium's required top-level `_locales` directory. This fails the build before
a reserved `_metadata` path can enter a submitted package. Release verification
also rejects reserved paths in source and built directories.

This control prevents publisher-side recurrence but cannot remove metadata
that Microsoft adds after submission. The browser/update-loader correction
therefore remains an upstream Microsoft responsibility.

## Remaining live evidence

Microsoft requested a screen recording showing the error and the steps leading
to it. Because the warning is update-boundary-only, the next public Edge Store
upgrade canary must record:

1. the previously installed public version before update;
2. Edge receiving the new public Store version;
3. `edge://extensions` immediately after the upgrade;
4. the full `_metadata` diagnostic before it is cleared; and
5. the extension version, enabled state, service-worker state, and successful
   post-clear operation.

Do not republish or mutate a frozen release merely to provoke the warning.
