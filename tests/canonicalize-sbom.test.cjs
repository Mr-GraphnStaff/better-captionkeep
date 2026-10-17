const assert = require('node:assert/strict');
const test = require('node:test');

test('SBOM canonicalization removes only volatile identity fields and is deterministic', async () => {
  const {canonicalizeSbomText} = await import('../scripts/canonicalize-sbom.mjs');
  const make = (serialNumber, timestamp, componentName = 'checkout-folder') => JSON.stringify({
    bomFormat:'CycloneDX', specVersion:'1.6', serialNumber,
    metadata:{timestamp, component:{name:componentName, version:'0.0.0'}},
    components:[{name:'example', version:'1.0.0'}],
  });
  const first = canonicalizeSbomText(make('urn:uuid:first', '2026-10-17T12:00:00Z'));
  const second = canonicalizeSbomText(make('urn:uuid:second', '2026-10-17T12:01:00Z', 'different-checkout-folder'));
  assert.equal(first, second);
  const parsed = JSON.parse(first);
  assert.equal(parsed.serialNumber, undefined);
  assert.equal(parsed.metadata.timestamp, undefined);
  assert.equal(parsed.metadata.component.name, 'better-captionkeep');
  assert.equal(parsed.metadata.component.version, '6.0.0');
});
