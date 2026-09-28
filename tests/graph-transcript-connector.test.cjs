const test = require('node:test');
const assert = require('node:assert/strict');
const { webcrypto } = require('node:crypto');

const Graph = require('../teams-captions-saver/graphTranscriptConnector.js');

const SETTINGS = {
  enableGraphTranscriptImport: true,
  graphTenantId: '11111111-1111-4111-8111-111111111111',
  graphClientId: '22222222-2222-4222-8222-222222222222'
};

function jwt(payload) {
  const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url');
  return `${encode({alg:'none'})}.${encode(payload)}.`;
}

function chromeHarness(initial = {}) {
  const session = {...initial};
  return {
    session,
    api: {
      storage: {session: {
        async get(key) { return {[key]:session[key]}; },
        async set(values) { Object.assign(session, values); },
        async remove(key) { delete session[key]; }
      }},
      identity: {
        getRedirectURL(path) { return `https://abcdefghijklmnopabcdefghijklmnop.chromiumapp.org/${path}`; }
      }
    }
  };
}

test('managed Graph configuration is opt-in and requires tenant and client GUIDs', () => {
  assert.throws(() => Graph.validateManagedConfig({}), error => error.code === 'GRAPH_NOT_ENABLED');
  assert.throws(() => Graph.validateManagedConfig({enableGraphTranscriptImport:true}), error => error.code === 'GRAPH_CONFIG_INVALID');
  assert.deepEqual(Graph.validateManagedConfig(SETTINGS), {
    tenantId: SETTINGS.graphTenantId,
    clientId: SETTINGS.graphClientId
  });
});

test('meeting input accepts only exact HTTPS Teams join links', () => {
  const valid = 'https://teams.microsoft.com/l/meetup-join/19%3ameeting_example/0?context=%7B%7D';
  const current = 'https://teams.microsoft.com/meet/276858178406116?p=syntheticToken';
  assert.equal(Graph.validateJoinUrl(valid), valid);
  assert.equal(Graph.validateJoinUrl(current), current);
  for (const rejected of [
    'http://teams.microsoft.com/l/meetup-join/example',
    'https://evil.example/l/meetup-join/example',
    'https://teams.microsoft.com/meet/',
    'https://teams.microsoft.com/v2/'
  ]) {
    assert.throws(() => Graph.validateJoinUrl(rejected), error => error.code === 'JOIN_URL_INVALID');
  }
});

test('WebVTT parsing preserves speaker attribution and stable cue order', () => {
  const raw = `WEBVTT\n\n00:00:01.500 --> 00:00:04.000\n<v Ada Lovelace>Hello &amp; welcome.</v>\n\n00:00:04.000 --> 00:00:07.200\n<v Grace Hopper>Ship it.</v>\n`;
  const parsed = Graph.parseTranscript(raw, {createdDateTime:'2026-09-28T12:00:00Z'}, true);
  assert.deepEqual(parsed.map(item => [item.Name,item.Text,item.Time,item.key]), [
    ['Ada Lovelace','Hello & welcome.','00:00:01.500','graph-1'],
    ['Grace Hopper','Ship it.','00:00:04.000','graph-2']
  ]);
  assert.equal(parsed[0].capturedAt, '2026-09-28T12:00:01.500Z');
});

test('unattributed transcript parsing never invents a speaker', () => {
  const raw = `00:00:01.500 --> 00:00:04.000\n\nHello there.\n`;
  const [entry] = Graph.parseTranscript(raw, {createdDateTime:'2026-09-28T12:00:00Z'}, false);
  assert.equal(entry.Name, 'Unknown speaker');
  assert.equal(entry.Text, 'Hello there.');
});

test('interactive connection uses PKCE, validates state and stores tokens only in session storage', async () => {
  const harness = chromeHarness();
  let authorizationUrl;
  let tokenBody;
  harness.api.identity.launchWebAuthFlow = async ({url, interactive}) => {
    assert.equal(interactive, true);
    authorizationUrl = new URL(url);
    const nonce = authorizationUrl.searchParams.get('nonce');
    harness.nonce = nonce;
    return `${harness.api.identity.getRedirectURL('microsoft')}?code=one-time-code&state=${authorizationUrl.searchParams.get('state')}`;
  };
  const fetchImpl = async (_url, options) => {
    tokenBody = new URLSearchParams(options.body);
    return new Response(JSON.stringify({
      access_token:jwt({tid:SETTINGS.graphTenantId,oid:'user-1'}),
      refresh_token:'session-refresh-token',
      id_token:jwt({tid:SETTINGS.graphTenantId,aud:SETTINGS.graphClientId,nonce:harness.nonce,preferred_username:'pilot@example.com'}),
      expires_in:3600
    }), {status:200,headers:{'content-type':'application/json'}});
  };

  const status = await Graph.connect(SETTINGS, {chromeApi:harness.api,cryptoApi:webcrypto,fetchImpl});
  assert.equal(status.connected, true);
  assert.equal(status.accountLabel, 'pilot@example.com');
  assert.equal(authorizationUrl.searchParams.get('code_challenge_method'), 'S256');
  assert.equal(tokenBody.get('code_verifier').length > 40, true);
  assert.equal(tokenBody.has('client_secret'), false);
  assert.equal(JSON.stringify(status).includes('access_token'), false);
  assert.equal(Object.values(harness.session).some(value => value.accessToken && value.refreshToken), true);
});

test('interactive connection rejects substituted state and identity nonce', async () => {
  const stateHarness = chromeHarness();
  stateHarness.api.identity.launchWebAuthFlow = async () =>
    `${stateHarness.api.identity.getRedirectURL('microsoft')}?code=stolen-code&state=substituted`;
  let tokenRequested = false;
  await assert.rejects(
    Graph.connect(SETTINGS, {
      chromeApi:stateHarness.api,
      cryptoApi:webcrypto,
      fetchImpl:async () => { tokenRequested = true; return Response.json({}); }
    }),
    error => error.code === 'STATE_MISMATCH'
  );
  assert.equal(tokenRequested, false);

  const nonceHarness = chromeHarness();
  nonceHarness.api.identity.launchWebAuthFlow = async ({url}) => {
    const authorizationUrl = new URL(url);
    return `${nonceHarness.api.identity.getRedirectURL('microsoft')}?code=one-time-code&state=${authorizationUrl.searchParams.get('state')}`;
  };
  await assert.rejects(
    Graph.connect(SETTINGS, {
      chromeApi:nonceHarness.api,
      cryptoApi:webcrypto,
      fetchImpl:async () => Response.json({
        access_token:jwt({tid:SETTINGS.graphTenantId,oid:'user-1'}),
        id_token:jwt({tid:SETTINGS.graphTenantId,aud:SETTINGS.graphClientId,nonce:'substituted'}),
        expires_in:3600
      })
    }),
    error => error.code === 'NONCE_MISMATCH'
  );
  assert.deepEqual(nonceHarness.session, {});
});

test('delegated import resolves one join URL and downloads the latest official transcript', async () => {
  const harness = chromeHarness({
    graphTranscriptAuthV1: {
      accessToken:'delegated-token',refreshToken:'refresh',expiresAt:Date.now()+3600000,
      tenantId:SETTINGS.graphTenantId,clientId:SETTINGS.graphClientId,account:{username:'pilot@example.com'}
    }
  });
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({url,accept:options.headers.Accept,authorization:options.headers.Authorization});
    if (url.includes('/me/onlineMeetings?')) {
      return Response.json({value:[{id:'meeting-id',subject:'Synthetic review'}]});
    }
    if (url.endsWith('/transcripts')) {
      return Response.json({value:[
        {id:'older',createdDateTime:'2026-09-28T11:00:00Z'},
        {id:'newest',createdDateTime:'2026-09-28T12:00:00Z'}
      ]});
    }
    if (url.endsWith('/transcripts/newest/content')) {
      return new Response('WEBVTT\n\n00:00:01.000 --> 00:00:02.000\n<v Pilot User>Synthetic phrase.</v>\n', {
        status:200,headers:{'content-type':'text/vtt'}
      });
    }
    throw new Error(`Unexpected URL ${url}`);
  };
  const imported = await Graph.importTranscript(SETTINGS,
    'https://teams.microsoft.com/l/meetup-join/19%3ameeting_synthetic/0',
    {chromeApi:harness.api,cryptoApi:webcrypto,fetchImpl});

  assert.equal(imported.transcript[0].Name, 'Pilot User');
  assert.equal(imported.source.type, 'microsoft-graph');
  assert.equal(imported.source.speakerAttribution, 'included');
  assert.match(imported.source.sourceSha256, /^[a-f0-9]{64}$/);
  assert(calls.every(call => call.authorization === 'Bearer delegated-token'));
  assert(calls.some(call => call.url.includes('%24filter=JoinWebUrl')));
  assert(calls.some(call => call.url.endsWith('/transcripts/newest/content')));
});

test('speaker-attribution denial retries only with the unattributed transcript media type', async () => {
  const harness = chromeHarness({
    graphTranscriptAuthV1: {
      accessToken:'delegated-token',refreshToken:'refresh',expiresAt:Date.now()+3600000,
      tenantId:SETTINGS.graphTenantId,clientId:SETTINGS.graphClientId,account:{}
    }
  });
  const accepts = [];
  const fetchImpl = async (url, options) => {
    if (url.includes('/me/onlineMeetings?')) return Response.json({value:[{id:'meeting-id'}]});
    if (url.endsWith('/transcripts')) return Response.json({value:[{id:'transcript-id',createdDateTime:'2026-09-28T12:00:00Z'}]});
    accepts.push(options.headers.Accept);
    if (options.headers.Accept === 'text/vtt') {
      return Response.json({error:{code:'Forbidden',innerError:{code:'SpeakerAttributionNotAllowed'}}}, {status:403});
    }
    return new Response('00:00:01.000 --> 00:00:02.000\nSynthetic phrase.\n', {status:200});
  };
  const imported = await Graph.importTranscript(SETTINGS,
    'https://teams.microsoft.com/l/meetup-join/19%3ameeting_synthetic/0',
    {chromeApi:harness.api,cryptoApi:webcrypto,fetchImpl});
  assert.deepEqual(accepts, ['text/vtt','application/vnd.microsoft.graph.transcript+text']);
  assert.equal(imported.transcript[0].Name, 'Unknown speaker');
  assert.equal(imported.source.speakerAttribution, 'not-allowed');
});
