#!/usr/bin/env node
import {stdin, stdout} from 'node:process';
import {pathToFileURL} from 'node:url';
import {createHandler, loadAdapter} from './handler.js';
import {MAX_MESSAGE_BYTES} from './protocol.js';

export function encodeNativeMessage(value: unknown): Buffer {
  const payload = Buffer.from(JSON.stringify(value), 'utf8');
  if (payload.length > MAX_MESSAGE_BYTES) throw new Error('Native message exceeds the 1 MiB bridge limit.');
  const header = Buffer.allocUnsafe(4);
  header.writeUInt32LE(payload.length, 0);
  return Buffer.concat([header, payload]);
}

export function extractNativeMessages(buffer: Buffer<ArrayBufferLike>): {messages: unknown[]; remainder: Buffer<ArrayBufferLike>} {
  const messages: unknown[] = [];
  let offset = 0;
  while (buffer.length - offset >= 4) {
    const length = buffer.readUInt32LE(offset);
    if (length > MAX_MESSAGE_BYTES) throw new Error('Native message exceeds the 1 MiB bridge limit.');
    if (buffer.length - offset - 4 < length) break;
    const payload = buffer.subarray(offset + 4, offset + 4 + length).toString('utf8');
    messages.push(JSON.parse(payload));
    offset += 4 + length;
  }
  return {messages, remainder: buffer.subarray(offset)};
}

async function main(): Promise<void> {
  const adapter = await loadAdapter(process.env.CAPTIONKEEP_ASSISTANT_ADAPTER);
  const handle = createHandler(adapter, process.env.CAPTIONKEEP_ASSISTANT_ID || 'customer-assistant');
  let buffer: Buffer<ArrayBufferLike> = Buffer.alloc(0);
  let sequence = Promise.resolve();
  stdin.on('data', (chunk: Buffer) => {
    buffer = Buffer.concat([buffer, chunk]);
    let decoded;
    try {
      decoded = extractNativeMessages(buffer);
      buffer = decoded.remainder;
    } catch (error) {
      console.error(error instanceof Error ? error.message : error);
      process.exitCode = 1;
      stdin.pause();
      return;
    }
    for (const message of decoded.messages) {
      sequence = sequence.then(async () => {
        stdout.write(encodeNativeMessage(await handle(message)));
      });
    }
  });
}

const invokedPath = process.argv[1] ? pathToFileURL(process.argv[1]).href : '';
if (invokedPath === import.meta.url) {
  main().catch(error => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
