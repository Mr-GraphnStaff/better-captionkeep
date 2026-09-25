import { access, appendFile, readFile } from 'node:fs/promises';
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

function requiredEnv(name, env = process.env) {
  const value = env[name]?.trim();
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

async function accessToken(clientId, clientSecret, refreshToken, fetchImpl = fetch) {
  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: refreshToken,
    grant_type: 'refresh_token',
  });
  const response = await fetchImpl(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
    signal: AbortSignal.timeout(120_000),
  });
  const result = await expectJson(response, 'Chrome OAuth token refresh');
  if (!result.access_token) throw new Error('Chrome OAuth response did not include an access token');
  return result.access_token;
}

async function fetchStatus(resourceName, token, fetchImpl = fetch) {
  const response = await fetchImpl(`${API_ROOT}/v2/${resourceName}:fetchStatus`, {
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(120_000),
  });
  return expectJson(response, 'Chrome item status');
}

async function waitForUpload(resourceName, token, initialResult, fetchImpl = fetch, sleepImpl = sleep) {
  let state = normalizeUploadState(initialResult.uploadState);
  if (state === 'SUCCEEDED') return initialResult;
  if (state === 'FAILED') throw new Error(`Chrome package upload failed: ${JSON.stringify(initialResult)}`);
  if (state !== 'IN_PROGRESS') {
    throw new Error(`Chrome package upload returned unexpected state: ${JSON.stringify(initialResult)}`);
  }

  for (let attempt = 1; attempt <= MAX_POLLS; attempt += 1) {
    if (attempt > 1) await sleepImpl(POLL_INTERVAL_MS);
    const status = await fetchStatus(resourceName, token, fetchImpl);
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

function revisionVersion(revision) {
  return revision?.distributionChannels?.map(channel => channel.crxVersion).filter(Boolean).join(',') || 'none';
}

export function summarizeChromeStatus(status) {
  return {
    itemId: status.itemId || 'unknown',
    publishedState: status.publishedItemRevisionStatus?.state || 'none',
    publishedVersion: revisionVersion(status.publishedItemRevisionStatus),
    submittedState: status.submittedItemRevisionStatus?.state || 'none',
    submittedVersion: revisionVersion(status.submittedItemRevisionStatus),
    uploadState: status.lastAsyncUploadState || 'none',
    takenDown: Boolean(status.takenDown),
    warned: Boolean(status.warned),
  };
}

export function publishTypeForAction(action) {
  if (action === 'submit-auto' || action === 'submit-existing-auto') return 'DEFAULT_PUBLISH';
  if (['submit-staged', 'submit-existing-staged', 'publish-staged'].includes(action)) return 'STAGED_PUBLISH';
  return null;
}

function logStatus(label, status) {
  const summary = summarizeChromeStatus(status);
  console.log(
    `${label}: published=${summary.publishedState}/${summary.publishedVersion}; ` +
    `submitted=${summary.submittedState}/${summary.submittedVersion}; upload=${summary.uploadState}; ` +
    `warned=${summary.warned}; takenDown=${summary.takenDown}`,
  );
}

async function writeStepSummary(env, lines) {
  if (!env.GITHUB_STEP_SUMMARY) return;
  await appendFile(env.GITHUB_STEP_SUMMARY, `${lines.join('\n')}\n`, 'utf8');
}

function assertHealthy(status) {
  if (status.takenDown) throw new Error('Chrome item is taken down; resolve the Dashboard policy status first');
  if (status.warned) throw new Error('Chrome item has a policy warning; resolve it before Store mutation');
}

function assertNoActiveSubmission(status) {
  if (status.submittedItemRevisionStatus) {
    const summary = summarizeChromeStatus(status);
    throw new Error(
      `Chrome already has an active submission (${summary.submittedState}/${summary.submittedVersion}); ` +
      'do not replace a review in progress',
    );
  }
}

export async function main(options = {}) {
  const env = options.env || process.env;
  const fetchImpl = options.fetchImpl || fetch;
  const sleepImpl = options.sleepImpl || sleep;
  const clientId = requiredEnv('CHROME_CLIENT_ID', env);
  const clientSecret = requiredEnv('CHROME_CLIENT_SECRET', env);
  const refreshToken = requiredEnv('CHROME_REFRESH_TOKEN', env);
  const resourceName = itemResourceName(
    requiredEnv('CHROME_PUBLISHER_ID', env),
    requiredEnv('CHROME_EXTENSION_ID', env),
  );
  const action = env.CHROME_ACTION || 'preflight';
  const allowedActions = [
    'preflight',
    'upload-only',
    'submit-staged',
    'submit-auto',
    'submit-existing-staged',
    'submit-existing-auto',
    'publish-staged',
  ];
  if (!allowedActions.includes(action)) {
    throw new Error(`CHROME_ACTION must be one of: ${allowedActions.join(', ')}`);
  }

  const token = await accessToken(clientId, clientSecret, refreshToken, fetchImpl);
  const initialStatus = await fetchStatus(resourceName, token, fetchImpl);
  assertHealthy(initialStatus);
  logStatus('Chrome read-only preflight', initialStatus);
  const initialSummary = summarizeChromeStatus(initialStatus);
  await writeStepSummary(env, [
    '## Chrome Web Store status',
    '',
    `- Published: \`${initialSummary.publishedState}\` / \`${initialSummary.publishedVersion}\``,
    `- Submitted: \`${initialSummary.submittedState}\` / \`${initialSummary.submittedVersion}\``,
    `- Last upload: \`${initialSummary.uploadState}\``,
    `- Policy warning: \`${initialSummary.warned}\``,
    `- Taken down: \`${initialSummary.takenDown}\``,
  ]);
  if (action === 'preflight') {
    console.log('Chrome credentials, publisher ID, extension ID, and read-only status access are valid.');
    return initialStatus;
  }

  if (action === 'publish-staged') {
    if (!initialStatus.submittedItemRevisionStatus) {
      throw new Error('Chrome has no submitted revision to publish from staged state');
    }
    console.log('Publishing the approved Chrome staged submission');
    const publishResponse = await fetchImpl(`${API_ROOT}/v2/${resourceName}:publish`, {
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
    const publishResult = await expectJson(publishResponse, 'Chrome staged publication');
    console.log(`Chrome accepted staged publication. State: ${publishResult.state || 'submitted'}`);
    await writeStepSummary(env, ['', `- Staged publication result: \`${publishResult.state || 'submitted'}\``]);
    return publishResult;
  }

  assertNoActiveSubmission(initialStatus);
  if (action.startsWith('submit-existing-')) {
    if (normalizeUploadState(initialStatus.lastAsyncUploadState) !== 'SUCCEEDED') {
      throw new Error('Chrome has no successfully uploaded draft to submit');
    }
    const publishType = publishTypeForAction(action);
    console.log(
      publishType === 'DEFAULT_PUBLISH'
        ? 'Submitting the verified Chrome draft for review with immediate publication after approval'
        : 'Submitting the verified Chrome draft for review with staged publishing',
    );
    const publishResponse = await fetchImpl(`${API_ROOT}/v2/${resourceName}:publish`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        publishType,
        skipReview: false,
        blockOnWarnings: true,
      }),
      signal: AbortSignal.timeout(120_000),
    });
    const publishResult = await expectJson(publishResponse, 'Chrome review submission');
    console.log(`Chrome accepted the extension update for review. State: ${publishResult.state || 'submitted'}`);
    await writeStepSummary(env, [
      '',
      `- Review submission: \`${publishResult.state || 'submitted'}\``,
      `- Publication mode: \`${publishType}\``,
    ]);
    return publishResult;
  }

  const packageJson = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
  const expectedVersion = env.STORE_RELEASE_VERSION?.trim() || packageJson.version;
  const packagePath = env.CHROME_PACKAGE_PATH
    ? path.resolve(env.CHROME_PACKAGE_PATH)
    : path.resolve('dist', 'chrome-store', packageNameForVersion(expectedVersion));
  await access(packagePath);
  const packageBytes = await readFile(packagePath);
  console.log(`Uploading ${path.basename(packagePath)} to the Chrome Web Store`);
  const uploadResponse = await fetchImpl(`${API_ROOT}/upload/v2/${resourceName}:upload`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/zip',
    },
    body: packageBytes,
    signal: AbortSignal.timeout(120_000),
  });
  const uploadResult = await expectJson(uploadResponse, 'Chrome package upload');
  await waitForUpload(resourceName, token, uploadResult, fetchImpl, sleepImpl);
  if (uploadResult.crxVersion && uploadResult.crxVersion !== expectedVersion) {
    throw new Error(`Chrome accepted version ${uploadResult.crxVersion}, expected ${expectedVersion}`);
  }

  if (action === 'upload-only') {
    console.log('Chrome package upload succeeded. The draft was not submitted for review.');
    await writeStepSummary(env, ['', '- Result: verified package uploaded as a draft']);
    return;
  }

  const publishType = publishTypeForAction(action);
  console.log(
    publishType === 'DEFAULT_PUBLISH'
      ? 'Submitting the Chrome draft for review with immediate publication after approval'
      : 'Submitting the Chrome draft for review with staged publishing',
  );
  const publishResponse = await fetchImpl(`${API_ROOT}/v2/${resourceName}:publish`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      publishType,
      skipReview: false,
      blockOnWarnings: true,
    }),
    signal: AbortSignal.timeout(120_000),
  });
  const publishResult = await expectJson(publishResponse, 'Chrome review submission');
  console.log(`Chrome accepted the extension update for review. State: ${publishResult.state || 'submitted'}`);
  await writeStepSummary(env, [
    '',
    `- Review submission: \`${publishResult.state || 'submitted'}\``,
    `- Publication mode: \`${publishType}\``,
  ]);
}

const invokedDirectly = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (invokedDirectly) {
  main().catch(error => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
