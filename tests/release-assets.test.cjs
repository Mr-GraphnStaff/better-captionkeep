const assert = require('node:assert/strict');
const {createHash} = require('node:crypto');
const {mkdtemp, writeFile} = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const hash = value => createHash('sha256').update(value).digest('hex').toUpperCase();

test('release asset verifier binds tag, checksums, provenance, and ZIPs', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'captionkeep-release-'));
  const files = new Map([
    ['better_captionkeep-5.1.0.zip', Buffer.from('edge-store')],
    ['better_captionkeep-chrome-5.1.0.zip', Buffer.from('chrome-store')],
  ]);
  for (const [name, bytes] of files) await writeFile(path.join(root, name), bytes);
  await writeFile(path.join(root, 'SHA256SUMS.txt'), [...files].map(([name, bytes]) => `${hash(bytes)}  ${name}`).join('\n') + '\n');
  await writeFile(path.join(root, 'release-provenance.json'), JSON.stringify({
    version: '5.1.0', commit: 'abc123', artifacts: [...files].map(([name, bytes], index) => ({
      target: index ? 'chrome-store' : 'edge-store', path: index ? `chrome-store/${name}` : name, sha256: hash(bytes),
    })).concat({target:'chrome',path:'better_captionkeep_-_chrome_test-5.1.0.zip',sha256:'not-published'}),
  }));
  const {verifyReleaseAssets} = await import('../scripts/verify-release-assets.mjs');
  const result = await verifyReleaseAssets(root, 'v5.1.0');
  assert.equal(result.version, '5.1.0');
  await assert.rejects(verifyReleaseAssets(root, 'v5.1.1'), /does not match/);
  await writeFile(path.join(root, 'better_captionkeep-5.1.0.zip'), 'tampered');
  await assert.rejects(verifyReleaseAssets(root, 'v5.1.0'), /Checksum mismatch/);
});
