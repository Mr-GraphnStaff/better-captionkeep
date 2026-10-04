# French, Spanish, Quebec and GDPR Enterprise Adoption Gate

Status: **required enterprise-adoption work; not yet complete**  
Last verified: **October 4, 2026**

Azure Boards tracking: [Feature 308 — Multilingual enterprise adoption](https://dev.azure.com/DAF-TECH/Better%20CaptionKeep/_workitems/edit/308), with implementation tasks [309](https://dev.azure.com/DAF-TECH/Better%20CaptionKeep/_workitems/edit/309), [310](https://dev.azure.com/DAF-TECH/Better%20CaptionKeep/_workitems/edit/310), [311](https://dev.azure.com/DAF-TECH/Better%20CaptionKeep/_workitems/edit/311), [312](https://dev.azure.com/DAF-TECH/Better%20CaptionKeep/_workitems/edit/312), and [313](https://dev.azure.com/DAF-TECH/Better%20CaptionKeep/_workitems/edit/313).

This gate defines the evidence Better CaptionKeep should provide before representing the product as ready for multilingual organizational deployment, including a Quebec workforce. It is a product and compliance work plan, not legal advice, regulatory certification, or a claim that using the extension automatically makes an organization compliant.

## Decision

The minimum supported product languages are **English, Canadian French, and Spanish**. GDPR and Quebec privacy compliance are shared operational outcomes, not language toggles or Store badges.

- GDPR Article 12 requires privacy information to be concise, transparent, intelligible, easily accessible, and written in clear and plain language.
- French Labour Code Article L1321-6 requires French for documents that impose employee obligations or contain provisions employees need to perform their work, subject to statutory exceptions.
- Article 2 of France's Law No. 94-665 requires French in the presentation and instructions for products and services offered in France.

For a French workforce, Better CaptionKeep should therefore provide a French interface, French user/admin instructions, and French privacy/transparency material. Qualified French counsel and the adopting organization's DPO must review the final deployment posture.

For Quebec, the Office québécois de la langue française states that covered employers must make the French version of workplace software available and ensure that it is installed by default. Quebec workers also have the right to use French in information systems, software, instructions, and training material. Better CaptionKeep must therefore support an Intune-enforced Canadian French default for assigned Quebec users and devices.

Spanish is not a Quebec legal requirement. It is included as the third baseline language because it materially broadens workforce adoption and prevents the localization framework from being designed as a one-off English/French fork.

## Current product boundary

Better CaptionKeep processes displayed meeting captions and related meeting records in the user's browser. It has no developer-operated transcript server, account system, advertising, remote analytics, microphone capture, video capture, or automatic AI submission. Optional Microsoft 365 import uses the customer's own Entra registration and direct Microsoft endpoints. User-selected AI handoff and exported files leave the local boundary only after an explicit user action.

This design reduces processor and international-transfer exposure, but it does not remove the adopting organization's responsibilities. The employer or other organization deciding why and how meeting transcripts are captured will generally need to assess its role as controller based on the facts. The role cannot be chosen merely by contract or marketing language.

## Multilingual localization gate

The product is currently English-only and has no `_locales`/`chrome.i18n` framework. Readiness requires:

1. Add `default_locale`, English, French, and Spanish message catalogs, and a single localization helper used throughout extension pages. Chrome uses `_locales/fr` and `_locales/es`; the managed `fr-CA` setting maps to the reviewed Canadian French catalog.
2. Replace user-visible strings in the popup, settings, side panel, viewer, export, Evidence Board, extras, handoff, errors, permission explanations, and empty states with localized messages.
3. Localize manifest name/description where Store rules allow it.
4. Use locale-aware dates, times, numbers, pluralization, sorting, and accessible labels.
5. Translate onboarding, Microsoft 365 setup, retention/deletion controls, AI-handoff warnings, and policy/error messages.
6. Publish French and Spanish Store copy, screenshots/captions, privacy notices, getting-started material, administrator deployment guides, support workflows, and release notes.
7. Run French and Spanish layout testing for expansion, wrapping, keyboard access, screen readers, narrow side panels, high contrast, and all themes.
8. Add automated coverage that fails when a user-visible key is missing in any supported language or when English literals are introduced outside approved technical contexts.
9. Complete live UAT in English, Canadian French, and Spanish Chrome and Edge profiles without changing extension identity or release artifacts.

## One package, managed language assignment

Localization must not create separate extension packages, IDs, Entra registrations, or Store submissions. Chrome, Edge, and Intune receive the same signed release artifact.

The extension should expose a local `uiLocale` preference with these values:

- `system` — follow the browser/operating-system locale;
- `en` — English;
- `fr-CA` — Canadian French;
- `es` — Spanish.

The managed schema should add `forceUiLocale` with the same allowed values. When present, managed policy overrides the user's local choice, the Settings page displays the value as organization-managed and read-only, and an invalid value safely falls back to `system` with a diagnostic message. No language choice may alter the extension ID, OAuth redirect URI, permissions, data boundary, or release channel.

Recommended Intune assignments:

| Assignment | Managed value | Result |
| --- | --- | --- |
| General workforce | `system` or unset | Users follow the browser locale and may choose a supported language locally. |
| Quebec workforce | `fr-CA` | Canadian French is installed as the effective default and locked by policy. |
| Spanish-language workforce | `es` | Spanish is the effective default and locked where the organization requires it. |

The administrator bundle must include both Edge and Chrome policy examples, assignment guidance, rollback/remediation, and verification through `edge://policy` or `chrome://policy`. Live evidence must also show that `chrome.storage.managed` supplies the policy and that the extension visibly identifies the managed language.

## Implementation locations

- `teams-captions-saver/manifest.json`: add `default_locale` and localized manifest tokens.
- `teams-captions-saver/_locales/en/messages.json`, `_locales/fr/messages.json`, and `_locales/es/messages.json`: canonical message catalogs.
- `teams-captions-saver/localization.js`: add focused `resolveUiLocale`, `getMessage`, and `applyLocalizedText` helpers.
- `teams-captions-saver/configuration.js`: add local `uiLocale`, managed `forceUiLocale`, precedence, validation, and fallback.
- `teams-captions-saver/managed-schema.json`: declare the `forceUiLocale` enterprise policy.
- Settings and all extension surfaces: replace hard-coded user-facing text and display managed-policy state.
- Intune deployment bundle: provide Edge and Chrome profiles for general, Quebec, and Spanish assignments without creating language-specific builds.

## Quebec privacy and language gate

Quebec's privacy regulator states that a privacy impact assessment is required when acquiring, developing, or redesigning an information system or electronic service involving personal information, and before communicating personal information outside Quebec. A Quebec deployment therefore needs a documented Law 25 assessment in addition to the GDPR-oriented material where GDPR applies.

The Quebec release evidence must include:

- Canadian French terminology review by a qualified reviewer rather than unreviewed machine translation;
- Canadian French UI, privacy notice, user/admin instructions, Microsoft 365 setup, retention/deletion guidance, support path, and training material;
- an Intune pilot proving `forceUiLocale=fr-CA` is applied by default to the intended Quebec assignment group;
- a Quebec Law 25 privacy-impact assessment and documented out-of-Quebec communication analysis based on the organization's actual configuration;
- confirmation that the local-only core workflow and each optional Microsoft 365, export, or user-selected AI boundary are described accurately.

## GDPR adoption evidence

The adopting organization needs an evidence pack covering at least:

### Roles and processing record

- A documented controller/processor assessment based on actual data flows.
- A Record of Processing Activities template identifying purposes, data subjects, data categories, recipients, retention, security measures, and any transfers.
- Clear separation between core local processing, Microsoft 365 direct access, exports, and user-selected AI/provider handoffs.
- A statement that no publisher-operated service receives meeting transcript content during the core local workflow.

### Lawful use and transparency

- The organization chooses and documents its lawful basis for each deployment purpose; the extension must not prescribe one universal basis.
- French employee/participant notice templates explaining what is captured, why, who can access it, retention, recipients, rights, and how to raise a concern.
- Meeting-host and participant instructions that distinguish local displayed-caption capture from an official Microsoft tenant transcript.
- A policy for sensitive or special-category content, confidential meetings, labor-relations discussions, legal privilege, and meetings where capture is prohibited.

### Minimization, retention, and rights

- Capture only the providers, meeting types, attendee data, and extras the organization authorizes.
- Managed retention and maximum-history settings with a documented default and exception process.
- Verified local deletion, export, correction-as-derivative, and original-source preservation behavior.
- A practical process for access, correction, restriction, objection, portability, and erasure requests when relevant, including how local browser profiles are searched and handled.
- Offboarding/remediation instructions for managed devices and abandoned browser profiles.

### Security and governance

- Current security architecture, permission inventory, threat model, build provenance, SBOM, vulnerability results, and release evidence.
- Intune/managed-browser deployment profiles, least-privilege policy settings, update path, rollback/remediation, and support ownership.
- Incident-response contacts and a breach-assessment procedure; local-only processing reduces central breach scope but does not eliminate endpoint or export risk.
- An explicit prohibition on copying transcripts into unmanaged AI services or destinations outside approved organizational instructions.

### DPIA screening

The organization must screen whether an AIPD/DPIA is required. CNIL describes an AIPD as required for processing likely to create high risk to individuals. Meeting transcription can become higher risk when deployed at scale, used for employee monitoring or evaluation, applied to sensitive meetings, combined across sources, or retained extensively. The product should provide a populated assessment template, but the controller and DPO make the determination.

## Required product artifacts

- English, Canadian French, and Spanish UI and Store listings.
- Canadian French and Spanish privacy notices and concise in-product notices.
- Canadian French and Spanish administrator and user guides.
- Intune policy profiles and assignment guidance for general, Quebec, and Spanish-language workforces.
- Data-flow diagram and data inventory.
- Controller/processor role analysis.
- ROPA template.
- DPIA screening worksheet and starter template.
- Technical and organizational measures statement.
- Retention/deletion/export test evidence.
- Subprocessor statement confirming none for core transcript processing and identifying boundaries where Microsoft or a user-chosen AI/export destination becomes relevant.
- Enterprise deployment, offboarding, incident, and support runbooks.

## Adoption acceptance criteria

Do not describe Better CaptionKeep as French-enterprise-ready until:

1. English, Canadian French, and Spanish localization and accessibility tests pass in Chrome and Edge.
2. The Canadian French and Spanish privacy, user, administrator, Microsoft 365, retention, and AI-handoff documents are published and reviewed.
3. The security/data-flow/TOM package matches the exact released artifact.
4. A Quebec pilot validates Intune-enforced Canadian French, deployment, first-run permissions, Teams/Meet/Zoom Web capture, local history, deletion, export, and optional Microsoft 365 import; a Spanish profile validates the same language-policy mechanism.
5. The adopting organization's DPO completes the role, lawful-basis, transparency, retention, rights, transfer, and DPIA review.
6. Qualified counsel reviews French/Quebec language, privacy, and employment-law requirements for the actual deployment.

## Authoritative references

- [GDPR, including Articles 12, 24, 25, 30 and 32](https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32016R0679)
- [CNIL: identify controller and processor roles](https://www.cnil.fr/fr/rgpd-comment-bien-identifier-son-role)
- [CNIL: DPIA/AIPD guidance](https://www.cnil.fr/fr/RGPD-analyse-impact-protection-des-donnees-aipd)
- [French Labour Code Article L1321-6](https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000006901439/)
- [Law No. 94-665, Article 2](https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000006421210)
- [Office québécois de la langue française: workplace software and digital tools](https://www.oqlf.gouv.qc.ca/francisation/entreprises/outils-logiciels.html)
- [Office québécois de la langue française: language rights at work](https://www.oqlf.gouv.qc.ca/francisation/droits_linguistiques/droits/langue-du-travail.html)
- [Commission d'accès à l'information du Québec: principal Law 25 changes](https://www.cai.gouv.qc.ca/protection-renseignements-personnels/sujets-et-domaines-dinteret/principaux-changements-loi-25)
- [Chrome Extensions internationalization](https://developer.chrome.com/docs/extensions/reference/api/i18n)
- [Chrome managed storage manifest schema](https://developer.chrome.com/docs/extensions/reference/manifest/storage)
- [Chrome storage API: managed storage](https://developer.chrome.com/docs/extensions/reference/api/storage)
