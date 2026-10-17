const {test} = require('node:test');
const assert = require('node:assert/strict');
const {createHash} = require('node:crypto');
const {EventEmitter} = require('node:events');
const {PassThrough} = require('node:stream');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const modulePromise = import('../companion/byomcp/cloudflare-oauth.mjs');
const storePath = 'C:\\CaptionKeepSyntheticReview\\oauth.dpapi';
const scopes = 'user:read account:read';

async function fixture({token={},metadata={},callback=request=>request,offline=false}={}) {
  const api = await modulePromise;
  const calls = [], responses = [], records = [];
  let requestHandler, authorizationUrl, current = null;
  const store = {read:async()=>structuredClone(current),write:async value=>{current=structuredClone(value);records.push(structuredClone(value));}};
  const serverFactory = handler => {
    requestHandler = handler;
    const server = new EventEmitter();
    server.listen = (port,host,done) => {assert.equal(port,0);assert.equal(host,'127.0.0.1');queueMicrotask(done);};
    server.address = () => ({port:43981}); server.close = () => {};
    return server;
  };
  const fetchFn = async (input,init={}) => {
    const url = new URL(input);
    assert.equal(url.origin,api.ISSUER,'SDK attempted an unapproved issuer');
    calls.push({path:url.pathname,body:String(init.body || ''),method:init.method || 'GET'});
    let value;
    if(url.pathname.includes('oauth-protected-resource')) value={resource:api.RESOURCE,authorization_servers:[api.ISSUER],scopes_supported:scopes.split(' ')};
    else if(url.pathname.includes('well-known')) value={issuer:api.ISSUER,authorization_endpoint:`${api.ISSUER}/authorize`,
      token_endpoint:`${api.ISSUER}/token`,registration_endpoint:`${api.ISSUER}/register`,
      response_types_supported:['code'],grant_types_supported:['authorization_code','refresh_token'],
      scopes_supported:[...scopes.split(' '),'offline_access'],code_challenge_methods_supported:['S256'],
      token_endpoint_auth_methods_supported:['none'],authorization_response_iss_parameter_supported:true,...metadata};
    else if(url.pathname==='/register') value={...JSON.parse(init.body),client_id:'synthetic-independent-review'};
    else if(url.pathname==='/token') value={access_token:'SYNTHETIC_REVIEW_ACCESS',refresh_token:'SYNTHETIC_REVIEW_REFRESH',
      token_type:'Bearer',expires_in:3600,scope:offline?`${scopes} offline_access`:scopes,...token};
    else throw new Error('Unexpected synthetic OAuth request');
    return new Response(JSON.stringify(value),{headers:{'content-type':'application/json'}});
  };
  const authorize = (overrides={}) => api.authorizeCloudflare({storePath,credentialReference:'review-credential',profileId:'review-profile',
    store,serverFactory,fetchFn,timeoutMs:2000,allowOfflineAccess:offline,
    onAuthorizationUrl:async value => {
      authorizationUrl = new URL(value);
      const target = new URL(authorizationUrl.searchParams.get('redirect_uri'));
      target.searchParams.set('state',authorizationUrl.searchParams.get('state'));
      target.searchParams.set('code','synthetic-code');target.searchParams.set('iss',api.ISSUER);
      const request = callback({method:'GET',url:target.pathname+target.search,headers:{host:target.host}},target);
      const response = {writeHead(status,headers){this.status=status;this.headers=headers;},end(body){this.body=body;}};
      requestHandler(request,response);responses.push(response);
    },...overrides});
  return {api,calls,records,responses,authorize,store,current:()=>current,url:()=>authorizationUrl};
}

test('independent actual-SDK authorization binds state, issuer, resource and matching S256 verifier without external network', async () => {
  const f = await fixture();
  const result = await f.authorize(), url=f.url();
  assert.equal(result.authorized,true);assert(!JSON.stringify(result).includes('SYNTHETIC_REVIEW_ACCESS'));
  assert.equal(url.searchParams.get('scope'),scopes);
  assert.equal(url.searchParams.get('resource'),f.api.RESOURCE);
  const exchange = new URLSearchParams(f.calls.find(call=>call.path==='/token').body);
  assert.equal(exchange.get('resource'),f.api.RESOURCE);
  assert.equal(createHash('sha256').update(exchange.get('code_verifier')).digest('base64url'),url.searchParams.get('code_challenge'));
  assert.equal(f.records.length,1);assert.equal(f.current().tokens.refresh_token,undefined);
  assert.equal(f.responses[0].headers['Cache-Control'],'no-store');
  assert.equal(await f.api.getCloudflareAuthorization({id:'review-profile',credentialReference:'review-credential',transport:'remote',resource:f.api.RESOURCE},
    {storePath,store:f.store}),'Bearer SYNTHETIC_REVIEW_ACCESS');
});

for (const [name,mutate] of [
  ['duplicate state',(request)=>({...request,url:request.url+'&state=second'})],
  ['duplicate code',(request)=>({...request,url:request.url+'&code=second'})],
  ['duplicate issuer',(request)=>({...request,url:request.url+'&iss=https%3A%2F%2Fmcp.cloudflare.com'})],
  ['wrong Host',(request)=>({...request,headers:{host:'attacker.invalid'}})],
  ['POST callback',(request)=>({...request,method:'POST'})],
  ['foreign absolute URL',(request)=>({...request,url:'https://attacker.invalid'+request.url})],
  ['OAuth error',(request)=>({...request,url:request.url+'&error=access_denied'})]
]) test(`independent callback rejection: ${name}`,async()=>{
  const f = await fixture({callback:mutate});
  await assert.rejects(f.authorize(),/cloudflare-authorization-not-verified/);
  assert.equal(f.records.length,0);assert(!f.calls.some(call=>call.path==='/token'));
  assert.equal(f.responses[0].status,400);
});

test('authorization redirect gate rejects PKCE downgrade before presenting a consent URL', async()=>{
  const f = await fixture();let presented=0;
  await assert.rejects(f.authorize({onAuthorizationUrl:()=>{presented++;},authFunction:async provider=>{
    const url=new URL(`${f.api.ISSUER}/authorize`);
    for(const [key,value] of Object.entries({state:provider.state(),code_challenge_method:'plain',code_challenge:'synthetic',
      redirect_uri:provider.redirectUrl,resource:f.api.RESOURCE,scope:scopes}))url.searchParams.set(key,value);
    await provider.redirectToAuthorization(url);return 'REDIRECT';
  }}),/not-verified/);
  assert.equal(presented,0);assert.equal(f.records.length,0);
});

test('independent initial grants reject excess privilege and issuer metadata before persistence', async()=>{
  for(const options of [{token:{scope:`${scopes} zone:write`}},{token:{scope:`${scopes} offline_access`}},
    {metadata:{issuer:'https://attacker.invalid'}},{metadata:{token_endpoint:'https://attacker.invalid/token'}},
    {token:{expires_in:0}},{token:{token_type:'Basic'}},{token:{access_token:'synthetic\r\nInjected: value'}}]){
    const f=await fixture(options);await assert.rejects(f.authorize(),/not-verified/);assert.equal(f.records.length,0);
  }
});

test('noninteractive authorization denies cross-profile credentials and rejected refresh never changes the persisted grant',async()=>{
  const f=await fixture({offline:true});await f.authorize();
  const profile={id:'review-profile',credentialReference:'review-credential',transport:'remote',resource:f.api.RESOURCE};
  let refreshed=0;
  for(const mutation of [{id:'different-profile'},{credentialReference:'different-reference'},{resource:'https://attacker.invalid/mcp'},{transport:'stdio'}]) {
    await assert.rejects(f.api.getCloudflareAuthorization({...profile,...mutation},{storePath,store:f.store,refreshFunction:async()=>{refreshed++;}}));
  }
  assert.equal(refreshed,0);
  const before=structuredClone(f.current());
  await assert.rejects(f.api.getCloudflareAuthorization(profile,{storePath,store:f.store,now:()=>before.expiresAt+1,
    refreshFunction:async()=>({access_token:'SYNTHETIC_UNAPPROVED',expires_in:3600,token_type:'Bearer',scope:'zone:write'})}),/not-verified/);
  assert.deepEqual(f.current(),before);
  const seen=f.calls.length;
  assert.equal(await f.api.getCloudflareAuthorization(profile,{storePath,store:f.store,now:()=>before.expiresAt+1,
    refreshFunction:async()=>({access_token:'SYNTHETIC_REFRESHED',expires_in:3600,token_type:'Bearer'})}),'Bearer SYNTHETIC_REFRESHED');
  assert.equal(f.current().tokens.refresh_token,before.tokens.refresh_token);
  assert.equal(f.current().tokens.scope,before.tokens.scope);assert.equal(f.calls.length,seen);
});

const readCatalog=['user:read','account:read','offline_access','zone:read','dns:metadata_read','logs:monitoring','audit:report','zone:write','tokens:edit'];
const selectedReadCatalog=readCatalog.slice(0,7).join(' ');

test('explicit read-only preset uses metadata-derived catalog through the actual SDK and never retains refresh authorization',async()=>{
  const f=await fixture({metadata:{scopes_supported:readCatalog},token:{scope:selectedReadCatalog}});
  const result=await f.authorize({readOnlySessionPreset:true,allowOfflineAccess:true});
  assert.equal(result.consentMode,'cloudflare-read-only-session');
  assert.equal(f.url().searchParams.get('scope'),selectedReadCatalog);
  assert.equal(f.calls[0].path,'/.well-known/oauth-authorization-server');
  assert.deepEqual(JSON.parse(f.calls.find(call=>call.path==='/register').body).grant_types,['authorization_code']);
  assert.equal(f.current().tokens.scope,selectedReadCatalog);
  assert.equal(f.current().tokens.refresh_token,undefined);
  assert.equal(f.current().consentMode,'cloudflare-read-only-session');
  const minimal=await fixture({metadata:{scopes_supported:readCatalog},token:{scope:selectedReadCatalog}});
  await assert.rejects(minimal.authorize(),/not-verified/);assert.equal(minimal.records.length,0);
  const nonBoolean=await fixture({metadata:{scopes_supported:readCatalog}});
  await assert.rejects(nonBoolean.authorize({readOnlySessionPreset:'true'}),/not-verified/);
  assert.equal(nonBoolean.calls.length,0);
});

test('read-only preset rejects write and unadvertised read grants before any vault persistence',async()=>{
  for(const extra of ['zone:write','tokens:edit','unknown-service:read']){
    const f=await fixture({metadata:{scopes_supported:readCatalog},token:{scope:`${selectedReadCatalog} ${extra}`}});
    await assert.rejects(f.authorize({readOnlySessionPreset:true}),/not-verified/);
    assert.equal(f.records.length,0);
  }
});

test('expired read-only preset never refreshes even if a refresh token is injected into the stored record',async()=>{
  const f=await fixture({metadata:{scopes_supported:readCatalog},token:{scope:selectedReadCatalog}});
  await f.authorize({readOnlySessionPreset:true});
  f.current().tokens.refresh_token='SYNTHETIC_INJECTED_REFRESH';
  const calls=f.calls.length,stored=structuredClone(f.current());let refreshes=0;
  await assert.rejects(f.api.getCloudflareAuthorization({id:'review-profile',credentialReference:'review-credential',transport:'remote',resource:f.api.RESOURCE},
    {storePath,store:f.store,now:()=>stored.expiresAt+1,refreshFunction:async()=>{refreshes++;throw Error('Must not refresh preset');}}),/not-verified/);
  assert.equal(refreshes,0);assert.equal(f.calls.length,calls);assert.deepEqual(f.current(),stored);
});

test('malformed or oversized read-only catalog fails before SDK registration, callback presentation or persistence',async()=>{
  const required=['user:read','account:read','offline_access'];
  for(const catalog of [[...required,'bad scope:read'],[...readCatalog,'zone:read'],['zone:read'],
    [...required,...Array.from({length:1025},(_,index)=>`service${index}:read`)],
    [...required,...Array.from({length:200},(_,index)=>`service${index}${'x'.repeat(100)}:read`)]]){
    const f=await fixture({metadata:{scopes_supported:catalog}});
    await assert.rejects(f.authorize({readOnlySessionPreset:true}),/not-verified/);
    assert.equal(f.calls.length,1);assert.equal(f.calls[0].path,'/.well-known/oauth-authorization-server');
    assert.equal(f.url(),undefined);assert.equal(f.records.length,0);
  }
});

function syntheticHttps(api,{addresses=[{address:'104.16.1.1',family:4}],status=200,type='application/json',
  value={resource:api.RESOURCE,authorization_servers:[api.ISSUER]}}={}) {
  let sends=0,lookups=0;
  const fetchFn=api.createCloudflareOAuthFetch({resolveAddress:(hostname,options,callback)=>{
    lookups++;assert.equal(hostname,'mcp.cloudflare.com');assert.deepEqual(options,{all:true,family:4});callback(null,addresses);
  },send:(url,options,receive)=>{
    sends++;
    const request=new EventEmitter();request.setTimeout=()=>{};request.destroy=error=>queueMicrotask(()=>request.emit('error',error));
    request.end=()=>queueMicrotask(()=>options.lookup(url.hostname,{},error=>{
      if(error){request.emit('error',error);return;}
      const response=new EventEmitter();response.statusCode=status;response.headers={'content-type':type};let destroyed=false;
      response.destroy=()=>{destroyed=true;};receive(response);
      queueMicrotask(()=>{if(!destroyed){response.emit('data',Buffer.from(JSON.stringify(value)));response.emit('end');}});
    }));return request;
  }});
  return {fetchFn,sends:()=>sends,lookups:()=>lookups};
}

test('OAuth fetch gate rejects alternate destinations and refresh registration without sending a request',async()=>{
  const api=await modulePromise;let sends=0;
  const fetchFn=api.createCloudflareOAuthFetch({allowRegistration:false,send:()=>{sends++;throw Error('Unexpected synthetic send');}});
  for(const [url,init] of [
    ['https://attacker.invalid/token',{method:'POST'}],['http://mcp.cloudflare.com/token',{method:'POST'}],
    [`${api.ISSUER}/token?next=attacker`,{method:'POST'}],[`${api.ISSUER}/token#fragment`,{method:'POST'}],
    ['https://user:password@mcp.cloudflare.com/token',{method:'POST'}],[`${api.ISSUER}/register`,{method:'POST'}],
    [`${api.ISSUER}/.well-known/oauth-authorization-server`,{headers:{authorization:'Bearer SYNTHETIC_REVIEW_ACCESS'}}]
  ]) await assert.rejects(fetchFn(url,init),/not-verified/);
  assert.equal(sends,0);
});

test('OAuth DNS guard allows exact public IPv4 metadata but rejects private, mixed and wrong-family responses',async()=>{
  const api=await modulePromise;
  const good=syntheticHttps(api);
  assert.equal((await good.fetchFn(`${api.ISSUER}/.well-known/oauth-protected-resource/mcp`)).status,200);
  assert.equal(good.lookups(),1);
  for(const addresses of [[],[{address:'127.0.0.1',family:4}],[{address:'10.0.0.2',family:4}],
    [{address:'::1',family:6}],[{address:'104.16.1.1',family:4},{address:'192.168.0.2',family:4}]]){
    const f=syntheticHttps(api,{addresses});
    await assert.rejects(f.fetchFn(`${api.ISSUER}/.well-known/oauth-protected-resource/mcp`),/not-verified/);
    assert.equal(f.lookups(),1);
  }
});

test('OAuth metadata guard rejects wrong resources, redirected responses and non-JSON bodies without following them',async()=>{
  const api=await modulePromise;
  for(const options of [{value:{resource:'https://attacker.invalid/mcp',authorization_servers:[api.ISSUER]}},
    {value:{resource:api.RESOURCE,authorization_servers:[api.ISSUER,'https://attacker.invalid']}},
    {status:302},{type:'text/html'}]) {
    const f=syntheticHttps(api,options);
    await assert.rejects(f.fetchFn(`${api.ISSUER}/.well-known/oauth-protected-resource/mcp`),/not-verified/);
    assert.equal(f.sends(),1);
  }
});

test('credential path validation rejects ADS and OS boundary before spawning any process',async()=>{
  const {createWindowsCredentialStore}=await modulePromise;let spawned=0;
  for(const filename of ['C:\\Private\\token:alternate.dpapi','C:\\Private\\token.dpapi:alternate.dpapi',
    '\\\\server\\private\\token.dpapi','C:\\token.dpapi','C:\\Private\\..\\token.dpapi']) {
    assert.throws(()=>createWindowsCredentialStore({storePath:filename,platform:'win32',systemRoot:'C:\\Windows',spawnProcess:()=>{spawned++;}}));
  }
  assert.throws(()=>createWindowsCredentialStore({storePath,platform:'linux',systemRoot:'C:\\Windows',spawnProcess:()=>{spawned++;}}));
  assert.equal(spawned,0);
});

test('credential storage failures never echo secret-bearing OS stderr or place secrets in process arguments',async()=>{
  const {createWindowsCredentialStore}=await modulePromise;let input;
  const store=createWindowsCredentialStore({storePath,platform:'win32',systemRoot:'C:\\Windows',spawnProcess:(_file,args,options)=>{
    assert.equal(options.windowsHide,true);assert(!JSON.stringify(args).includes('SYNTHETIC_PRIVATE_VALUE'));
    const child=new EventEmitter();child.stdin=new PassThrough();child.stdout=new PassThrough();child.stderr=new PassThrough();child.kill=()=>{};
    const bytes=[];child.stdin.on('data',chunk=>bytes.push(chunk));child.stdin.on('finish',()=>{
      input=JSON.parse(Buffer.concat(bytes));child.stderr.write('SYNTHETIC_PRIVATE_VALUE upstream diagnostic');child.emit('close',1);
    });return child;
  }});
  await assert.rejects(store.write({token:'SYNTHETIC_PRIVATE_VALUE'}),error=>error.message==='cloudflare-authorization-not-verified');
  assert.equal(JSON.parse(input.value).token,'SYNTHETIC_PRIVATE_VALUE');
});

test('Windows current-user DPAPI protects only an owned temporary synthetic credential; other OSes deny storage',async()=>{
  const {createWindowsCredentialStore}=await modulePromise;
  if(process.platform!=='win32') {
    assert.throws(()=>createWindowsCredentialStore({storePath}));return;
  }
  const prefix=path.join(os.tmpdir(),'captionkeep-oauth-security-review-'),root=await fs.mkdtemp(prefix);
  const filename=path.join(root,'vault','synthetic.dpapi');
  try {
    const store=createWindowsCredentialStore({storePath:filename});
    const synthetic={token:'SYNTHETIC_DPAPI_REVIEW_NOT_A_REAL_CREDENTIAL'};
    assert.equal(await store.write(synthetic),true);
    assert(!(await fs.readFile(filename)).includes(Buffer.from(synthetic.token)));
    assert.deepEqual(await store.read(),synthetic);
  } finally {
    assert(path.resolve(root).startsWith(path.resolve(prefix)));
    await fs.rm(root,{recursive:true,force:true});
  }
});
