import { access, readFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const API_ROOT = 'https://chromewebstore.googleapis.com';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const POLL_INTERVAL_MS = 5_000;
const MAX_POLLS = 60;

export function packageNameForVersion(version) {
  if (!/^\d+\.\d+\.\d+(?:\.\d+)?$/.test(version)) {
    throw new Error(`Invalid extension version: ${version}`);
  }
  return `better_captionkeep-chrome-${version}.zip`;
}

export function normalizeUploadState(state) {
  return String(state || '').replace(/^UPLOAD_/, '');
}

export function itemResourceName(publisherId, extensionId) {
  if (!publisherId?.trim()) throw new Error('CHROME_PUBLISHER_ID is required');
  if (!/^[a-p]{32}$/.test(extensionId || '')) {
    throw new Error('CHROME_EXTENSION_ID must be a 32-character Chrome extension ID');
  }
  return `publishers/${encodeURIComponent(publisherId.trim())}/items/${extensionId}`;
}

function requiredEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function sleep(milliseconds) {
  return new Promise(resolve => setTimeout(resolve, milliseconds));
}

async function responseDetails(response) {
  const text = await response.text();
  if (!text) return '';
  try {
    return JSON.stringify(JSON.parse(text));
  } catch {
    return text;
  }
}

async function expectJson(response, operation) {
  if (!response.ok) {
    throw new Error(`${operation} failed with HTTP ${response.status}: ${await responseDetails(response)}`);
  }
  return response.json();
}

async function accessToken(clientId, clientSecret, refreshToken) {
  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: refreshToken,
    grant_type: 'refresh_token',
  });
  const response = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
    signal: AbortSignal.timeout(120_000),
  });
  const result = await expectJson(response, 'Chrome OAuth token refresh');
  if (!result.access_token) throw new Error('Chrome OAuth response did not include an access token');
  return result.access_token;
}

async function fetchStatus(resourceName, token) {
  const response = await fetch(`${API_ROOT}/v2/${resourceName}:fetchStatus`, {
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(120_000),
  });
  return expectJson(response, 'Chrome item status');
}

async function waitForUpload(resourceName, token, initialResult) {
  let state = normalizeUploadState(initialResult.uploadState);
  if (state === 'SUCCEEDED') return initialResult;
  if (state === 'FAILED') throw new Error(`Chrome package upload failed: ${JSON.stringify(initialResult)}`);
  if (state !== 'IN_PROGRESS') {
    throw new Error(`Chrome package upload returned unexpected state: ${JSON.stringify(initialResult)}`);
  }

  for (let attempt = 1; attempt <= MAX_POLLS; attempt += 1) {
    if (attempt > 1) await sleep(POLL_INTERVAL_MS);
    const status = await fetchStatus(resourceName, token);
    state = normalizeUploadState(status.lastAsyncUploadState);
    console.log(`Chrome package upload status: ${state}`);
    if (state === 'SUCCEEDED') return status;
    if (state === 'FAILED' || state === 'NOT_FOUND') {
      throw new Error(`Chrome package upload failed: ${JSON.stringify(status)}`);
    }
    if (state !== 'IN_PROGRESS') {
      throw new Error(`Chrome package upload returned unexpected status: ${JSON.stringify(status)}`);
    }
  }
  throw new Error(`Chrome package upload did not finish after ${MAX_POLLS} checks`);
}

export async function main() {
  const clientId = requiredEnv('CHROME_CLIENT_ID');
  const clientSecret = requiredEnv('CHROME_CLIENT_SECRET');
  const refreshToken = requiredEnv('CHROME_REFRESH_TOKEN');
  const resourceName = itemResourceName(
    requiredEnv('CHROME_PUBLISHER_ID'),
    requiredEnv('CHROME_EXTENSION_ID'),
  );
  const action = process.env.CHROME_ACTION || 'upload-only';
  if (!['upload-only', 'submit-staged'].includes(action)) {
    throw new Error('CHROME_ACTION must be upload-only or submit-staged');
  }

  const packageJson = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
  const packagePath = process.env.CHROME_PACKAGE_PATH
    ? path.resolve(process.env.CHROME_PACKAGE_PATH)
    : path.resolve('dist', 'chrome-store', packageNameForVersion(packageJson.version));
  await access(packagePath);

  const token = await accessToken(clientId, clientSecret, refreshToken);
  const packageBytes = await readFile(packagePath);
  console.log(`Uploading ${path.basename(packagePath)} to the Chrome Web Store`);
  const uploadResponse = await fetch(`${API_ROOT}/upload/v2/${resourceName}:upload`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/zip',
    },
    body: packageBytes,
    signal: AbortSignal.timeout(120_000),
  });
  const uploadResult = await expectJson(uploadResponse, 'Chrome package upload');
  await waitForUpload(resourceName, token, uploadResult);
  if (uploadResult.crxVersion && uploadResult.crxVersion !== packageJson.version) {
    throw new Error(`Chrome accepted version ${uploadResult.crxVersion}, expected ${packageJson.version}`);
  }

  if (action === 'upload-only') {
    console.log('Chrome package upload succeeded. The draft was not submitted for review.');
    return;
  }

  console.log('Submitting the Chrome draft for review with staged publishing');
  const publishResponse = await fetch(`${API_ROOT}/v2/${resourceName}:publish`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      publishType: 'STAGED_PUBLISH',
      skipReview: false,
      blockOnWarnings: true,
    }),
    signal: AbortSignal.timeout(120_000),
  });
  const publishResult = await expectJson(publishResponse, 'Chrome review submission');
  console.log(`Chrome accepted the extension update for review. State: ${publishResult.state || 'submitted'}`);
}

const invokedDirectly = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (invokedDirectly) {
  main().catch(error => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
