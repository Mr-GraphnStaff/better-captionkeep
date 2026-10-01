import { readFile } from 'node:fs/promises';
import { webcrypto } from 'node:crypto';
import { spawn } from 'node:child_process';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDir, '..');
const KEY_ID = 'bck-uat-2026-10-01';
const FEATURE = 'verified-teams-transcript';

function parseArgs(args) {
  const values = new Map();
  for (let index = 0; index < args.length; index += 1) {
    const name = args[index];
    if (name === '--clipboard') values.set(name, true);
    else if (name.startsWith('--')) values.set(name, args[++index]);
  }
  return values;
}

function base64Url(value) {
  return Buffer.from(value).toString('base64url');
}

export async function issuePass({privateJwk, subject, environment = 'uat', hours = 8, now = new Date(), id = webcrypto.randomUUID()}) {
  if (!String(subject || '').trim() || String(subject).length > 120) throw new Error('A named --subject is required.');
  if (!['dev', 'uat'].includes(environment)) throw new Error('--environment must be dev or uat.');
  const duration = Number(hours);
  if (!Number.isFinite(duration) || duration <= 0 || duration > 24) throw new Error('--hours must be greater than 0 and no more than 24.');
  const issuedAt = Math.floor(now.getTime() / 1000);
  const header = {alg: 'ES256', typ: 'BCK-UAT', kid: KEY_ID};
  const payload = {
    iss: 'better-captionkeep-dev', aud: 'better-captionkeep-dev-uat',
    sub: String(subject).trim(), env: environment, features: [FEATURE],
    iat: issuedAt, nbf: issuedAt - 30, exp: issuedAt + Math.floor(duration * 3600), jti: id
  };
  const encodedHeader = base64Url(JSON.stringify(header));
  const encodedPayload = base64Url(JSON.stringify(payload));
  const signingInput = `${encodedHeader}.${encodedPayload}`;
  const key = await webcrypto.subtle.importKey('jwk', privateJwk, {name: 'ECDSA', namedCurve: 'P-256'}, false, ['sign']);
  const signature = await webcrypto.subtle.sign({name: 'ECDSA', hash: 'SHA-256'}, key, Buffer.from(signingInput));
  return `${signingInput}.${base64Url(signature)}`;
}

async function copyToClipboard(value) {
  await new Promise((resolve, reject) => {
    const child = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', 'Set-Clipboard -Value ([Console]::In.ReadToEnd())'], {
      stdio: ['pipe', 'ignore', 'inherit']
    });
    child.once('error', reject);
    child.once('exit', code => code === 0 ? resolve() : reject(new Error(`Clipboard command exited with ${code}.`)));
    child.stdin.end(value);
  });
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const keyPath = path.resolve(args.get('--key') || process.env.BCK_DEV_UAT_PRIVATE_JWK || '');
  const relative = path.relative(projectRoot, keyPath);
  if (!keyPath || (!relative.startsWith('..') && !path.isAbsolute(relative))) {
    throw new Error('The private signing key must be an explicit path outside the repository.');
  }
  const privateJwk = JSON.parse(await readFile(keyPath, 'utf8'));
  const token = await issuePass({
    privateJwk,
    subject: args.get('--subject'),
    environment: args.get('--environment') || 'uat',
    hours: args.get('--hours') || 8
  });
  if (args.get('--clipboard')) {
    await copyToClipboard(token);
    console.log('A short-lived dev/UAT pass was copied to the clipboard.');
  } else {
    process.stdout.write(`${token}\n`);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
