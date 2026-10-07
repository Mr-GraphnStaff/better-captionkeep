import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import type { AddressInfo } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { AccessTokenError, type CaptionKeepAuthInfo } from '../src/auth.js';
import { createAuthenticatedHttpServer, parseRemoteHttpConfig, type RemoteHttpConfig } from '../src/httpServer.js';
import { FileEvidenceRepository } from '../src/repository.js';
import { assertReadOnlyToolContract } from './contract.js';

test('remote HTTP configuration fails closed without HTTPS origin, issuer, scope, and allowlists', () => {
    const parsed = parseRemoteHttpConfig({
        CAPTIONKEEP_MCP_PUBLIC_ORIGIN:'https://mcp.customer.example',
        CAPTIONKEEP_MCP_ISSUER:'https://login.customer.example/tenant/v2.0',
        CAPTIONKEEP_MCP_REQUIRED_SCOPES:'CaptionKeep.Evidence.Read',
        CAPTIONKEEP_MCP_ALLOWED_HOSTS:'mcp.customer.example',
        CAPTIONKEEP_MCP_ALLOWED_ORIGINS:'mcp.customer.example'
    });
    assert.equal(parsed.host, '127.0.0.1');
    assert.equal(parsed.port, 3333);
    assert.equal(parsed.endpointPath, '/mcp');
    assert.throws(() => parseRemoteHttpConfig({
        CAPTIONKEEP_MCP_PUBLIC_ORIGIN:'http://mcp.customer.example',
        CAPTIONKEEP_MCP_ISSUER:'https://login.customer.example/tenant/v2.0',
        CAPTIONKEEP_MCP_REQUIRED_SCOPES:'CaptionKeep.Evidence.Read'
    }));
});

test('authenticated Streamable HTTP profile enforces bearer auth and serves the same read-only tools', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'captionkeep-mcp-http-'));
    const config: RemoteHttpConfig = {
        host:'127.0.0.1',
        port:0,
        endpointPath:'/mcp',
        publicOrigin:new URL('https://mcp.customer.example'),
        authorizationServer:'https://login.customer.example/tenant/v2.0',
        allowedHostnames:['127.0.0.1'],
        allowedOriginHostnames:['mcp.customer.example'],
        requiredScopes:['CaptionKeep.Evidence.Read']
    };
    const authInfo: CaptionKeepAuthInfo = {
        token:'valid-token',
        clientId:'22222222-2222-4222-8222-222222222222',
        scopes:['CaptionKeep.Evidence.Read'],
        expiresAt:Date.now() / 1000 + 300,
        tenantId:'11111111-1111-4111-8111-111111111111',
        subject:'test-subject'
    };
    const verify = async (authorization: string | string[] | undefined): Promise<CaptionKeepAuthInfo> => {
        if (authorization !== 'Bearer valid-token') throw new AccessTokenError('Invalid test token.', 401, 'invalid_token');
        return authInfo;
    };
    const server = createAuthenticatedHttpServer(new FileEvidenceRepository(directory), config, verify);
    await new Promise<void>((resolve, reject) => {
        server.once('error', reject);
        server.listen(0, '127.0.0.1', resolve);
    });
    const address = server.address() as AddressInfo;
    const endpoint = new URL(`http://127.0.0.1:${address.port}/mcp`);
    const transport = new StreamableHTTPClientTransport(endpoint, {authProvider:{token:async () => 'valid-token'}});
    const client = new Client({name:'captionkeep-http-contract-test', version:'1.0.0'});

    try {
        const unauthorized = await fetch(endpoint, {method:'POST', headers:{'content-type':'application/json'}, body:'{}'});
        assert.equal(unauthorized.status, 401);
        assert.match(unauthorized.headers.get('www-authenticate') || '', /resource_metadata=/);

        const metadata = await fetch(new URL(`http://127.0.0.1:${address.port}/.well-known/oauth-protected-resource`));
        assert.equal(metadata.status, 200);
        assert.equal((await metadata.json() as {resource:string}).resource, 'https://mcp.customer.example/mcp');

        await client.connect(transport);
        await assertReadOnlyToolContract(client);
    } finally {
        await client.close().catch(() => undefined);
        await new Promise<void>(resolve => server.close(() => resolve()));
        await rm(directory, {recursive:true, force:true});
    }
});
