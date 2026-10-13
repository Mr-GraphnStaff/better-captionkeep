import { execFileSync } from 'node:child_process';
import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const prodDir = path.join(projectRoot, 'dist', 'prod');
const evidenceDir = path.join(prodDir, 'certification-evidence');
const recordPath = path.join(prodDir, 'browser-certification.json');

const definitions = [
  {browser: 'chrome', binary: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', chromium: true},
  {browser: 'edge', binary: 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe', chromium: true},
  {browser: 'brave', binary: path.join(process.env.LOCALAPPDATA || '', 'BraveSoftware', 'Brave-Browser', 'Application', 'brave.exe'), chromium: true},
  {browser: 'opera', binary: path.join(process.env.LOCALAPPDATA || '', 'Programs', 'Opera', 'opera.exe'), chromium: true},
  {browser: 'firefox', binary: 'C:\\Program Files\\Mozilla Firefox\\firefox.exe', chromium: false}
];

async function exists(file) {
  try { await access(file); return true; } catch { return false; }
}

function version(binary) {
  const quoted = binary.replaceAll("'", "''");
  return execFileSync('powershell.exe', [
    '-NoProfile', '-Command',
    `$v=(Get-Item -LiteralPath '${quoted}').VersionInfo; if ($v.ProductVersion) { $v.ProductVersion } else { $v.FileVersion }`
  ], {encoding: 'utf8', windowsHide: true}).trim();
}

await mkdir(evidenceDir, {recursive: true});
const record = JSON.parse(await readFile(recordPath, 'utf8'));

for (const definition of definitions) {
  const entry = record.browsers.find(item => item.browser === definition.browser);
  if (!entry) continue;
  if (!await exists(definition.binary)) {
    entry.surfaceSmoke = {status: 'not-run', reason: 'Browser is not installed on this Windows host.'};
    continue;
  }
  const screenshot = path.join(evidenceDir, `${definition.browser}-settings-surface.png`);
  const url = `${pathToFileURL(path.join(prodDir, `${definition.browser}-unpacked`, 'popup.html')).href}?view=settings&surface-smoke=1`;
  const args = definition.chromium
    ? ['--headless=new', '--disable-gpu', '--hide-scrollbars', '--window-size=1280,900', `--screenshot=${screenshot}`, url]
    : ['--headless', '--window-size', '1280,900', '--screenshot', screenshot, url];
  try {
    execFileSync(definition.binary, args, {stdio: 'pipe', windowsHide: true, timeout: 60000});
    entry.browserVersion = version(definition.binary);
    entry.operatingSystem = `${os.type()} ${os.release()}`;
    entry.surfaceSmoke = {
      status: await exists(screenshot) ? 'passed' : 'failed',
      scope: 'Rendered the packaged 6.0 Settings surface in an isolated headless browser process; extension APIs and meeting providers were not exercised.',
      testedAt: new Date().toISOString(),
      evidence: `certification-evidence/${path.basename(screenshot)}`
    };
  } catch (error) {
    entry.surfaceSmoke = {status: 'failed', reason: String(error.message || error).slice(0, 500)};
  }
}

const safari = record.browsers.find(item => item.browser === 'safari');
if (safari) safari.surfaceSmoke = {status: 'not-run', reason: 'Safari/macOS is unavailable on this Windows host.'};
await writeFile(recordPath, `${JSON.stringify(record, null, 2)}\n`, 'utf8');
console.log(`Updated ${path.relative(projectRoot, recordPath)} with separate installed-browser surface-smoke evidence.`);
