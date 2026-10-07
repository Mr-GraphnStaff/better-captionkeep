#!/usr/bin/env node
import { serveStdio } from '@modelcontextprotocol/server/stdio';
import { FileEvidenceRepository } from './repository.js';
import { createServer } from './server.js';

const evidenceDirectory = process.env.CAPTIONKEEP_EVIDENCE_DIR?.trim();
if (!evidenceDirectory) {
    console.error('CAPTIONKEEP_EVIDENCE_DIR must name the approved Better CaptionKeep evidence directory.');
    process.exit(1);
}

const repository = new FileEvidenceRepository(evidenceDirectory);
void serveStdio(() => createServer(repository));
console.error('Better CaptionKeep MCP server running over stdio with read-only tools.');
