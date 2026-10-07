import assert from 'node:assert/strict';
import test from 'node:test';
import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT } from 'jose';
import {
    AccessTokenError,
    bearerToken,
    parseRemoteAuthConfig,
    verifyJwtAccessToken,
    type RemoteAuthConfig
} from '../src/auth.js';

const TENANT = '11111111-1111-4111-8111-111111111111';
const CLIENT = '22222222-2222-4222-8222-222222222222';
const config: RemoteAuthConfig = {
    issuer:`https://login.example.test/${TENANT}/v2.0`,
    audience:'api://captionkeep-mcp',
    tenantId:TENANT,
    jwksUri:'https://login.example.test/keys',
    allowedClientIds:[CLIENT],
    requiredScopes:['CaptionKeep.Evidence.Read']
};

test('remote configuration requires HTTPS identity, exact tenant, enrolled clients, and scopes', () => {
    const parsed = parseRemoteAuthConfig({
        CAPTIONKEEP_MCP_ISSUER:config.issuer,
        CAPTIONKEEP_MCP_AUDIENCE:config.audience,
        CAPTIONKEEP_MCP_TENANT_ID:TENANT,
        CAPTIONKEEP_MCP_JWKS_URI:config.jwksUri,
        CAPTIONKEEP_MCP_ALLOWED_CLIENT_IDS:CLIENT,
        CAPTIONKEEP_MCP_REQUIRED_SCOPES:'CaptionKeep.Evidence.Read'
    });
    assert.equal(parsed.tenantId, TENANT);
    assert.deepEqual(parsed.allowedClientIds, [CLIENT]);
    assert.throws(() => parseRemoteAuthConfig({
        CAPTIONKEEP_MCP_ISSUER:'http://login.example.test',
        CAPTIONKEEP_MCP_AUDIENCE:config.audience,
        CAPTIONKEEP_MCP_TENANT_ID:'organizations',
        CAPTIONKEEP_MCP_JWKS_URI:config.jwksUri,
        CAPTIONKEEP_MCP_ALLOWED_CLIENT_IDS:CLIENT,
        CAPTIONKEEP_MCP_REQUIRED_SCOPES:'CaptionKeep.Evidence.Read'
    }));
    assert.throws(() => bearerToken(['Bearer one', 'Bearer two']), AccessTokenError);
    assert.throws(() => bearerToken('Basic abc'), AccessTokenError);
});

test('signed access token validation enforces tenant, client, audience, issuer, expiry, and scope', async () => {
    const {privateKey, publicKey} = await generateKeyPair('RS256');
    const publicJwk = await exportJWK(publicKey);
    const keySet = createLocalJWKSet({keys:[{...publicJwk, kid:'test-key', use:'sig', alg:'RS256'}]});
    async function token(overrides: Record<string, unknown> = {}): Promise<string> {
        return new SignJWT({
            tid:TENANT,
            azp:CLIENT,
            scp:'CaptionKeep.Evidence.Read',
            ...overrides
        })
            .setProtectedHeader({alg:'RS256', kid:'test-key'})
            .setIssuer(config.issuer)
            .setAudience(config.audience)
            .setSubject('user-1')
            .setIssuedAt()
            .setExpirationTime('5m')
            .sign(privateKey);
    }

    const valid = await verifyJwtAccessToken(await token(), config, keySet);
    assert.equal(valid.tenantId, TENANT);
    assert.equal(valid.clientId, CLIENT);
    assert.deepEqual(valid.scopes, ['CaptionKeep.Evidence.Read']);

    const wrongTenant = await token({tid:'33333333-3333-4333-8333-333333333333'});
    await assert.rejects(() => verifyJwtAccessToken(wrongTenant, config, keySet), (error: unknown) => error instanceof AccessTokenError && error.status === 403);
    const wrongClient = await token({azp:'44444444-4444-4444-8444-444444444444'});
    await assert.rejects(() => verifyJwtAccessToken(wrongClient, config, keySet), (error: unknown) => error instanceof AccessTokenError && error.status === 403);
    const missingScope = await token({scp:'Other.Scope'});
    await assert.rejects(() => verifyJwtAccessToken(missingScope, config, keySet), (error: unknown) => error instanceof AccessTokenError && error.code === 'insufficient_scope');
});
