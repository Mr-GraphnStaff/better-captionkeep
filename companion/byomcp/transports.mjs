import {Client, StreamableHTTPClientTransport} from '@modelcontextprotocol/client';
import {StdioClientTransport} from '@modelcontextprotocol/client/stdio';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {request} from 'node:https';
import {lookup} from 'node:dns';
import {isIP} from 'node:net';
import {contracts} from './helper.mjs';
import {compileCloudflareDns,isCloudflareDnsProfile,parseCloudflareResponse} from './cloudflare-dns.mjs';

export function publicIPv4(address) {
  if (isIP(address) !== 4) return false; // IPv6 remote support is deliberately unsupported in this prototype.
  const [a,b] = address.split('.').map(Number);
  return a > 0 && a < 224 && ![10,127].includes(a) && !(a === 169 && b === 254)
    && !(a === 172 && b >= 16 && b <= 31) && !(a === 192 && [0,168].includes(b))
    && !(a === 198 && [18,19].includes(b)) && !(a === 100 && b >= 64 && b <= 127);
}

export function secureFetch(resource, getAuthorization, {resolve = lookup, send = request} = {}) {
  const pinned = new URL(resource);
  if (pinned.protocol !== 'https:' || pinned.username || pinned.password || pinned.hash || pinned.search) throw new Error('invalid-resource');
  const literal = pinned.hostname.replace(/^\[|\]$/g, '');
  if (isIP(literal) && !publicIPv4(literal)) throw new Error('network-denied');
  return async (input, init = {}) => {
    const url = new URL(typeof input === 'string' || input instanceof URL ? input : input.url);
    if (url.href !== pinned.href || init.method !== 'POST') throw new Error('resource-changed');
    const authorization = await getAuthorization(pinned.href);
    if (typeof authorization !== 'string' || !authorization.startsWith('Bearer ') || /[\r\n]/.test(authorization)) throw new Error('authorization-unavailable');
    const headers = Object.fromEntries(new Headers(init.headers));
    headers.authorization = authorization;
    const body = typeof init.body === 'string' ? init.body : '';
    if (Buffer.byteLength(body) > 98304) throw new Error('request-limit');
    return new Promise((resolveResponse, reject) => {
      const req = send(url, {method:'POST', headers, signal:init.signal,
        lookup(hostname, options, callback) {
          // This adapter deliberately supports IPv4 only. Resolve only the
          // addresses it can actually use rather than rejecting a safe A record
          // merely because the same public host also publishes AAAA records.
          resolve(hostname, {all:true,family:4}, (error, addresses) => {
            if (error || !addresses?.length || addresses.some(item => item.family!==4 || !publicIPv4(item.address))) return callback(new Error('network-denied'));
            if (options?.all) callback(null, addresses);
            else callback(null, addresses[0].address, 4);
          });
        }}, response => {
        if (response.statusCode >= 300 && response.statusCode < 400) {response.destroy(); reject(new Error('redirect-denied')); return;}
        if (!String(response.headers['content-type']).startsWith('application/json')) {response.destroy(); reject(new Error('unsupported-response')); return;}
        const chunks = []; let size = 0;
        response.on('data', chunk => {size += chunk.length; if (size > contracts.LIMITS.resultBytes) {response.destroy(); reject(new Error('result-limit'));} else chunks.push(chunk);});
        response.on('error', () => reject(new Error('network-failure')));
        response.on('end', () => resolveResponse(new Response(Buffer.concat(chunks), {status:response.statusCode, headers:response.headers})));
      });
      req.on('error', () => reject(new Error('network-failure')));
      req.setTimeout(60000, () => req.destroy(new Error('timeout')));
      req.end(body);
    });
  };
}

export function createSdkAdapters({getAuthorization = async () => null, remoteFetchFactory = secureFetch,cloudflareActions=[]} = {}) {
  const clients = new Set();
  async function connect(profile) {
    const client = new Client({name:'captionkeep-user-owned-helper',version:'0.1.0'},
      {capabilities:{},versionNegotiation:{mode:{pin:contracts.PROTOCOL_VERSION}}});
    let transport;
    if (profile.transport === 'stdio') {
      if (!path.isAbsolute(profile.executable) || !path.isAbsolute(profile.cwd) || !Array.isArray(profile.args)
          || profile.args.some(arg => typeof arg !== 'string') || !/^[a-f0-9]{64}$/.test(profile.executableDigest)) throw new Error('invalid-executable');
      const actual = createHash('sha256').update(await readFile(profile.executable)).digest('hex');
      if (actual !== profile.executableDigest) throw new Error('executable-changed');
      transport = new StdioClientTransport({command:profile.executable,args:[...profile.args],cwd:profile.cwd,
        env:{},stderr:'ignore',maxBufferSize:contracts.LIMITS.resultBytes});
    } else {
      transport = new StreamableHTTPClientTransport(new URL(profile.resource),
        {fetch:remoteFetchFactory(profile.resource, getAuthorization)});
    }
    clients.add(client);
    try {await client.connect(transport); return client;} catch {clients.delete(client); await client.close().catch(() => {}); throw new Error('connection-failed');}
  }
  const adapter = {
    async observeCloudflareDns(profile,action,args) {
      const parameters=compileCloudflareDns(profile,action,args,'observe'),client=await connect(profile);
      try {
        const grant=profile.tools.find(tool=>tool.name==='execute' && tool.operation==='write' && tool.reviewedWrite===true);
        const {tools,nextCursor}=await client.listTools({cursor:''});
        if(nextCursor || tools.length>100 || contracts.bytes(tools)>65536) throw Error('inventory-limit');
        const tool=tools.find(item=>item.name==='execute');
        if(!tool || await contracts.digest({input:tool.inputSchema,output:tool.outputSchema || null})!==grant.schemaDigest) throw Error('schema-changed');
        return parseCloudflareResponse(await client.callTool({name:'execute',arguments:parameters},{timeout:60000}));
      } finally {clients.delete(client);await client.close();}
    },
    async observe(profile,toolName,args) {
      const grant=profile.tools.find(tool=>tool.name===toolName && tool.operation==='read' && tool.readOnly===true);
      if(!grant) throw new Error('readback-unapproved');
      const client=await connect(profile);
      try {
        const {tools,nextCursor}=await client.listTools({cursor:''});
        if(nextCursor || tools.length>100 || contracts.bytes(tools)>65536) throw new Error('inventory-limit');
        const tool=tools.find(item=>item.name===toolName);
        if(!tool || await contracts.digest({input:tool.inputSchema,output:tool.outputSchema || null})!==grant.schemaDigest) throw new Error('schema-changed');
        const result=await client.callTool({name:toolName,arguments:structuredClone(args)},{timeout:60000});
        if(result.isError || !result.structuredContent || contracts.bytes(result.structuredContent)>16384) throw new Error('readback-unavailable');
        return structuredClone(result.structuredContent);
      } finally {clients.delete(client);await client.close();}
    },
    async inspect(profile) {
      const client = await connect(profile);
      try {
        // Explicit cursor requests one bounded page; no automatic inventory aggregation.
        const {tools, nextCursor} = await client.listTools({cursor:''});
        if (nextCursor || tools.length > 100 || contracts.bytes(tools) > 65536) throw new Error('inventory-limit');
        return Promise.all(tools.map(async tool => ({name:tool.name,schemaDigest:await contracts.digest({input:tool.inputSchema,output:tool.outputSchema || null})})));
      } finally {clients.delete(client); await client.close();}
    },
    async invoke(profile, approval, signal, {assertDispatch = async () => {throw new Error('dispatch-unapproved');}} = {}) {
      if (signal?.aborted) throw new Error('cancelled');
      const client = await connect(profile);
      try {
        const grant = profile.tools.find(tool => tool.name === approval.payload.tool);
        const {tools, nextCursor} = await client.listTools({cursor:''});
        if (nextCursor || tools.length > 100 || contracts.bytes(tools) > 65536) throw new Error('inventory-limit');
        const tool = tools.find(item => item.name === grant.name);
        if (!tool || await contracts.digest({input:tool.inputSchema,output:tool.outputSchema || null}) !== grant.schemaDigest) throw new Error('schema-changed');
        if (signal?.aborted) throw new Error('cancelled');
        await assertDispatch();
        const entry=cloudflareActions.find(value=>value.profile.id===profile.id && value.profile.profileDigest===profile.profileDigest);
        const action=entry?.actions.find(value=>value.tool===grant.name);
        const cloudflare=isCloudflareDnsProfile(profile,action);
        const parameters=cloudflare?compileCloudflareDns(profile,action,approval.payload.arguments,'update'):approval.payload.arguments;
        const response = await client.callTool({name:grant.name,arguments:parameters}, {signal,timeout:60000});
        if(cloudflare) {
          const record=parseCloudflareResponse(response),args=approval.payload.arguments;
          if(record.accountId!==args.accountId || record.zoneId!==args.zoneId || record.recordId!==args.recordId) throw Error('record-identity-mismatch');
          // This response alone is not completion. The helper must separately
          // observe and verify the typed post-state before creating its receipt.
          return {version:1,jobId:approval.payload.jobId,approvalDigest:approval.approvalDigest,sessionId:approval.payload.source.sessionId,
            sourceDigest:approval.payload.source.sourceDigest,status:'received',answer:'Cloudflare returned the requested record update; see the independently verified receipt.',
            citations:approval.payload.source.captions.map(caption=>caption.key)};
        }
        if (response.isError || !response.structuredContent) throw new Error('unsupported-result');
        const raw = response.structuredContent;
        if (Object.keys(raw).sort().join('|') !== 'answer|citations|status') throw new Error('unsupported-result');
        // Bind the matched MCP response locally; raw source hashes never leave the helper.
        return {version:1,jobId:approval.payload.jobId,approvalDigest:approval.approvalDigest,
          sessionId:approval.payload.source.sessionId,sourceDigest:approval.payload.source.sourceDigest,...raw};
      } finally {clients.delete(client); await client.close();}
    },
    async disconnect() {await Promise.allSettled([...clients].map(client => client.close())); clients.clear();}
  };
  return {stdio:adapter,remote:adapter};
}
