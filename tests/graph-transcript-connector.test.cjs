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
  assert(Graph.AUTH_SCOPES.includes('Calendars.ReadBasic'));
  assert(!Graph.AUTH_SCOPES.includes('Calendars.Read'));
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
    'https://teams.microsoft.com/meet/not-a-meeting-id',
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

test('WebVTT parsing removes markup and decodes entities exactly once', () => {
  const raw = `WEBVTT\n\n00:00:01.500 --> 00:00:04.000\n<v Ada &amp; Lovelace>Hello <b>team</b> &amp; goodbye &amp;lt;script&amp;gt;.</v>\n`;
  const [entry] = Graph.parseTranscript(raw, {createdDateTime:'2026-09-28T12:00:00Z'}, true);
  assert.equal(entry.Name, 'Ada & Lovelace');
  assert.equal(entry.Text, 'Hello team & goodbye &lt;script&gt;.');
  assert.equal(entry.Text.includes('<b>'), false);
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
  assert.deepEqual(authorizationUrl.searchParams.get('scope').split(' '), [...Graph.AUTH_SCOPES]);
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

test('current Teams meeting links resolve by numeric join meeting ID', async () => {
  const harness = chromeHarness({
    graphTranscriptAuthV1: {
      accessToken:'delegated-token',refreshToken:'refresh',expiresAt:Date.now()+3600000,
      tenantId:SETTINGS.graphTenantId,clientId:SETTINGS.graphClientId,account:{username:'pilot@example.com'}
    }
  });
  const calls = [];
  const fetchImpl = async (url) => {
    calls.push(url);
    if (url.includes('/me/onlineMeetings?')) return Response.json({value:[{id:'meeting-id'}]});
    if (url.endsWith('/transcripts')) return Response.json({value:[{id:'transcript-id',createdDateTime:'2026-09-29T12:00:00Z'}]});
    if (url.endsWith('/transcripts/transcript-id/content')) {
      return new Response('WEBVTT\n\n00:00:01.000 --> 00:00:02.000\n<v Pilot User>Current meeting.</v>\n', {status:200});
    }
    throw new Error(`Unexpected URL ${url}`);
  };

  await Graph.importTranscript(SETTINGS,
    'https://teams.microsoft.com/meet/123456789012?p=syntheticToken',
    {chromeApi:harness.api,cryptoApi:webcrypto,fetchImpl});

  const lookup = new URL(calls.find(url => url.includes('/me/onlineMeetings?')));
  assert.equal(lookup.searchParams.get('$filter'), "joinMeetingIdSettings/joinMeetingId eq '123456789012'");
});

test('recent meeting discovery returns five transient eligible Teams meetings in newest-first order', async () => {
  const harness = chromeHarness({
    graphTranscriptAuthV1: {
      accessToken:'delegated-token',refreshToken:'refresh',expiresAt:Date.now()+3600000,
      tenantId:SETTINGS.graphTenantId,clientId:SETTINGS.graphClientId,account:{username:'pilot@example.com'}
    }
  });
  const nowMs = Date.parse('2026-10-01T15:00:00Z');
  let calendarUrl;
  const events = Array.from({length:7}, (_, index) => ({
    id:`calendar-event-${index}`,
    subject:`Synthetic meeting ${index}`,
    isOrganizer:index % 2 === 0,
    start:{dateTime:new Date(nowMs - index * 3600000).toISOString(),timeZone:'UTC'},
    end:{dateTime:new Date(nowMs - index * 3600000 + 1800000).toISOString(),timeZone:'UTC'},
    onlineMeeting:{joinUrl:`https://teams.microsoft.com/meet/${123456789000 + index}?p=synthetic${index}`}
  }));
  events.push({
    subject:'Future meeting',
    start:{dateTime:new Date(nowMs + 86400000).toISOString(),timeZone:'UTC'},
    end:{dateTime:new Date(nowMs + 90000000).toISOString(),timeZone:'UTC'},
    onlineMeeting:{joinUrl:'https://teams.microsoft.com/meet/999999999999?p=future'}
  });
  events.push({
    subject:'Non-Teams event',
    start:{dateTime:new Date(nowMs - 7200000).toISOString(),timeZone:'UTC'},
    end:{dateTime:new Date(nowMs - 7000000).toISOString(),timeZone:'UTC'}
  });
  const meetings = await Graph.listRecentMeetings(SETTINGS, {
    chromeApi:harness.api,
    nowMs,
    fetchImpl:async (url, options) => {
      calendarUrl = new URL(url);
      assert.equal(options.headers.Prefer, 'outlook.timezone="UTC"');
      assert.equal(options.cache, 'no-store');
      return Response.json({value:events});
    }
  });

  assert.equal(calendarUrl.pathname, '/v1.0/me/calendarView');
  assert.equal(calendarUrl.searchParams.get('$top'), '25');
  assert.match(calendarUrl.searchParams.get('$select'), /onlineMeeting/);
  assert.equal(meetings.length, 5);
  assert.equal(meetings[0].subject, 'Synthetic meeting 0');
  assert.equal(meetings[0].state, 'in-progress');
  assert.equal(meetings[1].state, 'ended');
  assert.equal(Object.hasOwn(meetings[0], 'id'), false);
  assert.equal(Object.hasOwn(meetings[0], 'organizer'), false);
});

test('recent meeting discovery normalizes Graph UTC timestamps with extended fractional seconds', async () => {
  const harness = chromeHarness({
    graphTranscriptAuthV1: {
      accessToken:'delegated-token',refreshToken:'refresh',expiresAt:Date.now()+3600000,
      tenantId:SETTINGS.graphTenantId,clientId:SETTINGS.graphClientId,account:{}
    }
  });
  const meetings = await Graph.listRecentMeetings(SETTINGS, {
    chromeApi:harness.api,
    nowMs:Date.parse('2026-10-01T15:00:00Z'),
    fetchImpl:async () => Response.json({value:[{
      subject:'Graph UTC meeting',
      start:{dateTime:'2026-10-01T14:30:00.0000000',timeZone:'UTC'},
      end:{dateTime:'2026-10-01T15:30:00.0000000',timeZone:'UTC'},
      onlineMeeting:{joinUrl:'https://teams.microsoft.com/meet/323456789000?p=utcproof'}
    }]})
  });
  assert.equal(meetings[0].startDateTime, '2026-10-01T14:30:00.000Z');
  assert.equal(meetings[0].state, 'in-progress');
});

test('revoked Microsoft token fails closed and clears session authentication', async () => {
  const harness = chromeHarness({
    graphTranscriptAuthV1: {
      accessToken:'revoked-token',refreshToken:'refresh',expiresAt:Date.now()+3600000,
      tenantId:SETTINGS.graphTenantId,clientId:SETTINGS.graphClientId,account:{}
    }
  });
  await assert.rejects(
    Graph.listRecentMeetings(SETTINGS, {
      chromeApi:harness.api,
      fetchImpl:async () => Response.json({error:{code:'InvalidAuthenticationToken'}}, {status:401})
    }),
    error => error.code === 'SIGN_IN_REQUIRED'
  );
  assert.equal(Object.hasOwn(harness.session, 'graphTranscriptAuthV1'), false);
});

test('expired refresh-token denial clears session authentication', async () => {
  const harness = chromeHarness({
    graphTranscriptAuthV1: {
      accessToken:'expired-token',refreshToken:'revoked-refresh-token',expiresAt:0,
      tenantId:SETTINGS.graphTenantId,clientId:SETTINGS.graphClientId,account:{}
    }
  });
  await assert.rejects(
    Graph.listRecentMeetings(SETTINGS, {
      chromeApi:harness.api,
      fetchImpl:async () => Response.json({error:'invalid_grant'}, {status:400})
    }),
    error => error.code === 'invalid_grant'
  );
  assert.equal(Object.hasOwn(harness.session, 'graphTranscriptAuthV1'), false);
});

test('disconnect removes the complete delegated session', async () => {
  const harness = chromeHarness({
    graphTranscriptAuthV1: {
      accessToken:'delegated-token',refreshToken:'refresh-token',expiresAt:Date.now()+3600000,
      tenantId:SETTINGS.graphTenantId,clientId:SETTINGS.graphClientId,account:{username:'pilot@example.com'}
    }
  });
  assert.deepEqual(await Graph.disconnect({chromeApi:harness.api}), {connected:false});
  assert.deepEqual(harness.session, {});
  assert.equal((await Graph.status(SETTINGS, {chromeApi:harness.api})).connected, false);
});

test('meeting denial, missing transcript, and disabled transcript access remain distinct recovery states', async () => {
  const joinUrl = 'https://teams.microsoft.com/meet/423456789000?p=negativeproof';
  const cases = [
    {
      code:'Authorization_RequestDenied',
      fetchImpl:async () => Response.json({error:{code:'Authorization_RequestDenied'}}, {status:403})
    },
    {
      code:'TRANSCRIPT_NOT_FOUND',
      fetchImpl:async url => url.includes('/me/onlineMeetings?')
        ? Response.json({value:[{id:'meeting-id'}]})
        : Response.json({value:[]})
    },
    {
      code:'GraphAccessToTranscriptsDisabled',
      fetchImpl:async url => {
        if (url.includes('/me/onlineMeetings?')) return Response.json({value:[{id:'meeting-id'}]});
        return Response.json({error:{code:'GraphAccessToTranscriptsDisabled'}}, {status:403});
      }
    }
  ];

  for (const scenario of cases) {
    const harness = chromeHarness({
      graphTranscriptAuthV1: {
        accessToken:'delegated-token',refreshToken:'refresh',expiresAt:Date.now()+3600000,
        tenantId:SETTINGS.graphTenantId,clientId:SETTINGS.graphClientId,account:{}
      }
    });
    await assert.rejects(
      Graph.importTranscript(SETTINGS, joinUrl, {chromeApi:harness.api,cryptoApi:webcrypto,fetchImpl:scenario.fetchImpl}),
      error => error.code === scenario.code
    );
    assert.equal(Object.hasOwn(harness.session, 'graphTranscriptAuthV1'), true);
  }
});

test('recent meeting discovery follows bounded Graph pagination until five Teams meetings are found', async () => {
  const harness = chromeHarness({
    graphTranscriptAuthV1: {
      accessToken:'delegated-token',refreshToken:'refresh',expiresAt:Date.now()+3600000,
      tenantId:SETTINGS.graphTenantId,clientId:SETTINGS.graphClientId,account:{}
    }
  });
  const nowMs = Date.parse('2026-10-01T15:00:00Z');
  let calls = 0;
  const meetings = await Graph.listRecentMeetings(SETTINGS, {
    chromeApi:harness.api,
    nowMs,
    fetchImpl:async url => {
      calls += 1;
      if (calls === 1) {
        return Response.json({
          value:[{subject:'Non-Teams event',start:{dateTime:'2026-10-01T13:00:00Z'},end:{dateTime:'2026-10-01T14:00:00Z'}}],
          '@odata.nextLink':'https://graph.microsoft.com/v1.0/me/calendarView?$skiptoken=synthetic'
        });
      }
      assert.match(url, /\$skiptoken=synthetic/);
      return Response.json({value:Array.from({length:5}, (_, index) => ({
        subject:`Paged Teams meeting ${index}`,
        start:{dateTime:new Date(nowMs - index * 3600000).toISOString()},
        end:{dateTime:new Date(nowMs - index * 3600000 + 1800000).toISOString()},
        onlineMeeting:{joinUrl:`https://teams.microsoft.com/meet/${223456789000 + index}?p=paged${index}`}
      }))});
    }
  });
  assert.equal(calls, 2);
  assert.equal(meetings.length, 5);
});

test('recent meeting discovery pages past recurring occurrences until five unique meetings are found', async () => {
  const harness = chromeHarness({
    graphTranscriptAuthV1: {
      accessToken:'delegated-token',refreshToken:'refresh',expiresAt:Date.now()+3600000,
      tenantId:SETTINGS.graphTenantId,clientId:SETTINGS.graphClientId,account:{}
    }
  });
  const nowMs = Date.parse('2026-10-01T15:00:00Z');
  const recurringJoinUrl = 'https://teams.microsoft.com/meet/523456789000?p=recurring';
  let calls = 0;
  const meetings = await Graph.listRecentMeetings(SETTINGS, {
    chromeApi:harness.api,
    nowMs,
    fetchImpl:async url => {
      calls += 1;
      if (calls === 1) {
        return Response.json({
          value:Array.from({length:5}, (_, index) => ({
            subject:`Recurring validation ${index}`,
            start:{dateTime:new Date(nowMs - index * 3600000).toISOString(),timeZone:'UTC'},
            end:{dateTime:new Date(nowMs - index * 3600000 + 1800000).toISOString(),timeZone:'UTC'},
            onlineMeeting:{joinUrl:recurringJoinUrl}
          })),
          '@odata.nextLink':'https://graph.microsoft.com/v1.0/me/calendarView?$skiptoken=after-recurring'
        });
      }
      assert.match(url, /\$skiptoken=after-recurring/);
      return Response.json({value:Array.from({length:4}, (_, index) => ({
        subject:`Unique meeting ${index}`,
        start:{dateTime:new Date(nowMs - (index + 5) * 3600000).toISOString(),timeZone:'UTC'},
        end:{dateTime:new Date(nowMs - (index + 5) * 3600000 + 1800000).toISOString(),timeZone:'UTC'},
        onlineMeeting:{joinUrl:`https://teams.microsoft.com/meet/${623456789000 + index}?p=unique${index}`}
      }))});
    }
  });

  assert.equal(calls, 2);
  assert.equal(meetings.length, 5);
  assert.deepEqual(meetings.map(meeting => meeting.subject), [
    'Recurring validation 0',
    'Unique meeting 0',
    'Unique meeting 1',
    'Unique meeting 2',
    'Unique meeting 3'
  ]);
  assert.equal(new Set(meetings.map(meeting => meeting.joinUrl)).size, 5);
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
