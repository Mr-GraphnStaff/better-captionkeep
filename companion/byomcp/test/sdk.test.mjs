import {test} from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {readFile} from 'node:fs/promises';
import {createHash,randomUUID} from 'node:crypto';
import {createSdkAdapters} from '../transports.mjs';
import {contracts,createHelper} from '../helper.mjs';
import {inputSchema,reply} from './fixtures/mcp-server.mjs';

for(const transport of ['stdio','remote']) test(`official SDK pinned modern ${transport} discovers and calls a synthetic MCP peer`,{timeout:15000},async()=>{
  const profile={id:'sdk-fixture',revision:1,transport,profileDigest:'a'.repeat(64),tools:[{name:'synthetic_read',operation:'read',readOnly:true,
    schemaDigest:await contracts.digest({input:inputSchema,output:null})}]};
  if(transport==='stdio') Object.assign(profile,{executable:process.execPath,cwd:path.dirname(fileURLToPath(import.meta.url)),
    args:[fileURLToPath(new URL('./fixtures/mcp-server.mjs',import.meta.url)),'--serve'],
    executableDigest:createHash('sha256').update(await readFile(process.execPath)).digest('hex')});
  else profile.resource='https://synthetic.invalid/mcp';
  const seen=[];
  const adapters=createSdkAdapters({remoteFetchFactory:()=>async(_url,options)=>{
    const message=JSON.parse(options.body);seen.push(message.method);
    return new Response(JSON.stringify(reply(message)),{headers:{'content-type':'application/json'}});
  }});
  const inventory=await adapters[transport].inspect(profile);assert.equal(inventory[0].schemaDigest,profile.tools[0].schemaDigest);
  const approval=await contracts.sealApproval({jobId:randomUUID(),connection:{id:profile.id,revision:profile.revision,transport,profileDigest:profile.profileDigest,tools:profile.tools},
    tool:'synthetic_read',operation:'read',arguments:{query:'synthetic selected words'},privacyMode:'scrubbed',
    source:{sessionId:randomUUID(),sourceDigest:'c'.repeat(64),revision:'1',captions:[{key:'source',evidenceId:'C0001',text:'synthetic',observedAt:new Date().toISOString()}]},
    createdAt:new Date().toISOString(),expiresAt:new Date(Date.now()+60000).toISOString()});
  const result=await adapters[transport].invoke(profile,approval,new AbortController().signal,{assertDispatch:async()=>true});
  assert.equal(contracts.validateResult(approval,result).answer,'Synthetic SDK reply');
  if(transport==='remote') assert(seen.includes('server/discover') && seen.includes('tools/call'));
  const callCount=seen.filter(method=>method==='tools/call').length;
  await assert.rejects(adapters[transport].invoke(profile,approval,new AbortController().signal,
    {assertDispatch:async()=>{throw Error('approval-expired-after-discovery');}}),/expired-after/);
  if(transport==='remote') assert.equal(seen.filter(method=>method==='tools/call').length,callCount);
  let denied=false,authorizations=0;
  const helper=createHelper({caller:'synthetic',allowedCallers:['synthetic'],enrollmentId:'synthetic',profiles:[profile],adapters,
    readPolicy:async()=>({disabled:denied}),verifyConsent:async()=>true,availableBytes:async()=>64*1024*1024,
    authorizeOperation:async()=>{if(++authorizations===3) denied=true;return true;}});
  const stopped=await helper.handle({version:1,requestId:randomUUID(),enrollmentId:'synthetic',operation:'invoke',profileId:profile.id,approval});
  assert.equal(authorizations,3);assert.equal(stopped.state,'outcome-unknown');assert.equal(stopped.result,null);
  if(transport==='remote') assert.equal(seen.filter(method=>method==='tools/call').length,callCount);
  await adapters[transport].disconnect();
});
