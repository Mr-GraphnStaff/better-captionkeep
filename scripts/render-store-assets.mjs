import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const assetDir = path.join(projectRoot, 'store-assets', '6.0');
const source = path.join(assetDir, 'source.html');
const chrome = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const outputs = [
  ['01-one-button-meeting.png', '1280,800', '?slide=1'],
  ['02-rolling-live-notes.png', '1280,800', '?slide=2'],
  ['03-capture-moment.png', '1280,800', '?slide=3'],
  ['04-meeting-receipt.png', '1280,800', '?slide=4'],
  ['05-advanced-settings.png', '1280,800', '?slide=5'],
  ['small-promotional-tile.png', '440,280', '?promo=small'],
  ['marquee-promotional-tile.png', '1400,560', '?promo=large']
];

for (const [name, size, query] of outputs) {
  const destination = path.join(assetDir, name);
  execFileSync(chrome, [
    '--headless=new', '--disable-gpu', '--hide-scrollbars', `--window-size=${size}`,
    '--force-device-scale-factor=1', `--screenshot=${destination}`, `${pathToFileURL(source).href}${query}`
  ], {stdio: 'pipe', windowsHide: true, timeout: 60000});
}

const manifest = [];
for (const [name, size] of outputs) {
  const file = path.join(assetDir, name);
  manifest.push({
    file: name,
    dimensions: size.replace(',', 'x'),
    bytes: (await stat(file)).size,
    sha256: createHash('sha256').update(await readFile(file)).digest('hex').toUpperCase()
  });
}
await writeFile(path.join(assetDir, 'manifest.json'), `${JSON.stringify({version: '6.0.0', generatedAt: new Date().toISOString(), approval: 'pending release-owner review', artifacts: manifest}, null, 2)}\n`, 'utf8');
console.log(`Rendered ${outputs.length} reproducible 6.0 Store assets and wrote manifest.json.`);
