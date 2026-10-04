// Microsoft Entra public-client identifiers are not secrets. Store builds use
// the organizations authority so any Microsoft 365 tenant can apply its own
// consent policy. Managed deployment settings can still override these values.
globalThis.CaptionKeepGraphRuntimeConfig = Object.freeze({
    enableGraphTranscriptImport: true,
    graphTenantId: 'organizations',
    graphClientId: 'a88e99c2-2dce-45e2-9839-fa63372c18c5'
});
