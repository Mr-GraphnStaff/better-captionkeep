import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createProfileAuthorization} from '../cli.mjs';
import {createSdkAdapters} from '../transports.mjs';
import {contracts} from '../helper.mjs';
import {RESOURCE} from '../cloudflare-oauth.mjs';
import {reply} from './fixtures/mcp-server.mjs';

async function profile(id,resource='https://synthetic.invalid/mcp') {
  const value={id,label:id,revision:1,transport:'remote',resource,
    credentialReference:`TOKEN_${id}`,toolAccess:'catalog',tools:[]};
  return {...value,profileDigest:await contracts.digest(value)};
}
function identity(value) {return {id:value.id,revision:value.revision,profileDigest:value.profileDigest};}

test('two enrolled accounts at one resource select distinct credentials regardless of order',async()=>{
  const first=await profile('first'),second=await profile('second');
  for(const profiles of [[first,second],[second,first]]) {
    const authorize=createProfileAuthorization(profiles,{env:{TOKEN_first:'SYNTHETIC_FIRST',TOKEN_second:'SYNTHETIC_SECOND'}});
    assert.equal(await authorize(first.resource,identity(first)),'Bearer SYNTHETIC_FIRST');
    assert.equal(await authorize(second.resource,identity(second)),'Bearer SYNTHETIC_SECOND');
    assert.equal(await authorize(first.resource),null);
  }
});

test('unknown, stale, tampered and duplicate profile bindings fail closed without credential fallback',async()=>{
  const first=await profile('first'),second=await profile('second');
  let reads=0;
  const env=new Proxy({},{get(){reads++;return 'SYNTHETIC';}});
  const authorize=createProfileAuthorization([first,second],{env});
  for(const binding of [{...identity(first),id:'unknown'},{...identity(first),revision:2},
    {...identity(first),profileDigest:'f'.repeat(64)},null]) {
    assert.equal(await authorize(first.resource,binding),null);
  }
  assert.equal(await authorize('https://other.invalid/mcp',identity(first)),null);
  assert.equal(await createProfileAuthorization([first,first],{env})(first.resource,identity(first)),null);
  assert.equal(await createProfileAuthorization([{...first,credentialReference:'OTHER'}],{env})(first.resource,identity(first)),null);
  assert.equal(reads,0);
});

test('Cloudflare OAuth receives selected profile identity, never first matching resource',async()=>{
  const first=await profile('first',RESOURCE),second=await profile('second',RESOURCE),seen=[];
  const authorize=createProfileAuthorization([first,second],{oauthStorePath:'synthetic-unused',
    cloudflareAuthorization:async(value)=>{seen.push(identity(value));return `Bearer SYNTHETIC_${value.id}`;}});
  assert.equal(await authorize(RESOURCE,identity(second)),'Bearer SYNTHETIC_second');
  assert.equal(await authorize(RESOURCE,identity(first)),'Bearer SYNTHETIC_first');
  assert.deepEqual(seen,[identity(second),identity(first)]);
});

test('configured snapshot cannot be retargeted after resolver creation',async()=>{
  const first=await profile('first'),original=structuredClone(first);
  const authorize=createProfileAuthorization([first],{env:{TOKEN_first:'SYNTHETIC_FIRST',OTHER:'SYNTHETIC_OTHER'}});
  first.credentialReference='OTHER';first.id='other';
  assert.equal(await authorize(original.resource,identity(original)),'Bearer SYNTHETIC_FIRST');
  assert.equal(await authorize(original.resource,identity(first)),null);
});

test('SDK remote connections bind every authorization callback to selected account',async()=>{
  const first=await profile('first'),second=await profile('second'),seen=[];
  const authorize=createProfileAuthorization([first,second],{env:{TOKEN_first:'SYNTHETIC_FIRST',TOKEN_second:'SYNTHETIC_SECOND'}});
  const adapters=createSdkAdapters({getAuthorization:authorize,remoteFetchFactory:(resource,getAuthorization)=>async(_url,init)=>{
    seen.push(await getAuthorization(resource));
    return new Response(JSON.stringify(reply(JSON.parse(init.body))),{headers:{'content-type':'application/json'}});
  }});
  try {
    await adapters.remote.inspect(second);
    assert(seen.length>0);assert(seen.every(value=>value==='Bearer SYNTHETIC_SECOND'));
    seen.length=0;
    await adapters.remote.inspect(first);
    assert(seen.length>0);assert(seen.every(value=>value==='Bearer SYNTHETIC_FIRST'));
  } finally {await adapters.remote.disconnect();}
});
