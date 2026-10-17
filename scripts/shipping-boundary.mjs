import {readFile,readdir} from 'node:fs/promises';
import path from 'node:path';

// Deferred implementation remains in the repository, never in 6.0 extension payloads.
export const shippingBoundary = '6.0-without-mcp-v1';
export function excludedShippingPath(filename) {
  const normalized=filename.replaceAll('\\','/');
  return /(?:^|\/)byomcp[^/]*\.(?:js|css)$/i.test(normalized)
    || /(?:^|\/)evidenceAction(?:Jobs|Contracts)\.js$/i.test(normalized)
    || /(?:^|\/)companion\/byomcp(?:\/|$)/i.test(normalized)
    || /(?:^|\/)(?:better-captionkeep-byomcp-helper[^/]*|byomcp-helper-hashes\.json|BYOMCP-SBOM\.cdx\.json)$/i.test(normalized);
}
export async function shippingEntries(directory,relative='') {
  const result=new Map();
  for(const entry of await readdir(path.join(directory,relative),{withFileTypes:true})) {
    const name=relative?`${relative}/${entry.name}`:entry.name;
    if(entry.isSymbolicLink()) throw Error(`Shipping payload contains a link: ${name}`);
    if(entry.isDirectory()) for(const [key,value] of await shippingEntries(directory,name)) result.set(key,value);
    else result.set(name,await readFile(path.join(directory,name)));
  }
  return result;
}
export function assertShippingEntries(entries) {
  for(const [name,bytes] of entries) {
    if(excludedShippingPath(name)) throw Error(`Deferred MCP payload is forbidden: ${name}`);
    if(!/\.(?:js|json|html|css)$/i.test(name)) continue;
    const text=bytes.toString('utf8');
    if(/\bnativeMessaging\b|\b(?:connectNative|sendNativeMessage)\b|\bbyomcp_(?:settings|action)\b|(?:src|href)=["'][^"']*byomcp|["']byomcp[^"']*\.(?:js|css)["']/i.test(text)) {
      throw Error(`Deferred MCP capability or reference is forbidden: ${name}`);
    }
  }
  // Validate local executable dependencies, including Firefox's derived scripts.
  for(const [name,bytes] of entries) {
    if(!/\.(?:js|html|json)$/i.test(name)) continue;
    const text=bytes.toString('utf8');
    const references=[];
    if(name==='manifest.json') {
      const manifest=JSON.parse(text);
      references.push(...(manifest.background?.scripts||[]),...(manifest.background?.service_worker?[manifest.background.service_worker]:[]));
    }
    if(/\.html$/i.test(name)) for(const match of text.matchAll(/(?:src|href)=["']([^"']+\.(?:js|css))["']/g)) references.push(match[1]);
    if(/\.js$/i.test(name)) for(const call of text.matchAll(/\bimportScripts\(([\s\S]*?)\)/g)) for(const match of call[1].matchAll(/["']([^"']+\.js)["']/g)) references.push(match[1]);
    for(const reference of references) {
      if(/^(?:[a-z]+:|\/\/)/i.test(reference)) continue;
      const resolved=path.posix.normalize(path.posix.join(path.posix.dirname(name),reference));
      if(!entries.has(resolved)) throw Error(`Shipping dependency is missing: ${name} -> ${reference}`);
    }
  }
}
export async function assertShippingDirectory(directory) {assertShippingEntries(await shippingEntries(directory));}
