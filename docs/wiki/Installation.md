# Installation

## Recommended: install from your browser's Store

Store installation provides a stable extension identity and automatic updates.

### Google Chrome

1. Open [Better CaptionKeep in the Chrome Web Store](https://chromewebstore.google.com/detail/better-captionkeep/nabjdlnkkaonnbnimnmnhjcbigceebml).
2. Select **Add to Chrome**.
3. Confirm **Add extension**.
4. Open Chrome's Extensions menu and pin Better CaptionKeep if you want it visible on the toolbar.

### Microsoft Edge

1. Open [Better CaptionKeep in Microsoft Edge Add-ons](https://microsoftedge.microsoft.com/addons/detail/better-captionkeep/edefcbdhahfolgkoamkbknjppojpaffk).
2. Select **Get**.
3. Confirm **Add extension**.
4. Open Edge's Extensions menu and show Better CaptionKeep on the toolbar if desired.

Current status on October 7, 2026: Chrome and Edge publicly serve **5.3.2**. Verification that existing installations upgrade cleanly remains separate evidence. See [Release status](Release-Status).

## After installation

1. Open Better CaptionKeep from the browser toolbar.
2. Open a supported meeting in Microsoft Teams, Google Meet, or the Zoom Web client.
3. Turn on the meeting platform's live captions.
4. Keep the meeting page open while captions are being displayed.
5. Open Better CaptionKeep to confirm that caption lines are arriving.

Continue with [Capture your first meeting](Getting-Started).

## Important distinctions

- A GitHub release ZIP is a Store-submission artifact, not a file ordinary users should load directly.
- **Load unpacked** is only for controlled Development, UAT, and local Production testing.
- Store installation and unpacked installation have different extension identities and separate local histories.
- Microsoft 365 transcript import requires an organization-owned Entra registration. It is available in public Chrome and Edge 5.3.2.

Developers and testers should use [Development and UAT](Development-and-UAT). Administrators planning managed deployment should use [Administrator deployment](Administrator-Deployment).
