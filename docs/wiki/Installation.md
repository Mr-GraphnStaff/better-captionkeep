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

The Chrome Web Store listing checked on November 16, 2026 shows **6.0.0**, updated October 25. The owner confirmed 6.0 publication in both Stores on October 25, and the subsequent managed pilot observed Chrome and Edge installations. See [Release status](Release-Status) for dated observations; the extension and Administrator Setup have separate release versions.

For organization-wide Windows rollout and Microsoft 365 connection, use [Administrator Deployment](Administrator-Deployment). The signed setup application guides the administrator through the proposed tenant and Intune changes; ordinary local caption capture does not require this application or an Intune tenant.

## After installation

1. Open Better CaptionKeep from the browser toolbar.
2. Open a supported meeting in Microsoft Teams, Google Meet, or the Zoom Web client.
3. Confirm that the meeting platform's live captions are on. In 6.0, automatic caption enablement is on by default where supported; if the platform does not allow it, turn captions on manually.
4. Keep the meeting page open while captions are being displayed.
5. Open Better CaptionKeep to confirm that caption lines are arriving.

Continue with [Capture your first meeting](Getting-Started).

## Important distinctions

- GitHub release ZIPs are controlled distribution artifacts. Store submission packages must go through the applicable Store; controlled unpacked testing follows the browser-specific developer instructions.
- **Load unpacked** is only for controlled Development, UAT, and local Production testing.
- Store installation and unpacked installation have different extension identities and separate local histories.
- Microsoft 365 transcript import requires an organization-owned Entra registration. It is available in the current public Chrome and Edge release.

Developers and testers should use [Development and UAT](Development-and-UAT). Administrators planning managed deployment should use [Administrator deployment](Administrator-Deployment).
