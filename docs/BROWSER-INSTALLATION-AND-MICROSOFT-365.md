# Browser installation and Microsoft 365 setup

Applies to Better CaptionKeep 6.0.3. Choose the instructions for the browser you actually use. Local caption capture works independently of the optional Microsoft 365 connection.

## Choose your browser and installation

For regular use, prefer an available official Store listing and check its installed version. A GitHub release or a Store submission does not mean that a Store has approved and distributed that version. The [6.0.3 GitHub release](https://github.com/Mr-GraphnStaff/better-captionkeep/releases/tag/v6.0.3) includes separate browser ZIPs.

| Browser | Installation route | Controlled local 6.0.3 testing |
| --- | --- | --- |
| Chrome | [Chrome Web Store](https://chromewebstore.google.com/detail/better-captionkeep/nabjdlnkkaonnbnimnmnhjcbigceebml) | Open `chrome://extensions`, enable Developer mode, choose Load unpacked, and select the extracted Chrome 6.0.3 package folder containing `manifest.json`. |
| Edge | [Edge Add-ons](https://microsoftedge.microsoft.com/addons/detail/better-captionkeep/edefcbdhahfolgkoamkbknjppojpaffk) | Open `edge://extensions`, enable Developer mode, choose Load unpacked, and select the extracted Edge 6.0.3 package folder containing `manifest.json`. |
| Brave | Brave supports installation from the [Chrome Web Store](https://chromewebstore.google.com/detail/better-captionkeep/nabjdlnkkaonnbnimnmnhjcbigceebml). Check the installed version. | Open `brave://extensions`, enable Developer mode, choose Load unpacked, and select the extracted Brave 6.0.3 package folder containing `manifest.json`. |
| Opera | Use the browser-specific GitHub package for controlled testing. No Better CaptionKeep Opera Store publication is established here. | Open `opera:extensions`, enable Developer mode, choose Load unpacked extension, and select the extracted Opera 6.0.3 package folder containing `manifest.json`. |
| Firefox | Use the Firefox-specific GitHub package for controlled testing. An unsigned ZIP is not a permanent end-user installation or evidence of a Mozilla Add-ons publication. | Open `about:debugging`, select This Firefox, choose Load Temporary Add-on, and select `manifest.json` inside the extracted Firefox 6.0.3 package folder. This temporary installation ends when Firefox restarts. |

Download and extract the matching `better-captionkeep-<browser>-6.0.3.zip` into a stable folder and select that extracted folder, or its manifest for Firefox. Source-build output layouts depend on the checked-out revision; they are separate from these downloaded-package instructions. Do not select a Chrome package for Firefox. Do not move or remove an unpacked extension's folder while it is in use. Verify version 6.0.3 on the browser's extension-details page; after replacing files, reload the extension before testing. Save any ongoing meeting work before reloading.

Developer-mode and temporary installations are controlled test routes. They do not inherit the Store identity, automatic updates or the acceptance evidence of another browser. Package availability does not certify live capture, Microsoft 365 authentication or transcript import in that browser. The recorded Chrome/Edge pilot established sign-in and discovery, not completed transcript-import acceptance; Brave, Opera and Firefox Microsoft 365 acceptance is not established by this guide.

## Reuse an existing organization connection

An administrator can approve the same organization-owned Entra app for multiple browser installations. Use the existing Directory (tenant) ID and Application (client) ID when that app's owner authorizes the additional browser. Each installed extension's exact callback must be registered on that app. A different callback does not require a new app registration.

Chrome's Intune policy does not automatically supply settings to Brave, Opera or Firefox. Browser policy locations and deployment support are separate. The current signed Windows administrator helper supports Chrome, Edge and Brave; this does not establish an Opera or Firefox guided Intune deployment. Manually entered identifiers are supported when organization policy permits them. Enforced managed settings take precedence; local edits cannot override them.

1. In the chosen browser, open Better CaptionKeep from its toolbar icon.
2. Expand **Administrator connection details**.
3. Enter the organization's **Directory (tenant) ID** and **Application (client) ID**.
4. Select **Save Microsoft 365 setup**.
5. Find the **Redirect URI:** line below those fields. Select and copy the complete displayed address. Use the value from this installation, even if another browser is already connected.
6. An authorized app administrator opens **Microsoft Entra admin center > App registrations > the existing app > Authentication**. Under **Single-page application**, choose **Add URI**. If that platform is absent, choose **Add a platform > Single-page application**. Paste the copied URI and save. Keep existing approved redirects for other installations.
7. Return to Better CaptionKeep and select **Connect Microsoft 365**. Approve its optional Microsoft host-access prompt, then sign in with the authorized work account and complete any required MFA. Existing delegated permissions and administrator consent must still be valid.

Tenant and client IDs are configuration identifiers. Do not enter a client secret, password, certificate private key or token in these fields. The extension uses interactive authorization-code authentication with PKCE; the app-registration permission and consent steps are documented in the [Entra registration runbook](https://github.com/Mr-GraphnStaff/better-captionkeep/blob/master/docs/ENTRA-GRAPH-APP-REGISTRATION.md).

## Find the right redirect in each browser

For **Chrome, Edge, Brave and Opera**, the runtime callback has this form:

```text
https://<installed-extension-id>.chromiumapp.org/microsoft
```

Copy the address displayed by Better CaptionKeep. If the address is not visible, open that browser's extension manager, find Better CaptionKeep, and inspect its ID. For these Chromium browsers, substitute that exact ID into the format above. Store and unpacked IDs can differ, and loading a different folder can change an unpacked identity. Recheck the actual address after changing installation method or path. Do not copy a user's example ID or a redirect from a different installation.

For **Firefox**, copy the callback displayed by Better CaptionKeep. Firefox generates its own identity redirect from the add-on ID; do not construct a `chromiumapp.org` address from a Firefox ID or append `/microsoft` by guesswork. If no redirect is displayed or the browser reports an unavailable identity API, stop the setup and report the browser version and sanitized error. This guide does not claim Firefox/Entra sign-in acceptance. Keep the package's declared Firefox add-on identity intact.

If Entra reports **AADSTS50011**, compare the exact requested callback with the selected app's registered redirects. Check the app/client ID as well as the browser callback. Add only the administrator-approved exact URI; do not add a wildcard. Registration fixes this sign-in mismatch, not a subsequent meeting or transcript-access failure.

## Verify the complete connection

Use an authorized synthetic Teams meeting with transcription enabled and no confidential content.

1. Confirm sign-in completes using the intended organization and account.
2. Refresh recent meetings and confirm the intended meeting is listed.
3. Import its official transcript and confirm it opens in the local viewer with Microsoft Graph source provenance.

Treat sign-in, discovery and transcript import as separate results. An empty transcript lookup does not establish that Teams is still processing a transcript. If it already opens in Teams, check the connected account, selected meeting and actual API result rather than assuming a processing delay. Record any failure with the browser/build and sanitized error, without meeting text, tokens or private tenant records.

## Browser and identity references

- [Brave extension installation](https://support.brave.app/hc/en-us/articles/360017909112-How-can-I-add-extensions-to-Brave)
- [Brave policies](https://support.brave.app/hc/en-us/articles/360039248271-Group-Policy)
- [Opera developer installation](https://help.opera.com/en/extensions/testing/)
- [Firefox temporary installation and limitations](https://extensionworkshop.com/documentation/develop/temporary-installation-in-firefox/)
- [Firefox identity redirect API](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/identity/getRedirectURL)
- [Entra AADSTS50011 diagnosis](https://learn.microsoft.com/en-us/troubleshoot/entra/entra-id/app-integration/error-code-aadsts50011-redirect-uri-mismatch)
