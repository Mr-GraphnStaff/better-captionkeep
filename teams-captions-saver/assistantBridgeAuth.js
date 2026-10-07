(function initializeAssistantBridgeAuth(root) {
    'use strict';

    const STORAGE_KEY = 'assistantBridgeAuthV1';
    const PENDING_KEY = 'assistantBridgeAuthPendingV1';
    const PENDING_TTL_MS = 5 * 60 * 1000;
    const MAX_TOKEN_RESPONSE_BYTES = 1024 * 1024;

    class AssistantAuthError extends Error {
        constructor(code, message) {
            super(message);
            this.name = 'AssistantAuthError';
            this.code = String(code || 'ASSISTANT_AUTH_ERROR');
        }
    }

    function base64Url(bytes) {
        let binary = '';
        for (const byte of bytes) binary += String.fromCharCode(byte);
        return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
    }

    function randomValue(length = 32) {
        const bytes = new Uint8Array(length);
        crypto.getRandomValues(bytes);
        return base64Url(bytes);
    }

    async function challenge(verifier) {
        const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
        return base64Url(new Uint8Array(digest));
    }

    function validateRemoteProfile(profile) {
        if (!profile || profile.mode !== 'remote' || !profile.endpointUrl || !profile.authorizationEndpoint
            || !profile.tokenEndpoint || !profile.clientId || !Array.isArray(profile.scopes) || !profile.scopes.length) {
            throw new AssistantAuthError('CONFIGURATION_INVALID', 'Complete the customer assistant OAuth setup first.');
        }
        return profile;
    }

    function redirectUri(chromeApi) {
        if (!chromeApi.identity?.getRedirectURL) throw new AssistantAuthError('IDENTITY_UNAVAILABLE', 'Browser sign-in is not available.');
        return chromeApi.identity.getRedirectURL('assistant-bridge');
    }

    function profileKey(profile) {
        return [profile.endpointUrl, profile.authorizationEndpoint, profile.tokenEndpoint,
            profile.clientId, ...profile.scopes].join('|');
    }

    async function tokenResponse(profile, parameters, fetchImpl) {
        let response;
        try {
            response = await fetchImpl(profile.tokenEndpoint, {
                method:'POST',
                headers:{'Content-Type':'application/x-www-form-urlencoded', Accept:'application/json'},
                body:new URLSearchParams(parameters).toString(),
                cache:'no-store', credentials:'omit', redirect:'error', referrerPolicy:'no-referrer'
            });
        } catch {
            throw new AssistantAuthError('TOKEN_ENDPOINT_UNREACHABLE', 'The customer identity service could not be reached.');
        }
        const contentLength = Number(response.headers?.get?.('content-length'));
        if (Number.isFinite(contentLength) && contentLength > MAX_TOKEN_RESPONSE_BYTES) {
            throw new AssistantAuthError('TOKEN_RESPONSE_INVALID', 'The identity response is too large.');
        }
        const text = await response.text();
        if (new TextEncoder().encode(text).byteLength > MAX_TOKEN_RESPONSE_BYTES) {
            throw new AssistantAuthError('TOKEN_RESPONSE_INVALID', 'The identity response is too large.');
        }
        let body;
        try { body = JSON.parse(text); } catch { body = {}; }
        if (!response.ok || typeof body.access_token !== 'string' || !body.access_token) {
            throw new AssistantAuthError(String(body.error || 'TOKEN_DENIED').slice(0, 100),
                'The customer identity service did not issue an access token.');
        }
        const expiresIn = Math.min(86_400, Math.max(60, Number(body.expires_in) || 3600));
        return Object.freeze({
            accessToken:body.access_token,
            refreshToken:typeof body.refresh_token === 'string' && body.refresh_token ? body.refresh_token : null,
            tokenType:String(body.token_type || 'Bearer'),
            scope:String(body.scope || parameters.scope || ''),
            expiresAt:Date.now() + (expiresIn * 1000)
        });
    }

    async function connect(profileInput, dependencies = {}) {
        const profile = validateRemoteProfile(profileInput);
        const chromeApi = dependencies.chromeApi || chrome;
        const fetchImpl = dependencies.fetch || root.fetch;
        if (typeof fetchImpl !== 'function') throw new AssistantAuthError('IDENTITY_UNAVAILABLE', 'Network sign-in is not available.');
        if (!chromeApi.identity?.launchWebAuthFlow || !chromeApi.storage?.session) {
            throw new AssistantAuthError('IDENTITY_UNAVAILABLE', 'Browser sign-in is not available.');
        }
        const redirect = redirectUri(chromeApi);
        const state = randomValue();
        const verifier = randomValue(64);
        const createdAt = Date.now();
        await chromeApi.storage.session.set({[PENDING_KEY]:{state, verifier, createdAt, profileKey:profileKey(profile)}});
        const authorize = new URL(profile.authorizationEndpoint);
        authorize.searchParams.set('response_type', 'code');
        authorize.searchParams.set('client_id', profile.clientId);
        authorize.searchParams.set('redirect_uri', redirect);
        authorize.searchParams.set('scope', profile.scopes.join(' '));
        authorize.searchParams.set('state', state);
        authorize.searchParams.set('code_challenge', await challenge(verifier));
        authorize.searchParams.set('code_challenge_method', 'S256');
        let finalUrl;
        try {
            finalUrl = await chromeApi.identity.launchWebAuthFlow({url:authorize.toString(), interactive:true});
        } catch {
            await chromeApi.storage.session.remove(PENDING_KEY);
            throw new AssistantAuthError('AUTH_CANCELLED', 'Customer assistant sign-in was cancelled or denied.');
        }
        const pending = (await chromeApi.storage.session.get(PENDING_KEY))[PENDING_KEY];
        await chromeApi.storage.session.remove(PENDING_KEY);
        if (!pending || pending.profileKey !== profileKey(profile) || pending.state !== state
            || Date.now() - Number(pending.createdAt || 0) > PENDING_TTL_MS) {
            throw new AssistantAuthError('AUTH_STATE_INVALID', 'The customer assistant sign-in request expired or changed.');
        }
        const callback = new URL(finalUrl);
        const expected = new URL(redirect);
        if (callback.origin !== expected.origin || callback.pathname !== expected.pathname) {
            throw new AssistantAuthError('AUTH_REDIRECT_INVALID', 'The customer assistant returned an unexpected sign-in address.');
        }
        if (callback.searchParams.get('state') !== state) {
            throw new AssistantAuthError('AUTH_STATE_INVALID', 'The customer assistant sign-in state did not match.');
        }
        if (callback.searchParams.get('error')) throw new AssistantAuthError('AUTH_DENIED', 'Customer assistant sign-in was denied.');
        const code = callback.searchParams.get('code');
        if (!code) throw new AssistantAuthError('AUTH_CODE_MISSING', 'Customer assistant sign-in returned no authorization code.');
        const token = await tokenResponse(profile, {
            grant_type:'authorization_code', code, client_id:profile.clientId,
            redirect_uri:redirect, code_verifier:verifier, scope:profile.scopes.join(' ')
        }, fetchImpl);
        const auth = Object.freeze({...token, endpointUrl:profile.endpointUrl, profileKey:profileKey(profile)});
        await chromeApi.storage.session.set({[STORAGE_KEY]:auth});
        return Object.freeze({connected:true, expiresAt:auth.expiresAt, scope:auth.scope});
    }

    async function getAccessToken(profileInput, dependencies = {}) {
        const profile = validateRemoteProfile(profileInput);
        const chromeApi = dependencies.chromeApi || chrome;
        const fetchImpl = dependencies.fetch || root.fetch;
        const auth = (await chromeApi.storage.session.get(STORAGE_KEY))[STORAGE_KEY];
        if (!auth || auth.profileKey !== profileKey(profile) || auth.endpointUrl !== profile.endpointUrl) {
            if (auth) await chromeApi.storage.session.remove(STORAGE_KEY);
            throw new AssistantAuthError('AUTH_REQUIRED', 'Connect to the customer assistant first.');
        }
        if (Number(auth.expiresAt) > Date.now() + 60_000) return auth.accessToken;
        if (!auth.refreshToken) {
            await chromeApi.storage.session.remove(STORAGE_KEY);
            throw new AssistantAuthError('AUTH_REQUIRED', 'Reconnect to the customer assistant.');
        }
        if (typeof fetchImpl !== 'function') {
            await chromeApi.storage.session.remove(STORAGE_KEY);
            throw new AssistantAuthError('IDENTITY_UNAVAILABLE', 'Network sign-in is not available.');
        }
        let refreshed;
        try {
            refreshed = await tokenResponse(profile, {
                grant_type:'refresh_token', refresh_token:auth.refreshToken,
                client_id:profile.clientId, scope:profile.scopes.join(' ')
            }, fetchImpl);
        } catch (error) {
            await chromeApi.storage.session.remove(STORAGE_KEY);
            throw error;
        }
        const next = Object.freeze({...refreshed,
            refreshToken:refreshed.refreshToken || auth.refreshToken,
            endpointUrl:profile.endpointUrl, profileKey:profileKey(profile)});
        await chromeApi.storage.session.set({[STORAGE_KEY]:next});
        return next.accessToken;
    }

    async function status(profileInput, dependencies = {}) {
        const profile = validateRemoteProfile(profileInput);
        const chromeApi = dependencies.chromeApi || chrome;
        const auth = (await chromeApi.storage.session.get(STORAGE_KEY))[STORAGE_KEY];
        const connected = !!auth && auth.profileKey === profileKey(profile)
            && auth.endpointUrl === profile.endpointUrl && Number(auth.expiresAt) > Date.now();
        return Object.freeze({connected, expiresAt:connected ? Number(auth.expiresAt) : null});
    }

    async function disconnect(dependencies = {}) {
        const chromeApi = dependencies.chromeApi || chrome;
        await chromeApi.storage.session.remove([STORAGE_KEY, PENDING_KEY]);
        return Object.freeze({connected:false});
    }

    root.CaptionKeepAssistantBridgeAuth = Object.freeze({
        STORAGE_KEY, PENDING_KEY, PENDING_TTL_MS, AssistantAuthError,
        randomValue, challenge, profileKey, connect, getAccessToken, status, disconnect
    });
    if (typeof module !== 'undefined' && module.exports) module.exports = root.CaptionKeepAssistantBridgeAuth;
})(typeof globalThis !== 'undefined' ? globalThis : this);
