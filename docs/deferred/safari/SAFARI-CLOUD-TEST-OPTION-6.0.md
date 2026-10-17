> **Archived / superseded scope — October 14, 2026:** The lead removed Safari
> completely from 6.0. This original preparation is preserved for a later major
> version, not active support, an installation offer, or a release gate. Reverify
> procedures, dependencies and package identity before any future use.

# Safari cloud test option — 2026-10-14

Status: researched option, not provisioned or run. No account, payment, package upload, or private meeting access performed.

TestingBot documents unsigned Safari Web/App Extension ZIP loading through its Selenium `load-extension` capability on Safari 16+. For Safari 18.4+ it documents temporary installation directly from a Web Extension ZIP, without an Xcode wrapper, on its macOS Sequoia/Tahoe machines:
https://testingbot.com/support/web-automate/selenium/browser-extension

This provides a potential real-Safari test route independent of a family tester. Before relying on it, validate account access, exact supported Safari/macOS versions, package installation and permitted synthetic meeting flows. Use synthetic transcripts and disposable test accounts only. Do not upload enterprise credentials, real meeting transcripts or native-helper secrets.

Important limitation: the service automatically grants webpage permissions. This does not exercise normal first-install permission prompts/denials or prove Store upgrade behavior. Native BYOMCP helper installation, macOS trust/keychain behavior and Safari native integration need a separately controlled Mac environment; the documented browser-extension capability alone does not establish those.

Playwright WebKit is useful supplementary rendering coverage, not Safari extension certification. Its official documentation explicitly says it does not run branded Safari and platform features differ:
https://playwright.dev/docs/browsers#webkit

No assumption is made about the user's operating on a Raspberry Pi, free minutes, paid-plan entitlements or cloud-helper installation. All Safari acceptance gates remain pending until actual evidence is collected.
