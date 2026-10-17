// Synthetic, read-only MCP peer. No secrets, network, files or external actions.
import {createInterface} from 'node:readline';
export const inputSchema = {type:'object',properties:{query:{type:'string'}},required:['query'],additionalProperties:false};
export function reply(message) {
  let result;
  if (message.method === 'server/discover') result={supportedVersions:['2026-07-28'],capabilities:{tools:{}},_meta:{'io.modelcontextprotocol/serverInfo':{name:'synthetic-peer',version:'1'}}};
  else if (message.method === 'tools/list') result={tools:[{name:'synthetic_read',inputSchema}],ttlMs:0,cacheScope:'private'};
  else if (message.method === 'tools/call') {
    result={content:[],structuredContent:{status:'received',answer:'Synthetic SDK reply',citations:['source']}};
  } else return {jsonrpc:'2.0',id:message.id,error:{code:-32601,message:'Unsupported'}};
  if(message.method !== 'server/discover') result.resultType='complete';
  return {jsonrpc:'2.0',id:message.id,result};
}
if (process.argv.includes('--serve')) createInterface({input:process.stdin}).on('line',line=>{
  const message=JSON.parse(line);if(message.id!==undefined) process.stdout.write(JSON.stringify(reply(message))+'\n');
});
