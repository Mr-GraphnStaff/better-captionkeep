import {test} from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {PassThrough} from 'node:stream';
import {authorizeCloudflare,authorizationFailureDiagnostic,getCloudflareAuthorization,createWindowsCredentialStore,createCloudflareOAuthFetch,readOnlyCloudflareScopes,DPAPI_SCRIPT,ISSUER,RESOURCE} from '../cloudflare-oauth.mjs';
const storePath='C:\\CaptionKeepPrivate\\cloudflare.dpapi';
const profile={id:'cloudflare-test',credentialReference:'cloudflare-token',transport:'remote',resource:RESOURCE};
function fixture() {
  let record=null;const seen=[];
  const store={read:async()=>structuredClone(record),write:async value=>{record=structuredClone(value);}};
  const metadata={issuer:ISSUER,authorization_endpoint:`${ISSUER}/authorize`,token_endpoint:`${ISSUER}/token`,registration_endpoint:`${ISSUER}/register`,
    response_types_supported:['code'],grant_types_supported:['authorization_code','refresh_token'],scopes_supported:['user:read','account:read','offline_access'],code_challenge_methods_supported:['S256'],token_endpoint_auth_methods_supported:['none'],authorization_response_iss_parameter_supported:true};
  const fetchFn=async(input,init={})=>{
    const url=new URL(input);seen.push({path:url.pathname,method:init.method || 'GET',body:String(init.body || '')});
    let value;
    if(url.pathname.includes('oauth-protected-resource'))value={resource:RESOURCE,authorization_servers:[ISSUER],scopes_supported:['user:read','account:read']};
    else if(url.pathname.includes('well-known'))value=metadata;
    else if(url.pathname==='/register')value={...JSON.parse(init.body),client_id:'synthetic-client'};
    else if(url.pathname==='/token')value={access_token:'SYNTHETIC_ACCESS_NOT_A_REAL_SECRET',refresh_token:'SYNTHETIC_REFRESH',token_type:'Bearer',expires_in:3600,
      scope:new URLSearchParams(init.body).get('scope') || JSON.parse(seen.find(item=>item.path==='/register').body).scope || 'user:read account:read'};
    else throw Error('Unexpected fixture path');
    return new Response(JSON.stringify(value),{headers:{'content-type':'application/json'}});
  };
  return {store,fetchFn,seen,metadata,record:()=>record,setRecord:value=>{record=value;}};
}
async function finishAuthorization(f,mutate=url=>url,options={}) {
  return authorizeCloudflare({storePath,credentialReference:profile.credentialReference,profileId:profile.id,store:f.store,fetchFn:f.fetchFn,timeoutMs:2000,
    ...options,onAuthorizationUrl:async value=>{
      const authorization=new URL(value);assert.equal(authorization.origin,ISSUER);assert.equal(authorization.searchParams.get('code_challenge_method'),'S256');
      assert.equal(authorization.searchParams.get('resource'),RESOURCE);
      const callback=new URL(authorization.searchParams.get('redirect_uri'));assert.equal(callback.hostname,'127.0.0.1');
      callback.searchParams.set('code','synthetic-code');callback.searchParams.set('state',authorization.searchParams.get('state'));callback.searchParams.set('iss',ISSUER);
      const response=await fetch(mutate(callback));return response.text();
    }});
}
test('actual pinned SDK executes PKCE/DCR and issuer-bound callback; only protected injected store receives tokens',async()=>{
  const f=fixture(),result=await finishAuthorization(f);
  assert.equal(result.authorized,true);assert(!JSON.stringify(result).includes('SYNTHETIC_ACCESS'));
  const exchange=f.seen.find(item=>item.path==='/token'),body=new URLSearchParams(exchange.body);
  assert.equal(body.get('grant_type'),'authorization_code');assert.equal(body.get('resource'),RESOURCE);assert(body.get('code_verifier').length>=43);
  assert.equal(f.record().issuer,ISSUER);assert.equal(f.record().profileId,profile.id);
  assert.equal(f.record().tokens.refresh_token,undefined);
  assert.equal(await getCloudflareAuthorization(profile,{storePath,store:f.store}),'Bearer SYNTHETIC_ACCESS_NOT_A_REAL_SECRET');
});
for(const mutation of ['state','issuer','path'])test(`callback ${mutation} mismatch rejects before code exchange or token persistence`,async()=>{
  const f=fixture();await assert.rejects(finishAuthorization(f,url=>{
    if(mutation==='state')url.searchParams.set('state','wrong');
    if(mutation==='issuer')url.searchParams.set('iss','https://attacker.invalid');
    if(mutation==='path')url.pathname='/other';return url;
  }),/not-verified/);
  assert(!f.seen.some(item=>item.path==='/token'));assert.equal(f.record(),null);
});
test('timeout/cancellation cannot open consent or hang an awaited initialization',async()=>{
  const f=fixture();let opened=0;
  await assert.rejects(authorizeCloudflare({storePath,credentialReference:profile.credentialReference,store:f.store,timeoutMs:5,
    onAuthorizationUrl:()=>{opened++;},authFunction:async()=>new Promise(()=>{})}),/not-verified/);
  const controller=new AbortController();controller.abort();
  await assert.rejects(authorizeCloudflare({storePath,credentialReference:profile.credentialReference,signal:controller.signal,store:f.store,onAuthorizationUrl:()=>{opened++;}}));
  assert.equal(opened,0);assert.equal(f.record(),null);
});
test('noninteractive getter refreshes only an existing matching profile and never registers or authorizes',async()=>{
  const f=fixture();await finishAuthorization(f,url=>url,{allowOfflineAccess:true});f.record().expiresAt=0;
  let refreshed=0;
  const refreshFunction=async(issuer,options)=>{refreshed++;assert.equal(issuer,ISSUER);assert.equal(options.resource,RESOURCE);
    return {access_token:'NEW_SYNTHETIC',refresh_token:'NEW_REFRESH',expires_in:3600,token_type:'Bearer',scope:f.record().tokens.scope};};
  const previous=f.seen.length;
  assert.equal(await getCloudflareAuthorization(profile,{storePath,store:f.store,refreshFunction}),'Bearer NEW_SYNTHETIC');assert.equal(refreshed,1);assert.equal(f.seen.length,previous);
  await assert.rejects(getCloudflareAuthorization({...profile,id:'different-profile'},{storePath,store:f.store,refreshFunction}));assert.equal(refreshed,1);
  f.record().expiresAt=0;
  await assert.rejects(getCloudflareAuthorization(profile,{storePath,store:f.store,refreshFunction:async()=>{throw Error('sensitive upstream');}}),error=>!error.message.includes('sensitive'));
});
test('noninteractive refresh rejects widened scopes and never saves unapproved grant',async()=>{
  const f=fixture();await finishAuthorization(f,url=>url,{allowOfflineAccess:true});f.record().expiresAt=0;
  await assert.rejects(getCloudflareAuthorization(profile,{storePath,store:f.store,refreshFunction:async()=>({access_token:'changed',expires_in:3600,token_type:'Bearer',scope:'zone:write'})}));
  assert.notEqual(f.record().tokens.access_token,'changed');
});
test('Windows storage paths are explicit local private files; DPAPI secret is stdin only',async()=>{
  for(const value of ['relative.dpapi','\\\\server\\share\\store.dpapi','C:\\store.dpapi','C:\\Private\\..\\store.dpapi','C:\\Private\\store.json','C:\\Private\\file:secret.dpapi'])
    assert.throws(()=>createWindowsCredentialStore({storePath:value,platform:'win32',systemRoot:'C:\\Windows'}));
  let captured;
  const store=createWindowsCredentialStore({storePath,platform:'win32',systemRoot:'C:\\Windows',spawnProcess:(executable,args,options)=>{
    assert(executable.endsWith('powershell.exe'));assert.equal(options.windowsHide,true);assert(!JSON.stringify(args).includes('SYNTHETIC_TOKEN'));
    assert.equal(args.at(-1),DPAPI_SCRIPT);const child=new EventEmitter();child.stdin=new PassThrough();child.stdout=new PassThrough();child.stderr=new PassThrough();child.kill=()=>{};
    const data=[];child.stdin.on('data',chunk=>data.push(chunk));child.stdin.on('finish',()=>{captured=JSON.parse(Buffer.concat(data));child.stdout.write('true');child.emit('close',0);});return child;
  }});
  await store.write({token:'SYNTHETIC_TOKEN'});assert(JSON.parse(captured.value).token==='SYNTHETIC_TOKEN');
  assert(DPAPI_SCRIPT.includes('CurrentUser'));assert(DPAPI_SCRIPT.includes('AreAccessRulesProtected'));assert(DPAPI_SCRIPT.includes('ReparsePoint'));
});
test('initial broadened scopes, wrong metadata issuer and expired tokens never persist',async()=>{
  for(const defect of ['scope','issuer','expiry']) {
    const f=fixture();const original=f.fetchFn;
    if(defect==='issuer')f.metadata.issuer='https://attacker.invalid';
    f.fetchFn=async(input,init)=>{const response=await original(input,init),value=await response.json();
      if(new URL(input).pathname==='/token') {if(defect==='scope')value.scope='user:read account:read offline_access';if(defect==='expiry')value.expires_in=0;}
      return new Response(JSON.stringify(value),{headers:{'content-type':'application/json'}});
    };
    await assert.rejects(finishAuthorization(f),/not-verified/);assert.equal(f.record(),null);
  }
});
test('refresh without replacement refresh token or scope preserves only the original bound grant',async()=>{
  const f=fixture();await finishAuthorization(f,url=>url,{allowOfflineAccess:true});f.record().expiresAt=0;
  const prior=f.record().tokens.refresh_token,scope=f.record().tokens.scope;
  await getCloudflareAuthorization(profile,{storePath,store:f.store,refreshFunction:async()=>({access_token:'REFRESHED_SYNTHETIC',token_type:'Bearer',expires_in:3600})});
  assert.equal(f.record().tokens.refresh_token,prior);assert.equal(f.record().tokens.scope,scope);
});
test('OAuth HTTP guard rejects foreign origins, paths, redirects and private DNS without forwarding credentials',async()=>{
  const guard=createCloudflareOAuthFetch({send:()=>{throw Error('network must not run');}});
  for(const url of ['https://attacker.invalid/token','http://mcp.cloudflare.com/token',`${ISSUER}/arbitrary`,`${ISSUER}/token?redirect=bad`])await assert.rejects(guard(url,{method:'POST'}));
  await assert.rejects(guard(`${ISSUER}/register`,{method:'POST',headers:{authorization:'Bearer synthetic'}}));
  let lookupDenied=false;
  const guarded=createCloudflareOAuthFetch({resolveAddress:(_host,_options,callback)=>callback(null,[{address:'127.0.0.1',family:4}]),send:(url,options,callback)=>{
    const request=new EventEmitter();request.setTimeout=()=>{};request.destroy=()=>{};request.end=()=>options.lookup(url.hostname,{},error=>{lookupDenied=!!error;request.emit('error',error);});return request;
  }});
  await assert.rejects(guarded(`${ISSUER}/.well-known/oauth-protected-resource/mcp`));assert.equal(lookupDenied,true);
});
test('OAuth DNS requests IPv4 explicitly, accepts public v4 and rejects unexpected/empty/private results without fallback',async()=>{
  for(const records of [[{address:'104.16.1.1',family:4}],[{address:'104.16.1.1',family:6}],[],[{address:'127.0.0.1',family:4}]]) {
    let lookups=0,denied=false;
    const fetcher=createCloudflareOAuthFetch({resolveAddress:(_host,options,callback)=>{
      lookups++;assert.deepEqual(options,{all:true,family:4});callback(null,records);
    },send:(url,options,onResponse)=>{
      const request=new EventEmitter();request.setTimeout=()=>{};request.destroy=()=>{};
      request.end=()=>options.lookup(url.hostname,{},error=>{
        if(error){denied=true;request.emit('error',error);return;}
        const response=new PassThrough();response.statusCode=200;response.headers={'content-type':'application/json'};
        onResponse(response);response.end(JSON.stringify({resource:RESOURCE,authorization_servers:[ISSUER]}));
      });return request;
    }});
    if(records.length===1 && records[0].family===4 && records[0].address!=='127.0.0.1')assert.equal((await fetcher(`${ISSUER}/.well-known/oauth-protected-resource/mcp`)).status,200);
    else {await assert.rejects(fetcher(`${ISSUER}/.well-known/oauth-protected-resource/mcp`));assert.equal(denied,true);}
    assert.equal(lookups,1);
  }
});
test('explicit Cloudflare read-only session requests full validated catalog, accepts expanded read grants, and discards refresh',async()=>{
  const f=fixture();f.metadata.scopes_supported.push('zone:read','dns:metadata_read','logs:monitoring','audit:report','zone:write','tokens:edit');
  const expected=readOnlyCloudflareScopes(f.metadata);
  const result=await finishAuthorization(f,url=>url,{readOnlySessionPreset:true,allowOfflineAccess:true});
  assert.equal(result.consentMode,'cloudflare-read-only-session');assert.equal(f.record().consentMode,result.consentMode);
  assert.equal(f.record().tokens.scope,expected);assert.equal(f.record().tokens.refresh_token,undefined);
  const registration=JSON.parse(f.seen.find(item=>item.path==='/register').body);
  assert.deepEqual(registration.grant_types,['authorization_code']);assert(!expected.includes('zone:write'));
  f.record().expiresAt=0;f.record().tokens.refresh_token='SYNTHETIC_UNEXPECTED';let refreshes=0;
  await assert.rejects(getCloudflareAuthorization(profile,{storePath,store:f.store,refreshFunction:async()=>{refreshes++;}}));assert.equal(refreshes,0);
});
test('Cloudflare expanded default read grant succeeds only with preset; unexpected write grant never persists',async()=>{
  for(const mode of ['minimal','readonly','write']) {
    const f=fixture();f.metadata.scopes_supported.push('zone:read','zone:write');const original=f.fetchFn;
    f.fetchFn=async(input,init)=>{const response=await original(input,init),value=await response.json();
      if(new URL(input).pathname==='/token')value.scope=mode==='write'?'user:read account:read offline_access zone:read zone:write':'user:read account:read offline_access zone:read';
      return new Response(JSON.stringify(value),{headers:{'content-type':'application/json'}});
    };
    if(mode==='readonly')assert.equal((await finishAuthorization(f,url=>url,{readOnlySessionPreset:true})).authorized,true);
    else {await assert.rejects(finishAuthorization(f,url=>url,{readOnlySessionPreset:mode==='write'}));assert.equal(f.record(),null);}
  }
});
test('read-only catalog rejects foreign metadata, invalid names/counts and unsupported bootstrap-only catalog',()=>{
  const f=fixture();
  assert.throws(()=>readOnlyCloudflareScopes(f.metadata));
  for(const change of [{issuer:'https://attacker.invalid'},{scopes_supported:['user:read','account:read','offline_access','bad scope:read']},
    {scopes_supported:Array.from({length:1025},(_,i)=>`scope${i}:read`)}])assert.throws(()=>readOnlyCloudflareScopes({...f.metadata,...change}));
});

test('actual SDK token errors expose only safe enums/status, never descriptions or authorization-code retries',async()=>{
  const hostile='SYNTHETIC_TOKEN https://private.invalid/callback?code=SECRET C:\\Private\\token.dpapi';
  for(const [error,status,reason] of [['invalid_grant',400,'invalid-grant'],['invalid_client',401,'invalid-client'],
    ['invalid_scope',400,'invalid-scope'],['access_denied',403,'access-denied'],[hostile,503,'token-http-error'],
    ['invalid_grant',200,'invalid-grant'],[hostile,200,'token-response-error']]) {
    const f=fixture(),original=f.fetchFn,warnings=[],warn=console.warn;
    f.fetchFn=async(input,init)=>{
      const response=await original(input,init);
      return new URL(input).pathname==='/token'?new Response(JSON.stringify({error,error_description:hostile,error_uri:hostile}),
        {status,headers:{'content-type':'application/json'}}):response;
    };
    console.warn=(...args)=>warnings.push(args);
    try {
      await assert.rejects(finishAuthorization(f),failure=>{
        assert.equal(failure.message,'cloudflare-authorization-not-verified');
        assert.deepEqual(authorizationFailureDiagnostic(failure),{stage:'token-exchange',reason,httpStatus:status});
        assert(!JSON.stringify(failure).includes(hostile));assert.equal(failure.cause,undefined);return true;
      });
    } finally {console.warn=warn;}
    assert.deepEqual(warnings,[]);assert.equal(f.record(),null);
    assert.equal(f.seen.filter(item=>item.path==='/token').length,1);
    assert.equal(f.seen.filter(item=>item.path==='/register').length,1);
  }
});

test('malformed token response is bounded token validation and does not enter SDK retry logging',async()=>{
  const f=fixture(),original=f.fetchFn,warnings=[],warn=console.warn;
  f.fetchFn=async(input,init)=>{
    const response=await original(input,init);
    return new URL(input).pathname==='/token'?new Response('SYNTHETIC_SECRET not JSON',
      {headers:{'content-type':'application/json'}}):response;
  };
  console.warn=(...args)=>warnings.push(args);
  try {
    await assert.rejects(finishAuthorization(f),error=>{
      assert.deepEqual(authorizationFailureDiagnostic(error),{stage:'token-exchange',reason:'token-validation',httpStatus:200});
      assert(!JSON.stringify(error).includes('SYNTHETIC_SECRET'));return true;
    });
  } finally {console.warn=warn;}
  assert.deepEqual(warnings,[]);assert.equal(f.record(),null);
  assert.equal(f.seen.filter(item=>item.path==='/token').length,1);
  assert.equal(f.seen.filter(item=>item.path==='/register').length,1);
});

test('scope, token validation, network and unknown failures remain distinct without raw exception text',async()=>{
  for(const defect of ['scope','token','network','unknown']) {
    const f=fixture(),original=f.fetchFn,hostile='Bearer SYNTHETIC_SECRET https://private.invalid/token';
    f.fetchFn=async(input,init)=>{
      if(new URL(input).pathname!=='/token')return original(input,init);
      if(defect==='network')throw Object.assign(Error(hostile),{code:'ECONNRESET'});
      if(defect==='unknown')throw Error(hostile);
      const response=await original(input,init),value=await response.json();
      if(defect==='scope')value.scope='zone:write';else value.token_type='invalid';
      return new Response(JSON.stringify(value),{headers:{'content-type':'application/json'}});
    };
    await assert.rejects(finishAuthorization(f),error=>{
      assert.equal(error.reason,({scope:'scope-validation',token:'token-validation',network:'network-error',unknown:'unknown'})[defect]);
      assert(!JSON.stringify(error).includes(hostile));assert.equal(error.cause,undefined);return true;
    });
    assert.equal(f.record(),null);
  }
});
