const test = require('node:test');
const assert = require('node:assert/strict');
const {webcrypto} = require('node:crypto');
const Entitlement = require('../teams-captions-saver/devUatEntitlement.js');

const TEST_MANIFEST = {name:'Better CaptionKeep - Chrome Test', version_name:'5.3.0 development - Chrome test'};
const STORE_MANIFEST = {name:'Better CaptionKeep', version:'5.3.0'};
const NOW = Date.parse('2026-10-01T12:00:00Z');

function b64(value) {
  const bytes = value instanceof ArrayBuffer || ArrayBuffer.isView(value)
    ? Buffer.from(value)
    : Buffer.from(typeof value === 'string' ? value : JSON.stringify(value));
  return bytes.toString('base64url');
}

async function signer() {
  const pair = await webcrypto.subtle.generateKey({name:'ECDSA', namedCurve:'P-256'}, true, ['sign','verify']);
  const publicJwk = await webcrypto.subtle.exportKey('jwk', pair.publicKey);
  const sign = async overrides => {
    const now = Math.floor(NOW / 1000);
    const header = {alg:'ES256', typ:Entitlement.TOKEN_TYPE, kid:Entitlement.KEY_ID};
    const payload = {
      iss:Entitlement.ISSUER, aud:Entitlement.AUDIENCE, sub:'David Farris', env:'uat',
      features:['verified-teams-transcript'], iat:now, nbf:now - 30, exp:now + 3600,
      jti:'test-pass-1234', ...overrides
    };
    const input = `${b64(header)}.${b64(payload)}`;
    const signature = await webcrypto.subtle.sign({name:'ECDSA', hash:'SHA-256'}, pair.privateKey, Buffer.from(input));
    return `${input}.${b64(signature)}`;
  };
  return {sign, publicJwk};
}

function harness(manifest = TEST_MANIFEST) {
  const session = {};
  return {
    session,
    dependencies:{manifest, cryptoApi:webcrypto, nowMs:NOW, chromeApi:{storage:{session:{
      async get(key){return {[key]:session[key]};},
      async set(values){Object.assign(session, values);},
      async remove(key){delete session[key];}
    }}}}
  };
}

test('dev/UAT build detection excludes the public Store manifest', () => {
  assert.equal(Entitlement.isEligibleBuild(TEST_MANIFEST), true);
  assert.equal(Entitlement.isEligibleBuild(STORE_MANIFEST), false);
});

test('valid signed pass activates only sanitized session claims', async () => {
  const {sign, publicJwk} = await signer();
  const token = await sign();
  const h = harness();
  h.dependencies.publicJwk = publicJwk;
  const status = await Entitlement.activate(token, h.dependencies);
  assert.equal(status.active, true);
  assert.equal(status.subject, 'David Farris');
  assert.equal(await Entitlement.requireFeature('verified-teams-transcript', h.dependencies).then(Boolean), true);
  assert.equal(JSON.stringify(h.session).includes(token), false);
  assert.equal(Object.hasOwn(h.session, Entitlement.STORAGE_KEY), true);
});

test('public Store build rejects pass activation', async () => {
  const {sign, publicJwk} = await signer();
  const h = harness(STORE_MANIFEST); h.dependencies.publicJwk = publicJwk;
  await assert.rejects(Entitlement.activate(await sign(), h.dependencies),
    error => error.code === 'BUILD_NOT_ELIGIBLE');
});

test('invalid signature and expired or overlong claims are rejected', async () => {
  const {sign, publicJwk} = await signer();
  const h = harness(); h.dependencies.publicJwk = publicJwk;
  const valid = await sign();
  const damaged = `${valid.slice(0, -1)}${valid.endsWith('A') ? 'B' : 'A'}`;
  await assert.rejects(Entitlement.verify(damaged, h.dependencies), error => error.code === 'PASS_BAD_SIGNATURE');
  const now = Math.floor(NOW / 1000);
  await assert.rejects(Entitlement.verify(await sign({iat:now - 7200, nbf:now - 7200, exp:now - 3600}), h.dependencies),
    error => error.code === 'PASS_EXPIRED');
  await assert.rejects(Entitlement.verify(await sign({exp:now + 86401}), h.dependencies),
    error => error.code === 'PASS_INVALID_LIFETIME');
});

test('wrong audience and unknown capabilities are rejected', async () => {
  const {sign, publicJwk} = await signer();
  const h = harness(); h.dependencies.publicJwk = publicJwk;
  await assert.rejects(Entitlement.verify(await sign({aud:'someone-else'}), h.dependencies),
    error => error.code === 'PASS_WRONG_AUDIENCE');
  await assert.rejects(Entitlement.verify(await sign({features:['everything']}), h.dependencies),
    error => error.code === 'PASS_INVALID_FEATURES');
});

test('clear removes the pass and expired session state self-cleans', async () => {
  const {sign, publicJwk} = await signer();
  const h = harness();
  h.dependencies.publicJwk = publicJwk;
  await Entitlement.activate(await sign(), h.dependencies);
  await Entitlement.clear(h.dependencies);
  assert.equal((await Entitlement.status(h.dependencies)).active, false);
  await Entitlement.activate(await sign(), h.dependencies);
  const later = {...h.dependencies, nowMs:NOW + 2 * 3600 * 1000};
  assert.equal((await Entitlement.status(later)).active, false);
  assert.equal(Object.hasOwn(h.session, Entitlement.STORAGE_KEY), false);
});

test('developer issuer creates a pass accepted by the packaged verifier', async () => {
  const {issuePass} = await import('../scripts/issue-dev-uat-pass.mjs');
  const pair = await webcrypto.subtle.generateKey({name:'ECDSA', namedCurve:'P-256'}, true, ['sign','verify']);
  const privateJwk = await webcrypto.subtle.exportKey('jwk', pair.privateKey);
  const publicJwk = await webcrypto.subtle.exportKey('jwk', pair.publicKey);
  const token = await issuePass({privateJwk, subject:'UAT Operator', environment:'dev', hours:2, now:new Date(NOW), id:'issuer-test-1234'});
  const h = harness(); h.dependencies.publicJwk = publicJwk;
  const verified = await Entitlement.verify(token, h.dependencies);
  assert.equal(verified.claims.subject, 'UAT Operator');
  assert.equal(verified.claims.environment, 'dev');
  assert.deepEqual(verified.claims.features, ['verified-teams-transcript']);
});
