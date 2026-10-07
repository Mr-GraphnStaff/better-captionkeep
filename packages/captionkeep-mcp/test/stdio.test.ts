import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';
import { assertReadOnlyToolContract } from './contract.js';

function inheritedEnvironment(extra: Record<string, string>): Record<string, string> {
    const entries = Object.entries(process.env).filter((entry): entry is [string, string] => typeof entry[1] === 'string');
    return {...Object.fromEntries(entries), ...extra};
}

test('stdio server negotiates MCP, lists only read-only tools, and serves a tool call', async () => {
    const evidenceDirectory = await mkdtemp(path.join(os.tmpdir(), 'captionkeep-mcp-stdio-'));
    const serverEntry = new URL('../src/index.js', import.meta.url).pathname.replace(/^\/(.:\/)/, '$1');
    const transport = new StdioClientTransport({
        command:process.execPath,
        args:[serverEntry],
        env:inheritedEnvironment({CAPTIONKEEP_EVIDENCE_DIR:evidenceDirectory}),
        stderr:'pipe'
    });
    const client = new Client({name:'captionkeep-contract-test', version:'1.0.0'});

    try {
        await client.connect(transport);
        await assertReadOnlyToolContract(client);
    } finally {
        await client.close().catch(() => undefined);
        await rm(evidenceDirectory, {recursive:true, force:true});
    }
});
