import type { AuthInfo } from '@modelcontextprotocol/server';
import {
    createRemoteJWKSet,
    jwtVerify,
    type JWTPayload,
    type JWTVerifyGetKey
} from 'jose';

const GUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export interface RemoteAuthConfig {
    issuer: string;
    audience: string;
    tenantId: string;
    jwksUri: string;
    allowedClientIds: readonly string[];
    requiredScopes: readonly string[];
}

export interface CaptionKeepAuthInfo extends AuthInfo {
    tenantId: string;
    subject: string;
}

export class AccessTokenError extends Error {
    constructor(
        message: string,
        readonly status: 401 | 403,
        readonly code: 'invalid_token' | 'insufficient_scope'
    ) {
        super(message);
        this.name = 'AccessTokenError';
    }
}

function required(value: string | undefined, name: string): string {
    const normalized = String(value || '').trim();
    if (!normalized) throw new TypeError(`${name} is required for the customer-hosted MCP profile.`);
    return normalized;
}

function httpsUrl(value: string, name: string): string {
    const parsed = new URL(value);
    if (parsed.protocol !== 'https:') throw new TypeError(`${name} must use HTTPS.`);
    parsed.hash = '';
    return parsed.toString().replace(/\/$/, '');
}

function list(value: string | undefined): string[] {
    return [...new Set(String(value || '').split(/[\s,]+/).map(entry => entry.trim()).filter(Boolean))];
}

export function parseRemoteAuthConfig(environment: NodeJS.ProcessEnv): RemoteAuthConfig {
    const tenantId = required(environment.CAPTIONKEEP_MCP_TENANT_ID, 'CAPTIONKEEP_MCP_TENANT_ID');
    if (!GUID_PATTERN.test(tenantId)) throw new TypeError('CAPTIONKEEP_MCP_TENANT_ID must be an exact tenant GUID.');
    const allowedClientIds = list(environment.CAPTIONKEEP_MCP_ALLOWED_CLIENT_IDS);
    if (!allowedClientIds.length || allowedClientIds.some(clientId => !GUID_PATTERN.test(clientId))) {
        throw new TypeError('CAPTIONKEEP_MCP_ALLOWED_CLIENT_IDS must contain one or more client GUIDs.');
    }
    const requiredScopes = list(environment.CAPTIONKEEP_MCP_REQUIRED_SCOPES);
    if (!requiredScopes.length) throw new TypeError('CAPTIONKEEP_MCP_REQUIRED_SCOPES must contain at least one scope or app role.');
    return Object.freeze({
        issuer:httpsUrl(required(environment.CAPTIONKEEP_MCP_ISSUER, 'CAPTIONKEEP_MCP_ISSUER'), 'CAPTIONKEEP_MCP_ISSUER'),
        audience:required(environment.CAPTIONKEEP_MCP_AUDIENCE, 'CAPTIONKEEP_MCP_AUDIENCE'),
        tenantId:tenantId.toLowerCase(),
        jwksUri:httpsUrl(required(environment.CAPTIONKEEP_MCP_JWKS_URI, 'CAPTIONKEEP_MCP_JWKS_URI'), 'CAPTIONKEEP_MCP_JWKS_URI'),
        allowedClientIds:Object.freeze(allowedClientIds.map(value => value.toLowerCase())),
        requiredScopes:Object.freeze(requiredScopes)
    });
}

function stringClaim(payload: JWTPayload, names: string[]): string {
    for (const name of names) {
        const value = payload[name];
        if (typeof value === 'string' && value.trim()) return value.trim();
    }
    return '';
}

function grantedScopes(payload: JWTPayload): string[] {
    const delegated = typeof payload.scp === 'string' ? payload.scp.split(/\s+/) : [];
    const roles = Array.isArray(payload.roles) ? payload.roles.filter((value): value is string => typeof value === 'string') : [];
    return [...new Set([...delegated, ...roles].map(value => value.trim()).filter(Boolean))];
}

export function bearerToken(authorization: string | string[] | undefined): string {
    if (Array.isArray(authorization)) throw new AccessTokenError('Multiple Authorization headers are not accepted.', 401, 'invalid_token');
    const match = /^Bearer\s+([^\s]+)$/i.exec(String(authorization || '').trim());
    if (!match?.[1]) throw new AccessTokenError('A bearer access token is required.', 401, 'invalid_token');
    if (match[1].length > 16_384) throw new AccessTokenError('The bearer token is too large.', 401, 'invalid_token');
    return match[1];
}

export async function verifyJwtAccessToken(token: string, config: RemoteAuthConfig, getKey: JWTVerifyGetKey): Promise<CaptionKeepAuthInfo> {
    let payload: JWTPayload;
    try {
        ({payload} = await jwtVerify(token, getKey, {
            issuer:config.issuer,
            audience:config.audience,
            algorithms:['RS256'],
            clockTolerance:5
        }));
    } catch {
        throw new AccessTokenError('The access token signature or registered claims are invalid.', 401, 'invalid_token');
    }

    const expiresAt = payload.exp;
    const tenantId = stringClaim(payload, ['tid', 'tenant_id']).toLowerCase();
    const clientId = stringClaim(payload, ['azp', 'client_id', 'appid']).toLowerCase();
    const subject = stringClaim(payload, ['sub', 'oid']);
    if (!Number.isSafeInteger(expiresAt)) throw new AccessTokenError('The access token must have an expiry.', 401, 'invalid_token');
    const expiry = Number(expiresAt);
    if (tenantId !== config.tenantId) throw new AccessTokenError('The access token belongs to another tenant.', 403, 'invalid_token');
    if (!config.allowedClientIds.includes(clientId)) throw new AccessTokenError('The calling client is not enrolled.', 403, 'invalid_token');
    if (!subject) throw new AccessTokenError('The access token has no subject identity.', 401, 'invalid_token');

    const scopes = grantedScopes(payload);
    const missing = config.requiredScopes.filter(scope => !scopes.includes(scope));
    if (missing.length) throw new AccessTokenError(`Required scope or role is missing: ${missing.join(', ')}.`, 403, 'insufficient_scope');
    return Object.freeze({token, clientId, scopes:[...scopes], expiresAt:expiry, tenantId, subject});
}

export function createRemoteAccessTokenVerifier(config: RemoteAuthConfig): (authorization: string | string[] | undefined) => Promise<CaptionKeepAuthInfo> {
    const remoteKeys = createRemoteJWKSet(new URL(config.jwksUri), {
        timeoutDuration:5_000,
        cooldownDuration:30_000,
        cacheMaxAge:10 * 60_000
    });
    return async authorization => verifyJwtAccessToken(bearerToken(authorization), config, remoteKeys);
}
