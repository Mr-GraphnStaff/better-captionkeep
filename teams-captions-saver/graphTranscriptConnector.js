(() => {
    'use strict';

    const AUTH_STORAGE_KEY = 'graphTranscriptAuthV1';
    const GRAPH_ROOT = 'https://graph.microsoft.com/v1.0/';
    const AUTH_SCOPES = Object.freeze([
        'openid',
        'profile',
        'offline_access',
        'OnlineMeetings.Read',
        'OnlineMeetingTranscript.Read.All'
    ]);
    const GUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    const TEAMS_JOIN_HOSTS = new Set(['teams.microsoft.com', 'teams.cloud.microsoft']);

    class GraphConnectorError extends Error {
        constructor(code, message) {
            super(message);
            this.name = 'GraphConnectorError';
            this.code = code;
        }
    }

    function validateManagedConfig(settings = {}) {
        if (settings.enableGraphTranscriptImport !== true) {
            throw new GraphConnectorError('GRAPH_NOT_ENABLED', 'Verified Teams Transcript is not enabled by your organization.');
        }
        const tenantId = String(settings.graphTenantId || '').trim();
        const clientId = String(settings.graphClientId || '').trim();
        if (!GUID_PATTERN.test(tenantId) || !GUID_PATTERN.test(clientId)) {
            throw new GraphConnectorError('GRAPH_CONFIG_INVALID', 'The managed Microsoft Graph configuration is incomplete.');
        }
        return Object.freeze({ tenantId: tenantId.toLowerCase(), clientId: clientId.toLowerCase() });
    }

    function base64Url(bytes) {
        let binary = '';
        for (const byte of bytes) binary += String.fromCharCode(byte);
        return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
    }

    function randomValue(cryptoApi, size = 32) {
        const bytes = new Uint8Array(size);
        cryptoApi.getRandomValues(bytes);
        return base64Url(bytes);
    }

    async function sha256Base64Url(value, cryptoApi) {
        const data = new TextEncoder().encode(String(value));
        const digest = await cryptoApi.subtle.digest('SHA-256', data);
        return base64Url(new Uint8Array(digest));
    }

    async function sha256Hex(value, cryptoApi) {
        const data = new TextEncoder().encode(String(value));
        const digest = new Uint8Array(await cryptoApi.subtle.digest('SHA-256', data));
        return [...digest].map(byte => byte.toString(16).padStart(2, '0')).join('');
    }

    function decodeJwtPayload(token) {
        try {
            const part = String(token || '').split('.')[1];
            if (!part) return {};
            const normalized = part.replace(/-/g, '+').replace(/_/g, '/');
            const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
            return JSON.parse(atob(padded));
        } catch {
            return {};
        }
    }

    function authorizationEndpoint(config) {
        return `https://login.microsoftonline.com/${config.tenantId}/oauth2/v2.0/authorize`;
    }

    function tokenEndpoint(config) {
        return `https://login.microsoftonline.com/${config.tenantId}/oauth2/v2.0/token`;
    }

    async function createAuthorizationRequest(config, redirectUri, cryptoApi) {
        const verifier = randomValue(cryptoApi, 48);
        const state = randomValue(cryptoApi, 24);
        const nonce = randomValue(cryptoApi, 24);
        const challenge = await sha256Base64Url(verifier, cryptoApi);
        const url = new URL(authorizationEndpoint(config));
        url.searchParams.set('client_id', config.clientId);
        url.searchParams.set('response_type', 'code');
        url.searchParams.set('redirect_uri', redirectUri);
        url.searchParams.set('response_mode', 'query');
        url.searchParams.set('scope', AUTH_SCOPES.join(' '));
        url.searchParams.set('state', state);
        url.searchParams.set('nonce', nonce);
        url.searchParams.set('code_challenge', challenge);
        url.searchParams.set('code_challenge_method', 'S256');
        url.searchParams.set('prompt', 'select_account');
        return { url: url.toString(), verifier, state, nonce };
    }

    async function tokenRequest(config, parameters, fetchImpl) {
        const response = await fetchImpl(tokenEndpoint(config), {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams(parameters)
        });
        const body = await response.json().catch(() => ({}));
        if (!response.ok || !body.access_token) {
            const code = String(body.error || 'TOKEN_REQUEST_FAILED');
            throw new GraphConnectorError(code, 'Microsoft sign-in could not issue an access token.');
        }
        const idClaims = decodeJwtPayload(body.id_token);
        const accessClaims = decodeJwtPayload(body.access_token);
        const tenantClaim = String(idClaims.tid || accessClaims.tid || '').toLowerCase();
        if (tenantClaim && tenantClaim !== config.tenantId) {
            throw new GraphConnectorError('TENANT_MISMATCH', 'Microsoft signed in to a different tenant than the managed configuration.');
        }
        if (idClaims.aud && String(idClaims.aud).toLowerCase() !== config.clientId) {
            throw new GraphConnectorError('CLIENT_MISMATCH', 'Microsoft returned an identity token for a different application.');
        }
        return {
            accessToken: body.access_token,
            refreshToken: body.refresh_token || null,
            idToken: body.id_token || null,
            expiresAt: Date.now() + (Math.max(60, Number(body.expires_in) || 3600) * 1000),
            tenantId: config.tenantId,
            clientId: config.clientId,
            account: {
                name: String(idClaims.name || ''),
                username: String(idClaims.preferred_username || ''),
                objectId: String(idClaims.oid || accessClaims.oid || '')
            }
        };
    }

    async function connect(settings, dependencies = {}) {
        const config = validateManagedConfig(settings);
        const chromeApi = dependencies.chromeApi || chrome;
        const cryptoApi = dependencies.cryptoApi || crypto;
        const fetchImpl = dependencies.fetchImpl || fetch;
        if (!chromeApi.identity?.launchWebAuthFlow || !chromeApi.identity?.getRedirectURL) {
            throw new GraphConnectorError('IDENTITY_API_UNAVAILABLE', 'The browser identity API is unavailable.');
        }
        const redirectUri = chromeApi.identity.getRedirectURL('microsoft');
        const request = await createAuthorizationRequest(config, redirectUri, cryptoApi);
        const finalUrl = await chromeApi.identity.launchWebAuthFlow({ url: request.url, interactive: true });
        if (!finalUrl) throw new GraphConnectorError('AUTH_CANCELLED', 'Microsoft sign-in was cancelled.');

        const expected = new URL(redirectUri);
        const returned = new URL(finalUrl);
        if (returned.origin !== expected.origin || returned.pathname !== expected.pathname) {
            throw new GraphConnectorError('REDIRECT_MISMATCH', 'Microsoft returned to an unexpected redirect URI.');
        }
        if (returned.searchParams.get('state') !== request.state) {
            throw new GraphConnectorError('STATE_MISMATCH', 'Microsoft sign-in state validation failed.');
        }
        if (returned.searchParams.has('error')) {
            throw new GraphConnectorError(returned.searchParams.get('error'), 'Microsoft sign-in did not complete.');
        }
        const code = returned.searchParams.get('code');
        if (!code) throw new GraphConnectorError('AUTH_CODE_MISSING', 'Microsoft sign-in did not return an authorization code.');

        const auth = await tokenRequest(config, {
            client_id: config.clientId,
            grant_type: 'authorization_code',
            code,
            redirect_uri: redirectUri,
            code_verifier: request.verifier,
            scope: AUTH_SCOPES.join(' ')
        }, fetchImpl);
        const idClaims = decodeJwtPayload(auth.idToken);
        if (!idClaims.nonce || idClaims.nonce !== request.nonce) {
            throw new GraphConnectorError('NONCE_MISMATCH', 'Microsoft sign-in nonce validation failed.');
        }
        delete auth.idToken;
        await chromeApi.storage.session.set({ [AUTH_STORAGE_KEY]: auth });
        return publicAuthStatus(auth, redirectUri);
    }

    async function refresh(config, auth, fetchImpl) {
        if (!auth?.refreshToken) throw new GraphConnectorError('SIGN_IN_REQUIRED', 'Connect Microsoft 365 to import an official transcript.');
        const refreshed = await tokenRequest(config, {
            client_id: config.clientId,
            grant_type: 'refresh_token',
            refresh_token: auth.refreshToken,
            scope: AUTH_SCOPES.join(' ')
        }, fetchImpl);
        delete refreshed.idToken;
        if (!refreshed.refreshToken) refreshed.refreshToken = auth.refreshToken;
        if (!refreshed.account.name && !refreshed.account.username) refreshed.account = auth.account || refreshed.account;
        return refreshed;
    }

    async function getAccessToken(settings, dependencies = {}) {
        const config = validateManagedConfig(settings);
        const chromeApi = dependencies.chromeApi || chrome;
        const fetchImpl = dependencies.fetchImpl || fetch;
        const stored = await chromeApi.storage.session.get(AUTH_STORAGE_KEY);
        let auth = stored[AUTH_STORAGE_KEY];
        if (!auth || auth.tenantId !== config.tenantId || auth.clientId !== config.clientId) {
            throw new GraphConnectorError('SIGN_IN_REQUIRED', 'Connect Microsoft 365 to import an official transcript.');
        }
        if (!Number.isFinite(auth.expiresAt) || auth.expiresAt <= Date.now() + 120000) {
            try {
                auth = await refresh(config, auth, fetchImpl);
                await chromeApi.storage.session.set({ [AUTH_STORAGE_KEY]: auth });
            } catch (error) {
                await chromeApi.storage.session.remove(AUTH_STORAGE_KEY);
                throw error;
            }
        }
        return auth.accessToken;
    }

    function publicAuthStatus(auth, redirectUri) {
        return {
            connected: !!auth?.accessToken,
            accountLabel: auth?.account?.username || auth?.account?.name || '',
            expiresAt: Number(auth?.expiresAt) || null,
            tenantId: auth?.tenantId || null,
            redirectUri
        };
    }

    async function status(settings, dependencies = {}) {
        const chromeApi = dependencies.chromeApi || chrome;
        const redirectUri = chromeApi.identity?.getRedirectURL?.('microsoft') || null;
        let config;
        try {
            config = validateManagedConfig(settings);
        } catch (error) {
            return { configured: false, connected: false, redirectUri, code: error.code || 'GRAPH_CONFIG_INVALID' };
        }
        const stored = await chromeApi.storage.session.get(AUTH_STORAGE_KEY);
        const auth = stored[AUTH_STORAGE_KEY];
        const valid = auth?.tenantId === config.tenantId && auth?.clientId === config.clientId;
        return { configured: true, ...publicAuthStatus(valid ? auth : null, redirectUri) };
    }

    async function disconnect(dependencies = {}) {
        const chromeApi = dependencies.chromeApi || chrome;
        await chromeApi.storage.session.remove(AUTH_STORAGE_KEY);
        return { connected: false };
    }

    function validateJoinUrl(value) {
        let url;
        try {
            url = new URL(String(value || '').trim());
        } catch {
            throw new GraphConnectorError('JOIN_URL_INVALID', 'Paste the complete Microsoft Teams meeting join link.');
        }
        const supportedPath = url.pathname.startsWith('/l/meetup-join/') || /^\/meet\/\d+\/?$/.test(url.pathname);
        if (url.protocol !== 'https:' || !TEAMS_JOIN_HOSTS.has(url.hostname.toLowerCase()) || !supportedPath) {
            throw new GraphConnectorError('JOIN_URL_INVALID', 'Use an HTTPS Microsoft Teams meeting join link.');
        }
        url.hash = '';
        return url.toString();
    }

    async function graphResponse(url, token, fetchImpl, options = {}) {
        const target = new URL(url);
        if (target.origin !== 'https://graph.microsoft.com' || !target.pathname.startsWith('/v1.0/')) {
            throw new GraphConnectorError('GRAPH_URL_REJECTED', 'A Microsoft Graph response contained an unexpected URL.');
        }
        const response = await fetchImpl(target.toString(), {
            method: 'GET',
            headers: {
                Authorization: `Bearer ${token}`,
                Accept: options.accept || 'application/json'
            }
        });
        if (!response.ok) {
            let body = {};
            try { body = await response.clone().json(); } catch { /* no JSON error body */ }
            const code = String(body?.error?.innerError?.code || body?.error?.code || `HTTP_${response.status}`);
            const messages = {
                GraphAccessToTranscriptsDisabled: 'Your Teams administrator has disabled Graph transcript access.',
                SpeakerAttributionNotAllowed: 'Your Teams administrator does not allow speaker attribution.',
                Authorization_RequestDenied: 'Microsoft Graph denied access to this meeting transcript.'
            };
            throw new GraphConnectorError(code, messages[code] || `Microsoft Graph denied the request (${response.status}).`);
        }
        return response;
    }

    async function resolveMeeting(joinUrl, token, fetchImpl) {
        const parsed = new URL(joinUrl);
        const currentMeetingMatch = parsed.pathname.match(/^\/meet\/(\d+)\/?$/);
        const filter = currentMeetingMatch
            ? `joinMeetingIdSettings/joinMeetingId eq '${currentMeetingMatch[1]}'`
            : `JoinWebUrl eq '${joinUrl.replace(/'/g, "''")}'`;
        const url = new URL(`${GRAPH_ROOT}me/onlineMeetings`);
        url.searchParams.set('$filter', filter);
        const response = await graphResponse(url, token, fetchImpl);
        const body = await response.json();
        const meeting = Array.isArray(body?.value) ? body.value[0] : null;
        if (!meeting?.id) throw new GraphConnectorError('MEETING_NOT_FOUND', 'Microsoft Graph could not find an eligible meeting for that join link.');
        return meeting;
    }

    async function listTranscripts(meetingId, token, fetchImpl) {
        const url = `${GRAPH_ROOT}me/onlineMeetings/${encodeURIComponent(meetingId)}/transcripts`;
        const response = await graphResponse(url, token, fetchImpl);
        const body = await response.json();
        const transcripts = Array.isArray(body?.value) ? body.value : [];
        if (!transcripts.length) throw new GraphConnectorError('TRANSCRIPT_NOT_FOUND', 'Teams has not made an official transcript available for this meeting.');
        return transcripts.sort((a, b) => Date.parse(b.createdDateTime || '') - Date.parse(a.createdDateTime || ''));
    }

    async function downloadTranscript(meetingId, transcriptId, token, fetchImpl) {
        const url = `${GRAPH_ROOT}me/onlineMeetings/${encodeURIComponent(meetingId)}/transcripts/${encodeURIComponent(transcriptId)}/content`;
        try {
            const response = await graphResponse(url, token, fetchImpl, { accept: 'text/vtt' });
            return { raw: await response.text(), contentType: response.headers.get('content-type') || 'text/vtt', attributed: true };
        } catch (error) {
            if (error.code !== 'SpeakerAttributionNotAllowed') throw error;
            const response = await graphResponse(url, token, fetchImpl, { accept: 'application/vnd.microsoft.graph.transcript+text' });
            return { raw: await response.text(), contentType: response.headers.get('content-type') || 'application/vnd.microsoft.graph.transcript+text', attributed: false };
        }
    }

    function decodeEntities(value) {
        return String(value || '')
            .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
            .replace(/&quot;/g, '"').replace(/&#39;/g, "'");
    }

    function stripVttMarkup(value) {
        return decodeEntities(String(value || '').replace(/<[^>]*>/g, '')).replace(/\s+/g, ' ').trim();
    }

    function timestampOffsetMs(value) {
        const match = String(value || '').match(/^(?:(\d{2,}):)?(\d{2}):(\d{2})\.(\d{3})$/);
        if (!match) return 0;
        return (((Number(match[1] || 0) * 60 + Number(match[2])) * 60 + Number(match[3])) * 1000) + Number(match[4]);
    }

    function parseTranscript(raw, transcript = {}, attributed = true) {
        const normalized = String(raw || '').replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
        const lines = normalized.split('\n');
        const baseTime = Date.parse(transcript.createdDateTime || '');
        const entries = [];
        for (let index = 0; index < lines.length; index += 1) {
            const timingLine = lines[index].trim();
            if (!timingLine.includes('-->')) continue;
            const timing = timingLine.split('-->');
            const start = timing[0].trim().split(/\s+/)[0];
            const payloadLines = [];
            let cursor = index + 1;
            while (cursor < lines.length) {
                const candidate = lines[cursor].trim();
                if (candidate.includes('-->')) break;
                const next = lines[cursor + 1]?.trim() || '';
                if (candidate && next.includes('-->')) break;
                if (candidate && !/^(NOTE|STYLE|REGION)(?:\s|$)/.test(candidate)) payloadLines.push(candidate);
                cursor += 1;
            }
            const payload = payloadLines.join(' ').trim();
            if (!payload) continue;
            const voice = payload.match(/<v(?:\.[^\s>]+)?\s+([^>]+)>/i);
            const name = attributed && voice ? stripVttMarkup(voice[1]) : 'Unknown speaker';
            const text = stripVttMarkup(payload);
            if (!text) continue;
            const offset = timestampOffsetMs(start);
            entries.push({
                Name: name || 'Unknown speaker',
                Text: text,
                Time: start,
                capturedAt: Number.isFinite(baseTime) ? new Date(baseTime + offset).toISOString() : new Date(offset).toISOString(),
                key: `graph-${entries.length + 1}`
            });
            index = Math.max(index, cursor - 1);
        }
        if (!entries.length) throw new GraphConnectorError('TRANSCRIPT_PARSE_FAILED', 'The official transcript format could not be read safely.');
        return entries;
    }

    async function importTranscript(settings, joinUrlValue, dependencies = {}) {
        const config = validateManagedConfig(settings);
        const cryptoApi = dependencies.cryptoApi || crypto;
        const fetchImpl = dependencies.fetchImpl || fetch;
        const token = await getAccessToken(settings, dependencies);
        const joinUrl = validateJoinUrl(joinUrlValue);
        const meeting = await resolveMeeting(joinUrl, token, fetchImpl);
        const [transcript] = await listTranscripts(meeting.id, token, fetchImpl);
        const downloaded = await downloadTranscript(meeting.id, transcript.id, token, fetchImpl);
        const entries = parseTranscript(downloaded.raw, transcript, downloaded.attributed);
        return {
            transcript: entries,
            rawSource: downloaded.raw,
            title: `Official Teams transcript — ${meeting.subject || new Date(transcript.createdDateTime || Date.now()).toLocaleDateString()}`,
            source: {
                type: 'microsoft-graph',
                provider: 'Microsoft Teams',
                importedAt: new Date().toISOString(),
                createdDateTime: transcript.createdDateTime || null,
                contentType: downloaded.contentType,
                speakerAttribution: downloaded.attributed ? 'included' : 'not-allowed',
                tenantId: config.tenantId,
                meetingIdSha256: await sha256Hex(meeting.id, cryptoApi),
                transcriptIdSha256: await sha256Hex(transcript.id, cryptoApi),
                sourceSha256: await sha256Hex(downloaded.raw, cryptoApi)
            }
        };
    }

    const api = Object.freeze({
        AUTH_SCOPES,
        GraphConnectorError,
        validateManagedConfig,
        validateJoinUrl,
        createAuthorizationRequest,
        parseTranscript,
        connect,
        disconnect,
        status,
        importTranscript
    });

    globalThis.CaptionKeepGraphTranscript = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})();
