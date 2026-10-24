// Development defaults to the Chrome native-host convention. Browser-specific
// builds replace this non-secret constant; no user-agent guessing or credentials.
globalThis.CaptionKeepBrowserRuntime = Object.freeze({target:'chrome'});
