import { execFileSync } from 'node:child_process';
import { access, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import {runChromiumSurface} from './rendered-surface-checks.mjs';
import {installedBrowsers} from './browser-platform.mjs';
import {runLoadedExtension} from './loaded-extension-checks.mjs';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const prodDir = path.join(projectRoot, 'dist', 'prod');
const evidenceDir = path.join(prodDir, 'certification-evidence');
const recordPath = path.join(prodDir, 'browser-certification.json');

const definitions = await installedBrowsers();

async function exists(file) {
  try { await access(file); return true; } catch { return false; }
}

function version(binary) {
  if (process.platform !== 'win32') return execFileSync(binary, ['--version'], {encoding:'utf8',timeout:10000}).trim();
  const quoted = binary.replaceAll("'", "''");
  return execFileSync('powershell.exe', [
    '-NoProfile', '-Command',
    `$v=(Get-Item -LiteralPath '${quoted}').VersionInfo; if ($v.ProductVersion) { $v.ProductVersion } else { $v.FileVersion }`
  ], {encoding: 'utf8', windowsHide: true}).trim();
}

await mkdir(evidenceDir, {recursive: true});
const record = JSON.parse(await readFile(recordPath, 'utf8'));
let failed = false;
let renderedBrowsers = 0;
function diagnostic(error) {
  return String(error.message || error).replaceAll(projectRoot,'[project]').replaceAll(os.homedir(),'[home]')
    .replace(/[\u0000-\u001f\u007f]/g,' ').replace(/https?:\/\/[^\s]+/g,'[url]').slice(0,500);
}

for (const definition of definitions) {
  const entry = record.browsers.find(item => item.browser === definition.browser);
  if (!entry) continue;
  if (!definition.binary) {
    entry.surfaceSmoke = {status: 'not-run', reason: `Browser is not installed on this ${os.type()} host.`};
    continue;
  }
  const screenshot = path.join(evidenceDir, `${definition.browser}-settings-surface.png`);
  const url = `${pathToFileURL(path.join(prodDir, `${definition.browser}-unpacked`, 'popup.html')).href}?view=settings&surface-smoke=1`;
  const args = definition.chromium
    ? ['--headless=new', '--disable-gpu', '--hide-scrollbars', '--window-size=1280,900', `--screenshot=${screenshot}`, url]
    : ['--headless', '--window-size', '1280,900', '--screenshot', screenshot, url];
  let stage = 'rendered-surface';
  try {
    await rm(screenshot,{force:true});
    const rendered = definition.chromium
      ? await runChromiumSurface(definition.binary,path.join(prodDir, `${definition.browser}-unpacked`),screenshot)
      : (execFileSync(definition.binary, args, {stdio: 'pipe', windowsHide: true, timeout: 60000}), null);
    stage = 'browser-version';
    entry.browserVersion = version(definition.binary);
    entry.operatingSystem = `${os.type()} ${os.release()}`;
    entry.surfaceSmoke = {
      status: !await exists(screenshot) ? 'failed' : rendered ? 'passed' : 'captured',
      scope: rendered ? 'Packaged Settings navigation, popup reachability, system/native theming, viewer tools, and handoff empty-state assertions with fixture extension APIs; live provider behavior was not exercised.'
        : 'Screenshot captured only; no visibility, interaction, or extension behavior assertions ran.',
      checks: rendered?.checks || [],
      testedAt: new Date().toISOString(),
      evidence: `certification-evidence/${path.basename(screenshot)}`
    };
    if (entry.surfaceSmoke.status === 'failed') failed = true;
    if (entry.surfaceSmoke.status === 'passed') renderedBrowsers += 1;
    if (definition.chromium && rendered) {
      stage = 'loaded-extension';
      const nativeResult = await runLoadedExtension(definition.binary, path.join(prodDir, `${definition.browser}-unpacked`), {
        browserName:definition.browser, screenshot:path.join(evidenceDir, `${definition.browser}-loaded-extension.png`)
      });
      const evidence = `${definition.browser}-loaded-extension.json`;
      await writeFile(path.join(evidenceDir,evidence),JSON.stringify(nativeResult,null,2)+'\n');
      entry.loadedExtensionSmoke = {status:'passed',...nativeResult,evidence:`certification-evidence/${evidence}`};
    } else entry.loadedExtensionSmoke = {status:'not-run',reason:'Native-extension runtime checks are available only for Chromium targets in this tool.'};
    console.log(`[browser-smoke] ${definition.browser}: surface=${entry.surfaceSmoke.status}; native=${entry.loadedExtensionSmoke.status}; live providers remain pending.`);
  } catch (error) {
    failed = true;
    const reason = diagnostic(error);
    if (stage !== 'loaded-extension') entry.surfaceSmoke = {status:'failed',stage,reason};
    entry.loadedExtensionSmoke = stage === 'loaded-extension'
      ? {status:'failed',stage,reason} : {status:'not-run',reason:'Surface setup failed before native-extension verification.'};
    console.error(`[browser-smoke] ${definition.browser} ${stage} failed: ${reason}`);
  }
}

if (!renderedBrowsers) {failed = true; console.error('No installed Chromium browser completed rendered assertions.');}
await writeFile(recordPath, `${JSON.stringify(record, null, 2)}\n`, 'utf8');
console.log(`Updated ${path.relative(projectRoot, recordPath)} with separate installed-browser surface-smoke evidence.`);
if (failed) process.exitCode = 1;
