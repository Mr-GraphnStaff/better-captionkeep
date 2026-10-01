(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    else root.CaptionKeepDevUatEntitlement = api;
})(typeof globalThis !== 'undefined' ? globalThis : self, function () {
    'use strict';

    const STORAGE_KEY = 'devUatEntitlementV1';
    const ISSUER = 'better-captionkeep-dev';
    const AUDIENCE = 'better-captionkeep-dev-uat';
    const TOKEN_TYPE = 'BCK-UAT';
    const KEY_ID = 'bck-uat-2026-10-01';
    const MAX_LIFETIME_SECONDS = 24 * 60 * 60;
    const CLOCK_SKEW_SECONDS = 60;
    const ALLOWED_FEATURES = new Set(['verified-teams-transcript']);
    const PUBLIC_JWK = Object.freeze({
        kty: 'EC',
        crv: 'P-256',
        x: 'ZcV_bbr8q0WtreGTufwK0ddrA1xnlG4B_pswn3ZUArQ',
        y: '4qp0iWxfHTVZeAgYrS3aiKO3H6vw_1WRVSPpZ0BV72U',
        ext: true,
        key_ops: ['verify']
    });

    class EntitlementError extends Error {
        constructor(code, message) {
            super(message);
            this.name = 'EntitlementError';
            this.code = code;
        }
    }

    function isEligibleBuild(manifest = {}) {
        return /^Better CaptionKeep - (Chrome|Edge) Test$/.test(String(manifest.name || ''))
            && /\bdevelopment\b/i.test(String(manifest.version_name || ''));
    }

    function decodeBase64Url(value) {
        if (!/^[A-Za-z0-9_-]+$/.test(value)) throw new EntitlementError('PASS_MALFORMED', 'The UAT pass is malformed.');
        const padded = value.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - value.length % 4) % 4);
        if (typeof Buffer !== 'undefined') return new Uint8Array(Buffer.from(padded, 'base64'));
        const binary = atob(padded);
        return Uint8Array.from(binary, character => character.charCodeAt(0));
    }

    function decodeJson(value) {
        try {
            return JSON.parse(new TextDecoder().decode(decodeBase64Url(value)));
        } catch (error) {
            if (error instanceof EntitlementError) throw error;
            throw new EntitlementError('PASS_MALFORMED', 'The UAT pass is malformed.');
        }
    }

    function validateClaims(payload, nowSeconds) {
        if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
            throw new EntitlementError('PASS_MALFORMED', 'The UAT pass payload is invalid.');
        }
        if (payload.iss !== ISSUER || payload.aud !== AUDIENCE) {
            throw new EntitlementError('PASS_WRONG_AUDIENCE', 'This pass was not issued for Better CaptionKeep dev/UAT.');
        }
        if (!['dev', 'uat'].includes(payload.env)) {
            throw new EntitlementError('PASS_INVALID_ENVIRONMENT', 'The pass environment is invalid.');
        }
        if (typeof payload.sub !== 'string' || !payload.sub.trim() || payload.sub.length > 120) {
            throw new EntitlementError('PASS_INVALID_SUBJECT', 'The pass must identify one tester.');
        }
        if (typeof payload.jti !== 'string' || !/^[A-Za-z0-9_-]{8,128}$/.test(payload.jti)) {
            throw new EntitlementError('PASS_INVALID_ID', 'The pass identifier is invalid.');
        }
        if (![payload.iat, payload.nbf, payload.exp].every(Number.isInteger)
            || payload.exp <= payload.iat || payload.exp - payload.iat > MAX_LIFETIME_SECONDS) {
            throw new EntitlementError('PASS_INVALID_LIFETIME', 'The pass lifetime is invalid or exceeds 24 hours.');
        }
        if (payload.iat > nowSeconds + CLOCK_SKEW_SECONDS || payload.nbf > nowSeconds + CLOCK_SKEW_SECONDS) {
            throw new EntitlementError('PASS_NOT_ACTIVE', 'The UAT pass is not active yet.');
        }
        if (payload.exp <= nowSeconds) {
            throw new EntitlementError('PASS_EXPIRED', 'The UAT pass has expired.');
        }
        if (!Array.isArray(payload.features) || payload.features.length === 0
            || payload.features.some(feature => !ALLOWED_FEATURES.has(feature))) {
            throw new EntitlementError('PASS_INVALID_FEATURES', 'The UAT pass contains an unsupported capability.');
        }
        return {
            issuer: payload.iss,
            audience: payload.aud,
            subject: payload.sub.trim(),
            environment: payload.env,
            features: [...new Set(payload.features)],
            issuedAt: payload.iat,
            notBefore: payload.nbf,
            expiresAt: payload.exp,
            id: payload.jti
        };
    }

    async function verify(token, {cryptoApi = globalThis.crypto, manifest = {}, nowMs = Date.now(), publicJwk = PUBLIC_JWK} = {}) {
        if (!isEligibleBuild(manifest)) {
            throw new EntitlementError('BUILD_NOT_ELIGIBLE', 'Dev/UAT passes are disabled in this build.');
        }
        const compact = String(token || '').trim();
        if (!compact || compact.length > 8192) throw new EntitlementError('PASS_MALFORMED', 'Enter a valid UAT pass.');
        const parts = compact.split('.');
        if (parts.length !== 3) throw new EntitlementError('PASS_MALFORMED', 'The UAT pass is malformed.');
        const header = decodeJson(parts[0]);
        if (header.alg !== 'ES256' || header.typ !== TOKEN_TYPE || header.kid !== KEY_ID) {
            throw new EntitlementError('PASS_UNSUPPORTED', 'The UAT pass uses an unsupported signing profile.');
        }
        const publicKey = await cryptoApi.subtle.importKey(
            'jwk', publicJwk, {name: 'ECDSA', namedCurve: 'P-256'}, false, ['verify']
        );
        const verified = await cryptoApi.subtle.verify(
            {name: 'ECDSA', hash: 'SHA-256'},
            publicKey,
            decodeBase64Url(parts[2]),
            new TextEncoder().encode(`${parts[0]}.${parts[1]}`)
        );
        if (!verified) throw new EntitlementError('PASS_BAD_SIGNATURE', 'The UAT pass signature is invalid.');
        const claims = validateClaims(decodeJson(parts[1]), Math.floor(nowMs / 1000));
        const fingerprint = await cryptoApi.subtle.digest('SHA-256', decodeBase64Url(parts[2]));
        const signatureFingerprint = [...new Uint8Array(fingerprint)]
            .map(byte => byte.toString(16).padStart(2, '0')).join('');
        return {claims, signatureFingerprint};
    }

    function resolveDependencies(dependencies = {}) {
        const chromeApi = dependencies.chromeApi || globalThis.chrome;
        const manifest = dependencies.manifest || chromeApi?.runtime?.getManifest?.() || {};
        const cryptoApi = dependencies.cryptoApi || globalThis.crypto;
        const nowMs = dependencies.nowMs ?? Date.now();
        if (!chromeApi?.storage?.session) throw new EntitlementError('SESSION_UNAVAILABLE', 'Session storage is unavailable.');
        const publicJwk = dependencies.publicJwk || PUBLIC_JWK;
        return {chromeApi, manifest, cryptoApi, nowMs, publicJwk};
    }

    async function activate(token, dependencies = {}) {
        const deps = resolveDependencies(dependencies);
        const verified = await verify(token, deps);
        await deps.chromeApi.storage.session.set({
            [STORAGE_KEY]: {
                claims: verified.claims,
                signatureFingerprint: verified.signatureFingerprint,
                verifiedAt: Math.floor(deps.nowMs / 1000)
            }
        });
        return publicStatus(verified.claims, true, deps.manifest);
    }

    function publicStatus(claims, active, manifest) {
        return {
            eligibleBuild: isEligibleBuild(manifest),
            active,
            subject: active ? claims.subject : null,
            environment: active ? claims.environment : null,
            features: active ? [...claims.features] : [],
            expiresAt: active ? new Date(claims.expiresAt * 1000).toISOString() : null
        };
    }

    async function status(dependencies = {}) {
        const deps = resolveDependencies(dependencies);
        if (!isEligibleBuild(deps.manifest)) return publicStatus({}, false, deps.manifest);
        const stored = (await deps.chromeApi.storage.session.get(STORAGE_KEY))[STORAGE_KEY];
        if (!stored?.claims || typeof stored.signatureFingerprint !== 'string') {
            return publicStatus({}, false, deps.manifest);
        }
        try {
            const payload = {
                iss: stored.claims.issuer,
                aud: stored.claims.audience,
                sub: stored.claims.subject,
                env: stored.claims.environment,
                features: stored.claims.features,
                iat: stored.claims.issuedAt,
                nbf: stored.claims.notBefore,
                exp: stored.claims.expiresAt,
                jti: stored.claims.id
            };
            const claims = validateClaims(payload, Math.floor(deps.nowMs / 1000));
            return publicStatus(claims, true, deps.manifest);
        } catch {
            await deps.chromeApi.storage.session.remove(STORAGE_KEY);
            return publicStatus({}, false, deps.manifest);
        }
    }

    async function requireFeature(feature, dependencies = {}) {
        const deps = resolveDependencies(dependencies);
        if (!isEligibleBuild(deps.manifest)) return null;
        const current = await status(deps);
        if (!current.active || !current.features.includes(feature)) {
            throw new EntitlementError('UAT_PASS_REQUIRED', 'Activate a current dev/UAT pass to use this capability in a test build.');
        }
        return current;
    }

    async function clear(dependencies = {}) {
        const deps = resolveDependencies(dependencies);
        await deps.chromeApi.storage.session.remove(STORAGE_KEY);
        return publicStatus({}, false, deps.manifest);
    }

    return Object.freeze({
        STORAGE_KEY, ISSUER, AUDIENCE, TOKEN_TYPE, KEY_ID, MAX_LIFETIME_SECONDS,
        PUBLIC_JWK, EntitlementError, isEligibleBuild, verify, activate, status, requireFeature, clear
    });
});
