import { access, appendFile, readFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const API_ROOT = 'https://api.addons.microsoftedge.microsoft.com';
const POLL_INTERVAL_MS = 5_000;
const MAX_POLLS = 60;

export function operationIdFromLocation(location) {
  if (!location) throw new Error('Microsoft response did not include a Location operation ID');
  const trimmed = location.trim().replace(/\/$/, '');
  const operationId = trimmed.slice(trimmed.lastIndexOf('/') + 1);
  if (!operationId) throw new Error(`Unable to parse operation ID from Location: ${location}`);
  return operationId;
}

export function packageNameForVersion(version) {
  if (!/^\d+\.\d+\.\d+(?:\.\d+)?$/.test(version)) {
    throw new Error(`Invalid extension version: ${version}`);
  }
  return `better_captionkeep-${version}.zip`;
}

function requiredEnv(name, env = process.env) {
  const value = env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function sleep(milliseconds) {
  return new Promise(resolve => setTimeout(resolve, milliseconds));
}

async function writeStepSummary(env, lines) {
  if (!env.GITHUB_STEP_SUMMARY) return;
  await appendFile(env.GITHUB_STEP_SUMMARY, `${lines.join('\n')}\n`, 'utf8');
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

async function expectAccepted(response, operation) {
  if (response.status !== 202) {
    throw new Error(`${operation} failed with HTTP ${response.status}: ${await responseDetails(response)}`);
  }
  return operationIdFromLocation(response.headers.get('location'));
}

async function pollOperation(url, headers, label, fetchImpl = fetch, sleepImpl = sleep) {
  for (let attempt = 1; attempt <= MAX_POLLS; attempt += 1) {
    const response = await fetchImpl(url, {
      headers,
      signal: AbortSignal.timeout(120_000),
    });
    if (!response.ok) {
      throw new Error(`${label} status failed with HTTP ${response.status}: ${await responseDetails(response)}`);
    }

    const result = await response.json();
    console.log(`${label} status: ${result.status}`);
    if (result.status === 'Succeeded') return result;
    if (result.status === 'Failed') {
      throw new Error(`${label} failed (${result.errorCode || 'unknown'}): ${result.message || JSON.stringify(result.errors)}`);
    }
    if (result.status !== 'InProgress') {
      throw new Error(`${label} returned unexpected status: ${JSON.stringify(result)}`);
    }
    if (attempt < MAX_POLLS) await sleepImpl(POLL_INTERVAL_MS);
  }
  throw new Error(`${label} did not finish after ${MAX_POLLS} checks`);
}

export async function main(options = {}) {
  const env = options.env || process.env;
  const fetchImpl = options.fetchImpl || fetch;
  const sleepImpl = options.sleepImpl || sleep;
  const action = env.EDGE_ACTION || 'preflight';
  if (!['preflight', 'upload-only', 'submit', 'submit-existing'].includes(action)) {
    throw new Error('EDGE_ACTION must be preflight, upload-only, submit, or submit-existing');
  }
  const notes = env.EDGE_CERTIFICATION_NOTES?.trim();
  if (['submit', 'submit-existing'].includes(action) && !notes) {
    throw new Error('EDGE_CERTIFICATION_NOTES is required when EDGE_ACTION submits for certification');
  }
  const clientId = requiredEnv('EDGE_CLIENT_ID', env);
  const apiKey = requiredEnv('EDGE_API_KEY', env);
  const productId = requiredEnv('EDGE_PRODUCT_ID', env);

  if (action === 'preflight') {
    console.log(
      `Edge configuration preflight passed for product ${productId}. ` +
      'Microsoft does not expose a non-mutating product-status endpoint, so credentials are proven only by an upload operation.',
    );
    await writeStepSummary(env, [
      '## Microsoft Edge Add-ons preflight',
      '',
      `- Product ID configured: \`${productId}\``,
      '- Client ID and API key: configured',
      '- Limitation: Microsoft exposes no non-mutating product-status endpoint; the first upload proves the credentials.',
    ]);
    return { clientIdConfigured: Boolean(clientId), apiKeyConfigured: Boolean(apiKey), productId };
  }

  const headers = {
    Authorization: `ApiKey ${apiKey}`,
    'X-ClientID': clientId,
  };
  const productPath = `/v1/products/${encodeURIComponent(productId)}`;

  if (action === 'submit-existing') {
    console.log('Submitting the verified Edge draft for Microsoft certification');
    const publishResponse = await fetchImpl(`${API_ROOT}${productPath}/submissions`, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ notes }),
      signal: AbortSignal.timeout(120_000),
    });
    const publishOperationId = await expectAccepted(publishResponse, 'Certification submission');
    await pollOperation(
      `${API_ROOT}${productPath}/submissions/operations/${encodeURIComponent(publishOperationId)}`,
      headers,
      'Certification submission', fetchImpl, sleepImpl,
    );
    console.log('Microsoft accepted the extension update for certification.');
    await writeStepSummary(env, [
      '## Microsoft Edge Add-ons result',
      '',
      '- Microsoft accepted the verified draft for certification.',
    ]);
    return;
  }

  const packageJson = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
  const expectedVersion = env.STORE_RELEASE_VERSION?.trim() || packageJson.version;
  const packagePath = env.EDGE_PACKAGE_PATH
    ? path.resolve(env.EDGE_PACKAGE_PATH)
    : path.resolve('dist', packageNameForVersion(expectedVersion));
  await access(packagePath);
  const packageBytes = await readFile(packagePath);

  console.log(`Uploading ${path.basename(packagePath)} to Microsoft Edge Add-ons`);
  const uploadResponse = await fetchImpl(`${API_ROOT}${productPath}/submissions/draft/package`, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/zip' },
    body: packageBytes,
    signal: AbortSignal.timeout(120_000),
  });
  const uploadOperationId = await expectAccepted(uploadResponse, 'Package upload');
  await pollOperation(
    `${API_ROOT}${productPath}/submissions/draft/package/operations/${encodeURIComponent(uploadOperationId)}`,
    headers,
    'Package upload', fetchImpl, sleepImpl,
  );

  if (action === 'upload-only') {
    console.log('Package upload succeeded. The draft was not submitted for certification.');
    await writeStepSummary(env, [
      '## Microsoft Edge Add-ons result',
      '',
      '- Verified package uploaded as a draft; certification was not requested.',
    ]);
    return;
  }

  console.log('Submitting the verified draft for Microsoft certification');
  const publishResponse = await fetchImpl(`${API_ROOT}${productPath}/submissions`, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({ notes }),
    signal: AbortSignal.timeout(120_000),
  });
  const publishOperationId = await expectAccepted(publishResponse, 'Certification submission');
  await pollOperation(
    `${API_ROOT}${productPath}/submissions/operations/${encodeURIComponent(publishOperationId)}`,
    headers,
    'Certification submission', fetchImpl, sleepImpl,
  );
  console.log('Microsoft accepted the extension update for certification.');
  await writeStepSummary(env, [
    '## Microsoft Edge Add-ons result',
    '',
    '- Microsoft accepted the verified package for certification.',
  ]);
}

const invokedDirectly = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (invokedDirectly) {
  main().catch(error => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
