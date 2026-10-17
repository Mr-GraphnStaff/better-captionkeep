import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {operationAllowed}=require('../../teams-captions-saver/byomcpRuntimeAdapter.js');
export const CLOUDFLARE_RESOURCE='https://mcp.cloudflare.com/mcp';

export function isCloudflareDnsProfile(profile,action) {
  return profile?.transport==='remote' && profile.resource===CLOUDFLARE_RESOURCE
    && action?.kind==='dns-change' && action.tool==='execute'
    && profile.tools?.some(tool=>tool.name==='execute' && tool.operation==='write' && tool.reviewedWrite===true);
}
// This is a finite compiler, not a code execution input. The only interpolated
// source is a JSON literal produced from strictly validated typed action args.
// There is no user code/URL/path, account discovery or arbitrary endpoint option.
export function compileCloudflareDns(profile,action,args,mode) {
  if(!isCloudflareDnsProfile(profile,action) || !operationAllowed(action,args) || !['observe','update'].includes(mode)) throw Error('cloudflare-action-denied');
  const values={accountId:args.accountId,zoneId:args.zoneId,recordId:args.recordId,recordType:args.recordType,recordName:args.recordName,
    ...(mode==='update'?{expectedCurrentValue:args.expectedCurrentValue,proposedValue:args.proposedValue,ttl:args.ttl,proxied:args.proxied}:{})};
  const code=`async () => {
    const a = ${JSON.stringify(values)};
    const zone = await cloudflare.request({method:"GET",path:"/zones/" + a.zoneId});
    if (zone.success !== true || zone.result?.id !== a.zoneId || zone.result?.account?.id !== a.accountId) throw new Error("account-zone-mismatch");
    const target = "/zones/" + a.zoneId + "/dns_records/" + a.recordId;
    const current = await cloudflare.request({method:"GET",path:target});
    if (current.success !== true || current.result?.id !== a.recordId || current.result?.type !== a.recordType || current.result?.name !== a.recordName) throw new Error("record-identity-mismatch");
    ${mode==='update'?`if (current.result.content !== a.expectedCurrentValue) throw new Error("record-precondition-changed");
    const changed = await cloudflare.request({method:"PATCH",path:target,body:{content:a.proposedValue,ttl:a.ttl,proxied:a.proxied}});
    if (changed.success !== true || changed.result?.id !== a.recordId) throw new Error("record-update-unverified");
    const record = changed.result;`:'const record = current.result;'}
    return {accountId:a.accountId,zoneId:a.zoneId,recordId:record.id,type:record.type,name:record.name,content:record.content,ttl:record.ttl,proxied:record.proxied};
  }`;
  return Object.freeze({code,account_id:args.accountId});
}
export function parseCloudflareResponse(response) {
  if(response?.isError || !Array.isArray(response?.content) || response.content.length!==1
      || response.content[0]?.type!=='text' || typeof response.content[0].text!=='string'
      || Buffer.byteLength(response.content[0].text)>16384 || response.content[0].text.includes('--- TRUNCATED ---')) throw Error('cloudflare-result-unavailable');
  let result;try {result=JSON.parse(response.content[0].text);} catch {throw Error('cloudflare-result-invalid');}
  if(!result || Object.keys(result).sort().join('|')!=='accountId|content|name|proxied|recordId|ttl|type|zoneId'
      || !['accountId','zoneId','recordId'].every(key=>/^[a-f0-9]{32}$/.test(result[key]))
      || !['A','AAAA','CNAME','TXT'].includes(result.type) || typeof result.name!=='string' || result.name.length>253
      || typeof result.content!=='string' || result.content.length>4096 || !Number.isSafeInteger(result.ttl) || result.ttl<1
      || typeof result.proxied!=='boolean') throw Error('cloudflare-result-invalid');
  return result;
}
