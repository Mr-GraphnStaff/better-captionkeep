(function (root) {
    'use strict';

    const STORAGE_KEY = 'entitlement_v1';
    const STATES = Object.freeze({
        FREE:'free', ACTIVE:'active', OFFLINE_GRACE:'offline-grace', EXPIRED:'expired', UNAVAILABLE:'unavailable'
    });

    function isDeveloperEdition(manifest = {}) {
        return /^Better CaptionKeep - (Chrome|Edge) Test$/.test(String(manifest.name || ''))
            && /\bdevelopment\b/i.test(String(manifest.version_name || ''));
    }

    function developerEntitlement() {
        return Object.freeze({state:STATES.ACTIVE, reason:'developer-edition', tier:'pro', effectiveTier:'pro',
            entitlementId:null, source:'developer-edition'});
    }
    const DEVELOPMENT_PUBLIC_KEY = Object.freeze({
        key_ops:['verify'], ext:true, kty:'EC',
        x:'1nCyvixz5TVO5nPd04CeMlYid6Shhr1cexT3YGR6f4M',
        y:'ME0IAy7QL8XELz96RoyYhovwUDc-Sr3RUWx21vcdK24', crv:'P-256'
    });
    const DEVELOPMENT_FIXTURE = Object.freeze({
        payload:Object.freeze({
            fixtureVersion:1, entitlementId:'development-fixture', tier:'pro',
            issuedAt:'2025-01-01T00:00:00.000Z', expiresAt:'2099-01-01T00:00:00.000Z',
            graceUntil:'2099-02-01T00:00:00.000Z', subject:'local-development-only'
        }),
        signature:'XYolckAMI0SjPPVNkV8e4TSjoFjtQQGUAjDNLf5BwIEf9bW6ZjB8bZEWZ5SKDJfyVoKwZLcC1iEKvRjzwjP5Eg'
    });

    function result(state, reason, payload = null) {
        const pro = state === STATES.ACTIVE || state === STATES.OFFLINE_GRACE;
        return Object.freeze({state, reason, tier:pro ? 'pro' : 'free', effectiveTier:pro ? 'pro' : 'free',
            entitlementId:payload?.entitlementId || null, source:payload ? 'development-fixture' : 'none'});
    }

    function serializePayload(payload = {}) {
        return JSON.stringify({
            fixtureVersion:payload.fixtureVersion,
            entitlementId:payload.entitlementId,
            tier:payload.tier,
            issuedAt:payload.issuedAt,
            expiresAt:payload.expiresAt,
            graceUntil:payload.graceUntil,
            subject:payload.subject
        });
    }

    function decodeBase64Url(value) {
        const normalized=String(value || '').replace(/-/g,'+').replace(/_/g,'/');
        const binary=atob(normalized + '='.repeat((4 - normalized.length % 4) % 4));
        return Uint8Array.from(binary, character => character.charCodeAt(0));
    }

    async function validateDevelopmentFixture(fixture, options = {}) {
        if (options.allowDevelopmentFixtures !== true) return result(STATES.UNAVAILABLE, 'development-fixtures-disabled');
        try {
            const payload=fixture?.payload;
            if (payload?.fixtureVersion !== 1 || payload?.tier !== 'pro' || payload?.subject !== 'local-development-only') {
                return result(STATES.UNAVAILABLE, 'invalid-fixture');
            }
            const issuedAt=Date.parse(payload.issuedAt);
            const expiresAt=Date.parse(payload.expiresAt);
            const graceUntil=Date.parse(payload.graceUntil);
            if (![issuedAt,expiresAt,graceUntil].every(Number.isFinite) || issuedAt > expiresAt || expiresAt > graceUntil) {
                return result(STATES.UNAVAILABLE, 'invalid-validity-window');
            }
            const publicKey=await crypto.subtle.importKey('jwk', DEVELOPMENT_PUBLIC_KEY,
                {name:'ECDSA',namedCurve:'P-256'}, false, ['verify']);
            const valid=await crypto.subtle.verify({name:'ECDSA',hash:'SHA-256'}, publicKey,
                decodeBase64Url(fixture.signature), new TextEncoder().encode(serializePayload(payload)));
            if (!valid) return result(STATES.UNAVAILABLE, 'invalid-signature');
            const now=Number.isFinite(options.now) ? options.now : Date.now();
            if (now < issuedAt) return result(STATES.UNAVAILABLE, 'not-yet-valid');
            if (now <= expiresAt) return result(STATES.ACTIVE, 'verified', payload);
            if (now <= graceUntil) return result(STATES.OFFLINE_GRACE, 'verification-grace', payload);
            return result(STATES.EXPIRED, 'expired', payload);
        } catch {
            return result(STATES.UNAVAILABLE, 'verification-failed');
        }
    }

    async function resolveStored(options = {}) {
        // Developer/UAT access is a property of the installed test build, never a
        // consumer preference or a copied license key. Managed policy still wins.
        if (isDeveloperEdition(chrome.runtime.getManifest())) return developerEntitlement();
        const stored=(await chrome.storage.local.get(STORAGE_KEY))[STORAGE_KEY];
        if (!stored) return result(STATES.FREE, 'no-entitlement');
        if (stored.source === 'development-fixture') {
            return validateDevelopmentFixture(stored.fixture, options);
        }
        return result(STATES.UNAVAILABLE, 'unsupported-entitlement-source');
    }

    async function installDevelopmentFixture(fixture, options = {}) {
        const resolved=await validateDevelopmentFixture(fixture, options);
        if (![STATES.ACTIVE,STATES.OFFLINE_GRACE].includes(resolved.state)) {
            throw new Error(`Development entitlement rejected: ${resolved.reason}`);
        }
        await chrome.storage.local.set({[STORAGE_KEY]:{source:'development-fixture',fixture}});
        return resolved;
    }

    async function deactivate() {
        await chrome.storage.local.remove(STORAGE_KEY);
        return result(STATES.FREE, 'deactivated');
    }

    function evaluateFeature(feature, entitlement, featureTiers = {}, policyAllowed = true) {
        if (!policyAllowed) return Object.freeze({allowed:false, reason:'managed-policy'});
        const requiredTier=featureTiers?.[feature] === 'pro' ? 'pro' : 'free';
        if (requiredTier === 'free') return Object.freeze({allowed:true, reason:'free-feature'});
        const allowed=entitlement?.effectiveTier === 'pro';
        return Object.freeze({allowed, reason:allowed ? 'pro-entitlement' : 'pro-required'});
    }

    root.CaptionKeepEntitlements=Object.freeze({
        STORAGE_KEY, STATES, DEVELOPMENT_FIXTURE, isDeveloperEdition, serializePayload, validateDevelopmentFixture,
        resolveStored, installDevelopmentFixture, deactivate, evaluateFeature
    });
    if (typeof module !== 'undefined' && module.exports) module.exports=root.CaptionKeepEntitlements;
})(typeof globalThis !== 'undefined' ? globalThis : this);
