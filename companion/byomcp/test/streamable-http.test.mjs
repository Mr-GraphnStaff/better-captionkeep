import {test} from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {Client,StreamableHTTPClientTransport} from '@modelcontextprotocol/client';
import {secureFetch,createSdkAdapters} from '../transports.mjs';
import {contracts} from '../helper.mjs';
import {reply,inputSchema} from './fixtures/mcp-server.mjs';

const endpoint='https://synthetic.invalid/mcp';
// No socket, DNS request, external service or credential store is used here.
function wire(handler,{addresses=[{address:'8.8.8.8',family:4}]}={}) {
  const records=[];
  const fetch=secureFetch(endpoint,async()=> 'Bearer SYNTHETIC_ONLY',{
    resolve:(_host,options,callback)=>{assert.deepEqual(options,{all:true,family:4});callback(null,addresses);},
    send:(url,options,respond)=>{
      const request=new EventEmitter();
      const record={method:options.method,headers:options.headers,destroyed:false};records.push(record);
      request.setTimeout=(_milliseconds,callback)=>{record.timeout=callback;};
      request.destroy=()=>{record.destroyed=true;};
      request.end=body=>{
        record.body=body;
        options.lookup(url.hostname,{},error=>{
          if(error){request.emit('error',error);return;}
          const spec=handler(record),response=new EventEmitter();record.response=response;
          response.statusCode=spec.status ?? 200;response.headers=spec.headers ?? {'content-type':'application/json'};
          response.destroy=()=>{record.destroyed=true;};
          respond(response);
          queueMicrotask(()=>{
            if(record.destroyed)return;
            for(const chunk of spec.chunks ?? [spec.body ?? ''])response.emit('data',Buffer.from(chunk));
            if(!spec.open)response.emit('end');
          });
        });
      };
      return request;
    }
  });
  return {fetch,records};
}

test('production fetch preserves empty status responses and non-JSON protocol errors',async()=>{
  for(const [method,status] of [['POST',202],['DELETE',204],['GET',405]]) {
    const peer=wire(()=>({status,headers:{},chunks:[]}));
    const response=await peer.fetch(endpoint,{method,...(method==='POST'?{body:'{}'}:{})});
    assert.equal(response.status,status);assert.equal(await response.text(),'');
    assert.equal(peer.records[0].headers.authorization,'Bearer SYNTHETIC_ONLY');
  }
});

test('SSE chunks reach the SDK-facing reader before network end and cancel destroys the connection',async()=>{
  const peer=wire(()=>({headers:{'content-type':'text/event-stream; charset=utf-8'},chunks:['data: {','"ok":true}\n\n'],open:true}));
  const response=await peer.fetch(endpoint,{method:'POST',body:'{}'}),reader=response.body.getReader();
  const first=await reader.read();assert.equal(Buffer.from(first.value).toString(),'data: {');
  assert.equal(Buffer.from((await reader.read()).value).toString(),'"ok":true}\n\n');
  await reader.cancel();assert.equal(peer.records[0].destroyed,true);
});

test('wire rejects endpoint changes, methods, redirects, private DNS, unexpected MIME and request overflow',async()=>{
  const good=wire(()=>({body:'{}'}));
  for(const url of ['https://other.invalid/mcp',`${endpoint}?x=1`,`${endpoint}/other`])await assert.rejects(good.fetch(url,{method:'POST',body:'{}'}),/resource-changed/);
  await assert.rejects(good.fetch(endpoint,{method:'PUT',body:'{}'}),/resource-changed/);
  await assert.rejects(good.fetch(endpoint,{method:'GET',body:'{}'}),/request-limit/);
  await assert.rejects(good.fetch(endpoint,{method:'POST',body:'x'.repeat(98305)}),/request-limit/);
  const redirect=wire(()=>({status:302,headers:{location:'https://other.invalid/mcp'}}));
  await assert.rejects(redirect.fetch(endpoint,{method:'POST',body:'{}'}),/redirect-denied/);
  const privatePeer=wire(()=>({body:'{}'}),{addresses:[{address:'127.0.0.1',family:4}]});
  await assert.rejects(privatePeer.fetch(endpoint,{method:'POST',body:'{}'}),/network-failure/);
  const html=wire(()=>({headers:{'content-type':'text/html'},body:'untrusted'}));
  await assert.rejects(html.fetch(endpoint,{method:'POST',body:'{}'}),/unsupported-response/);
});

test('bounded response streams enforce total bytes, abort, premature closure and timeout',async()=>{
  const large=wire(()=>({chunks:['x'.repeat(contracts.LIMITS.resultBytes),'x']}));
  const response=await large.fetch(endpoint,{method:'POST',body:'{}'});
  await assert.rejects(response.text(),/result-limit/);assert.equal(large.records[0].destroyed,true);
  const controller=new AbortController(),peer=wire(()=>({chunks:[],open:true}));
  const stream=await peer.fetch(endpoint,{method:'POST',body:'{}',signal:controller.signal});
  controller.abort();await assert.rejects(stream.text(),/cancelled/);assert.equal(peer.records[0].destroyed,true);
  await assert.rejects(peer.fetch(endpoint,{method:'POST',body:'{}',signal:controller.signal}),/cancelled/);
  const closed=wire(()=>({chunks:[],open:true})),closedStream=await closed.fetch(endpoint,{method:'POST',body:'{}'});
  closed.records[0].response.emit('close');await assert.rejects(closedStream.text(),/network-failure/);
  const timed=wire(()=>({chunks:[],open:true})),timedStream=await timed.fetch(endpoint,{method:'POST',body:'{}'});
  timed.records[0].timeout();await assert.rejects(timedStream.text(),/timeout/);assert.equal(timed.records[0].destroyed,true);
});

test('modern production adapter discovers and lists through incremental SSE',async()=>{
  const peer=wire(record=>{
    const message=JSON.parse(record.body),data=JSON.stringify(reply(message));
    return {headers:{'content-type':'text/event-stream'},chunks:[`data: ${data.slice(0,10)}`,`${data.slice(10)}\n\n`]};
  });
  const adapters=createSdkAdapters({remoteFetchFactory:()=>peer.fetch});
  const tools=await adapters.remote.inspect({transport:'remote',resource:endpoint});
  assert.equal(tools[0].name,'synthetic_read');assert.equal(tools[0].schemaDigest,await contracts.digest({input:inputSchema,output:null}));
  assert.deepEqual(peer.records.map(record=>JSON.parse(record.body).method),['server/discover','tools/list']);
  await adapters.remote.disconnect();
});

test('SDK legacy transport uses initialize, empty202 notification, GET405, session header and DELETE204',async()=>{
  const peer=wire(record=>{
    if(record.method==='GET')return {status:405,headers:{},chunks:[]};
    if(record.method==='DELETE')return {status:204,headers:{},chunks:[]};
    const message=JSON.parse(record.body);
    if(message.method==='server/discover')return {body:JSON.stringify({jsonrpc:'2.0',id:message.id,error:{code:-32601,message:'Unsupported'}})};
    if(message.method==='notifications/initialized')return {status:202,headers:{},chunks:[]};
    if(message.method==='initialize')return {headers:{'content-type':'application/json','mcp-session-id':'synthetic-session'},body:JSON.stringify({jsonrpc:'2.0',id:message.id,result:{protocolVersion:'2025-11-25',capabilities:{tools:{}},serverInfo:{name:'synthetic-legacy',version:'1'}}})};
    return {headers:{'content-type':'text/event-stream'},body:`data: ${JSON.stringify({jsonrpc:'2.0',id:message.id,result:{tools:[{name:'synthetic_read',inputSchema}]}})}\n\n`};
  });
  const client=new Client({name:'synthetic-wire-test',version:'1'},{capabilities:{},versionNegotiation:{mode:'auto'}});
  const transport=new StreamableHTTPClientTransport(new URL(endpoint),{fetch:peer.fetch});
  try {
    await client.connect(transport);
    assert.equal((await client.listTools()).tools[0].name,'synthetic_read');
    await transport.terminateSession();
    assert(peer.records.some(record=>record.method==='GET'));
    const removed=peer.records.find(record=>record.method==='DELETE');assert.equal(removed.headers['mcp-session-id'],'synthetic-session');
  } finally {await client.close();}
  // Exercise the actual production adapter, not just a separately configured
  // SDK: a standard 2025 peer must survive the discover fallback and empty202.
  const adapters=createSdkAdapters({remoteFetchFactory:()=>peer.fetch});
  try {assert.equal((await adapters.remote.inspect({transport:'remote',resource:endpoint}))[0].name,'synthetic_read');}
  finally {await adapters.remote.disconnect();}
  assert.equal(peer.records.filter(record=>record.method==='POST' && JSON.parse(record.body).method==='initialize').length,2);
});
