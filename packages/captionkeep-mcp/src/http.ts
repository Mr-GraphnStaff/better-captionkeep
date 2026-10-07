#!/usr/bin/env node
import { createRemoteAccessTokenVerifier, parseRemoteAuthConfig } from './auth.js';
import { createAuthenticatedHttpServer, parseRemoteHttpConfig } from './httpServer.js';
import { FileEvidenceRepository } from './repository.js';

const evidenceDirectory = process.env.CAPTIONKEEP_EVIDENCE_DIR?.trim();
if (!evidenceDirectory) {
    console.error('CAPTIONKEEP_EVIDENCE_DIR must name the approved Better CaptionKeep evidence directory.');
    process.exit(1);
}

const authConfig = parseRemoteAuthConfig(process.env);
const httpConfig = parseRemoteHttpConfig(process.env);
const repository = new FileEvidenceRepository(evidenceDirectory);
const verifyAccessToken = createRemoteAccessTokenVerifier(authConfig);
const server = createAuthenticatedHttpServer(repository, httpConfig, verifyAccessToken);

server.listen(httpConfig.port, httpConfig.host, () => {
    const endpoint = new URL(httpConfig.endpointPath, httpConfig.publicOrigin);
    console.error(`Better CaptionKeep MCP server listening for authenticated Streamable HTTP at ${endpoint}.`);
});

async function shutdown(signal: string): Promise<void> {
    console.error(`Better CaptionKeep MCP server received ${signal}; shutting down.`);
    server.close(error => {
        if (error) {
            console.error(error);
            process.exitCode = 1;
        }
    });
}

process.once('SIGINT', () => void shutdown('SIGINT'));
process.once('SIGTERM', () => void shutdown('SIGTERM'));
