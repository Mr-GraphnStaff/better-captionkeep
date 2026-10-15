import {auth,refreshAuthorization} from '@modelcontextprotocol/client';
import {randomBytes,timingSafeEqual} from 'node:crypto';
import {createServer} from 'node:http';
import {request as httpsRequest} from 'node:https';
import {lookup} from 'node:dns';
import {isIP} from 'node:net';
import {spawn} from 'node:child_process';
import path from 'node:path';

export const ISSUER='https://mcp.cloudflare.com';
export const RESOURCE=`${ISSUER}/mcp`;
const SCOPES='user:read account:read';
const ID=/^[a-zA-Z0-9._-]{1,100}$/;
const GET_PATHS=new Set(['/.well-known/oauth-protected-resource/mcp','/.well-known/oauth-protected-resource','/.well-known/oauth-authorization-server','/.well-known/openid-configuration']);
const MAX_BYTES=65536;
const sanitized=()=>new Error('cloudflare-authorization-not-verified');
const sameSecret=(left,right)=>typeof left==='string' && typeof right==='string' && left.length===right.length
  && Buffer.byteLength(left)===Buffer.byteLength(right) && timingSafeEqual(Buffer.from(left),Buffer.from(right));

// The script is constant; secrets/configuration arrive ONLY on stdin, never
// through command interpolation, argv, a URL, diagnostics or browser storage.
export const DPAPI_SCRIPT=String.raw`
$ErrorActionPreference='Stop'; $ProgressPreference='SilentlyContinue'
try {
  Add-Type -AssemblyName System.Security
  $r=[Console]::In.ReadToEnd() | ConvertFrom-Json
  $p=[IO.Path]::GetFullPath([string]$r.path); $parent=[IO.Path]::GetDirectoryName($p)
  $sid=[Security.Principal.WindowsIdentity]::GetCurrent().User
  $walk=[IO.DirectoryInfo]::new($parent)
  while($null -ne $walk) { if ($walk.Exists -and ($walk.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) { throw 'unsafe' }; $walk=$walk.Parent }
  function Assert-Private($target) {
    $item=if ([IO.Directory]::Exists($target)) { [IO.DirectoryInfo]::new($target) } else { [IO.FileInfo]::new($target) }
    if (($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) { throw 'unsafe' }
    $acl=$item.GetAccessControl()
    if ($acl.GetOwner([Security.Principal.SecurityIdentifier]).Value -ne $sid.Value -or -not $acl.AreAccessRulesProtected) { throw 'unsafe' }
    foreach($rule in $acl.GetAccessRules($true,$true,[Security.Principal.SecurityIdentifier])) {
      if ($rule.AccessControlType -eq 'Allow' -and $rule.IdentityReference.Value -notin @($sid.Value,'S-1-5-18')) { throw 'unsafe' }
    }
  }
  if (-not [IO.Directory]::Exists($parent)) {
    if ($r.operation -ne 'write') { [Console]::Out.Write('null'); exit 0 }
    $ancestor=[IO.Directory]::GetParent($parent)
    if ($null -eq $ancestor -or -not $ancestor.Exists) { throw 'unsafe' }
    $walk=$ancestor
    while($null -ne $walk) { if (($walk.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) { throw 'unsafe' }; $walk=$walk.Parent }
    $acl=New-Object Security.AccessControl.DirectorySecurity
    $acl.SetOwner($sid); $acl.SetAccessRuleProtection($true,$false)
    $rule=New-Object Security.AccessControl.FileSystemAccessRule($sid,'FullControl','ContainerInherit,ObjectInherit','None','Allow')
    $acl.AddAccessRule($rule); [IO.Directory]::CreateDirectory($parent,$acl) | Out-Null
  }
  Assert-Private $parent
  if ($r.operation -eq 'read') {
    if (-not [IO.File]::Exists($p)) { [Console]::Out.Write('null'); exit 0 }
    Assert-Private $p
    if ([IO.FileInfo]::new($p).Length -gt 131072) { throw 'limit' }
    $bytes=[IO.File]::ReadAllBytes($p)
    $plain=[Security.Cryptography.ProtectedData]::Unprotect($bytes,$null,[Security.Cryptography.DataProtectionScope]::CurrentUser)
    [Console]::Out.Write([Text.Encoding]::UTF8.GetString($plain)); [Array]::Clear($plain,0,$plain.Length)
  } elseif ($r.operation -eq 'write') {
    if ([IO.File]::Exists($p)) { Assert-Private $p }
    $plain=[Text.Encoding]::UTF8.GetBytes([string]$r.value)
    $bytes=[Security.Cryptography.ProtectedData]::Protect($plain,$null,[Security.Cryptography.DataProtectionScope]::CurrentUser)
    [Array]::Clear($plain,0,$plain.Length)
    $tmp=$p+'.'+[Guid]::NewGuid().ToString('N')+'.partial'
    try {
      $acl=New-Object Security.AccessControl.FileSecurity
      $acl.SetOwner($sid); $acl.SetAccessRuleProtection($true,$false)
      $acl.AddAccessRule((New-Object Security.AccessControl.FileSystemAccessRule($sid,'FullControl','Allow')))
      $f=[IO.FileStream]::new($tmp,[IO.FileMode]::CreateNew,[Security.AccessControl.FileSystemRights]::Write,[IO.FileShare]::None,4096,[IO.FileOptions]::WriteThrough,$acl)
      try { $f.Write($bytes,0,$bytes.Length); $f.Flush($true) } finally { $f.Dispose() }
      Assert-Private $parent
      # Windows PowerShell coerces $null to an empty string for this .NET
      # string parameter; NullString preserves a true null backup filename.
      if ([IO.File]::Exists($p)) { Assert-Private $p; [IO.File]::Replace($tmp,$p,[NullString]::Value) } else { [IO.File]::Move($tmp,$p) }
      Assert-Private $p; [Console]::Out.Write('true')
    } finally { if ([IO.File]::Exists($tmp)) { [IO.File]::Delete($tmp) } }
  } else { throw 'operation' }
} catch { [Console]::Error.Write('Private credential storage unavailable.'); exit 1 }
`;

function validateStorePath(filename) {
  if(typeof filename!=='string' || !/^[a-zA-Z]:[\\/]/.test(filename) || !path.win32.isAbsolute(filename)
      || /[\u0000-\u001f\u007f]/.test(filename) || filename.includes('..') || filename.length>1024
      || filename.slice(2).includes(':')
      || path.win32.dirname(filename)===path.win32.parse(filename).root || !/\.dpapi$/i.test(filename)) throw sanitized();
  return path.win32.normalize(filename);
}
export function createWindowsCredentialStore({storePath,platform=process.platform,spawnProcess=spawn,systemRoot=process.env.SystemRoot}={}) {
  const filename=validateStorePath(storePath);
  if(platform!=='win32' || !/^[a-zA-Z]:[\\/]/.test(systemRoot || '')) throw sanitized();
  const executable=path.win32.join(systemRoot,'System32','WindowsPowerShell','v1.0','powershell.exe');
  async function operate(operation,value) {
    const input=JSON.stringify({operation,path:filename,...(operation==='write'?{value:JSON.stringify(value)}:{})});
    if(Buffer.byteLength(input)>MAX_BYTES) throw sanitized();
    return new Promise((resolve,reject)=>{
      const child=spawnProcess(executable,['-NoLogo','-NoProfile','-NonInteractive','-Command',DPAPI_SCRIPT],{windowsHide:true,stdio:['pipe','pipe','pipe']});
      const chunks=[];let bytes=0,failed=false;
      const timer=setTimeout(()=>{failed=true;child.kill();reject(sanitized());},15000);
      child.stdout.on('data',chunk=>{bytes+=chunk.length;if(bytes>MAX_BYTES){failed=true;child.kill();}else chunks.push(chunk);});
      child.stderr.on('data',()=>{}); // Never forward upstream/OS diagnostics or secrets.
      child.on('error',()=>{failed=true;clearTimeout(timer);reject(sanitized());});
      child.on('close',code=>{clearTimeout(timer);if(failed || code!==0)return reject(sanitized());try{resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));}catch{reject(sanitized());}});
      child.stdin.on('error',()=>{});child.stdin.end(input);
    });
  }
  return Object.freeze({read:()=>operate('read'),write:value=>operate('write',value)});
}

function publicAddress(address) {
  if(isIP(address)!==4)return false;
  const [a,b]=address.split('.').map(Number);
  return a>0 && a<224 && ![10,127].includes(a) && !(a===169 && b===254) && !(a===172 && b>=16 && b<=31)
    && !(a===192 && [0,168].includes(b)) && !(a===198 && [18,19].includes(b)) && !(a===100 && b>=64 && b<=127);
}
function checkMetadata(url,value) {
  if(url.pathname.includes('oauth-protected-resource')) {
    if(value.resource!==RESOURCE || !Array.isArray(value.authorization_servers) || value.authorization_servers.length!==1 || value.authorization_servers[0]!==ISSUER) throw sanitized();
  } else if(GET_PATHS.has(url.pathname)) {
    if(value.issuer!==ISSUER || value.authorization_endpoint!==`${ISSUER}/authorize` || value.token_endpoint!==`${ISSUER}/token`
        || value.registration_endpoint!==`${ISSUER}/register` || !value.code_challenge_methods_supported?.includes('S256')) throw sanitized();
  }
}
export function createCloudflareOAuthFetch({send=httpsRequest,resolveAddress=lookup,signal,allowRegistration=true}={}) {
  return async(input,init={})=>{
    const url=new URL(typeof input==='string'||input instanceof URL?input:input.url),method=init.method || 'GET';
    if(url.origin!==ISSUER || url.username || url.password || url.search || url.hash
        || !(method==='GET' && GET_PATHS.has(url.pathname) || method==='POST' && (url.pathname==='/token' || allowRegistration && url.pathname==='/register'))) throw sanitized();
    const headers=Object.fromEntries(new Headers(init.headers));
    if(headers.authorization && url.pathname!=='/token') throw sanitized();
    const body=typeof init.body==='string'?init.body:init.body instanceof URLSearchParams?init.body.toString():'';
    if(Buffer.byteLength(body)>16384) throw sanitized();
    return new Promise((resolve,reject)=>{
      const req=send(url,{method,headers,signal:signal || init.signal,lookup(hostname,options,callback){
        resolveAddress(hostname,{all:true,family:4},(error,addresses)=>{
          if(error || !addresses?.length || addresses.some(item=>item.family!==4 || !publicAddress(item.address)))return callback(sanitized());
          callback(null,...(options?.all?[addresses]:[addresses[0].address,4]));
        });
      }},response=>{
        const chunks=[];let bytes=0;
        if(response.statusCode>=300 && response.statusCode<400 || !String(response.headers['content-type']).startsWith('application/json')) {response.destroy();reject(sanitized());return;}
        response.on('data',chunk=>{bytes+=chunk.length;if(bytes>MAX_BYTES){response.destroy();reject(sanitized());}else chunks.push(chunk);});
        response.on('error',()=>reject(sanitized()));response.on('end',()=>{
          try {const bytes=Buffer.concat(chunks),value=JSON.parse(bytes.toString('utf8'));if(response.statusCode===200 && method==='GET')checkMetadata(url,value);
            resolve(new Response(bytes,{status:response.statusCode,headers:response.headers}));} catch {reject(sanitized());}
        });
      });
      req.setTimeout(15000,()=>req.destroy(sanitized()));req.on('error',()=>reject(sanitized()));req.end(body);
    });
  };
}
function binding(credentialReference,profileId) {
  if(!ID.test(credentialReference || '') || !ID.test(profileId || ''))throw sanitized();
  return {version:1,issuer:ISSUER,resource:RESOURCE,credentialReference,profileId};
}
function tokenValue(tokens) {
  if(!tokens || tokens.issuer!==ISSUER || tokens.token_type?.toLowerCase()!=='bearer'
      || typeof tokens.access_token!=='string' || !tokens.access_token || tokens.access_token.length>16384 || /[\r\n]/.test(tokens.access_token))throw sanitized();
  return tokens.access_token;
}
function checkedScope(value,allowed,limit=2048) {
  const scope=value===undefined?allowed:value;
  if(typeof scope!=='string' || scope.length>limit || !/^[a-zA-Z0-9:._/ -]*$/.test(scope))throw sanitized();
  const permitted=new Set(allowed.split(/\s+/).filter(Boolean)),parts=[...new Set(scope.split(/\s+/).filter(Boolean))];
  if(parts.some(part=>!permitted.has(part)))throw sanitized();return parts.join(' ');
}
export function readOnlyCloudflareScopes(metadata) {
  checkMetadata(new URL(`${ISSUER}/.well-known/oauth-authorization-server`),metadata);
  const scopes=metadata.scopes_supported,required=['user:read','account:read','offline_access'];
  if(!Array.isArray(scopes) || !scopes.length || scopes.length>1024 || new Set(scopes).size!==scopes.length
      || scopes.some(scope=>typeof scope!=='string' || scope.length>160 || !/^[a-zA-Z0-9:._/-]+$/.test(scope))
      || required.some(scope=>!scopes.includes(scope)))throw sanitized();
  const selected=scopes.filter(scope=>required.includes(scope) || ['read','metadata_read','monitoring','report'].includes(scope.split(/[:.]/).at(-1)));
  const value=selected.join(' ');
  if(selected.length<=required.length || value.length>16384)throw sanitized();
  return value;
}
function validRecord(record,expected) {
  return record && Object.keys(expected).every(key=>record[key]===expected[key]) && record.clientInformation?.issuer===ISSUER
    && typeof record.clientInformation.client_id==='string' && record.clientInformation.client_id.length>0 && Number.isFinite(record.expiresAt);
}

export async function authorizeCloudflare({storePath,credentialReference,profileId=credentialReference,onAuthorizationUrl,signal,timeoutMs=300000,
  store,fetchFn,now=()=>Date.now(),authFunction=auth,serverFactory=createServer,allowOfflineAccess=false,readOnlySessionPreset=false}={}) {
  validateStorePath(storePath);const expected=binding(credentialReference,profileId);
  if(typeof onAuthorizationUrl!=='function' || typeof allowOfflineAccess!=='boolean' || typeof readOnlySessionPreset!=='boolean' || signal?.aborted)throw sanitized();
  const vault=store || createWindowsCredentialStore({storePath}),controller=new AbortController();
  const fetcher=fetchFn || createCloudflareOAuthFetch({signal:controller.signal});
  let requestedScopes=allowOfflineAccess ? `${SCOPES} offline_access` : SCOPES;
  let discovery,clientInformation,tokens,verifier,redirectUrl,consumed=false,expiresAt;
  let phase='initialization';
  const state=randomBytes(32).toString('hex');
  const guarded=promise=>Promise.race([promise,new Promise((_,reject)=>{
    if(controller.signal.aborted)reject(sanitized());
    else controller.signal.addEventListener('abort',()=>reject(sanitized()),{once:true});
  })]);
  let complete,fail;
  const callback=new Promise((resolve,reject)=>{complete=resolve;fail=reject;});callback.catch(()=>{});
  const server=serverFactory((request,response)=>{
    try {
      if(consumed || request.method!=='GET' || request.url.length>8192 || request.headers.host!==new URL(redirectUrl).host)throw sanitized();
      const url=new URL(request.url,redirectUrl);
      if(url.origin!==new URL(redirectUrl).origin || url.username || url.password || url.hash || url.pathname!=='/callback'
          || url.searchParams.getAll('state').length!==1 || !sameSecret(url.searchParams.get('state'),state)
          || url.searchParams.getAll('code').length!==1 || !url.searchParams.get('code') || url.searchParams.get('code').length>4096
          || url.searchParams.has('error') || url.searchParams.getAll('iss').length>1 || url.searchParams.has('iss') && url.searchParams.get('iss')!==ISSUER)throw sanitized();
      consumed=true;response.writeHead(200,{'Content-Type':'text/plain','Cache-Control':'no-store','Content-Security-Policy':"default-src 'none'"});
      response.end('Authorization received. You can close this window.');complete({code:url.searchParams.get('code'),iss:url.searchParams.get('iss') || undefined});
    } catch {response.writeHead(400,{'Content-Type':'text/plain','Cache-Control':'no-store'});response.end('Authorization callback rejected.');fail(sanitized());}
  });
  const abort=()=>{phase='authorization-expired';controller.abort();fail(sanitized());server.close();};
  const timer=setTimeout(abort,Math.max(1,Math.min(timeoutMs,300000)));signal?.addEventListener('abort',abort,{once:true});
  try {
    if(readOnlySessionPreset) {
      phase='read-only-catalog';
      const response=await guarded(fetcher(`${ISSUER}/.well-known/oauth-authorization-server`));
      if(!response.ok)throw sanitized();requestedScopes=readOnlyCloudflareScopes(await response.json());
    }
    await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
    redirectUrl=`http://127.0.0.1:${server.address().port}/callback`;
    const provider={redirectUrl,clientMetadata:{client_name:'Better CaptionKeep user-owned helper',redirect_uris:[redirectUrl],
      grant_types:allowOfflineAccess && !readOnlySessionPreset?['authorization_code','refresh_token']:['authorization_code'],response_types:['code'],token_endpoint_auth_method:'none'},
      state:()=>state,clientInformation:()=>clientInformation,saveClientInformation:value=>{if(value.issuer!==ISSUER)throw sanitized();clientInformation=structuredClone(value);},
      tokens:()=>tokens,saveTokens:value=>{tokenValue(value);tokens={...structuredClone(value),scope:checkedScope(value.scope,requestedScopes,readOnlySessionPreset?16384:2048)};
        if(!allowOfflineAccess || readOnlySessionPreset)delete tokens.refresh_token;
        expiresAt=now()+Math.min(86400,Number(value.expires_in || 0))*1000;},
      saveCodeVerifier:value=>{verifier=value;},codeVerifier:()=>verifier,
      saveDiscoveryState:value=>{checkMetadata(new URL(`${ISSUER}/.well-known/oauth-authorization-server`),value.authorizationServerMetadata);
        if(value.authorizationServerUrl!==ISSUER || value.resourceMetadata?.resource!==RESOURCE
            || allowOfflineAccess && !value.authorizationServerMetadata.scopes_supported?.includes('offline_access'))throw sanitized();discovery=structuredClone(value);},discoveryState:()=>discovery,
      validateResourceURL:(_server,resource)=>{if(String(resource)!==RESOURCE)throw sanitized();return new URL(RESOURCE);},
      redirectToAuthorization:async url=>{
        if(controller.signal.aborted || url.origin!==ISSUER || url.pathname!=='/authorize' || url.searchParams.get('state')!==state || url.searchParams.get('code_challenge_method')!=='S256'
            || url.searchParams.get('redirect_uri')!==redirectUrl || url.searchParams.get('resource')!==RESOURCE || url.searchParams.get('scope')!==requestedScopes)throw sanitized();
        phase='awaiting-callback';await onAuthorizationUrl(url.href);
      }};
    if(await guarded(authFunction(provider,{serverUrl:RESOURCE,resourceMetadataUrl:new URL(`${ISSUER}/.well-known/oauth-protected-resource/mcp`),scope:requestedScopes,forceReauthorization:true,fetchFn:fetcher}))!=='REDIRECT')throw sanitized();
    const result=await callback;
    if(controller.signal.aborted || !consumed)throw sanitized();
    phase='token-exchange';
    if(await guarded(authFunction(provider,{serverUrl:RESOURCE,authorizationCode:result.code,iss:result.iss,scope:requestedScopes,fetchFn:fetcher}))!=='AUTHORIZED'
        || controller.signal.aborted || !tokens || !Number.isFinite(expiresAt) || expiresAt<=now())throw sanitized();
    const consentMode=readOnlySessionPreset?'cloudflare-read-only-session':allowOfflineAccess?'explicit-offline-access':'minimal-session';
    phase='private-storage';await vault.write({...expected,clientInformation,tokens,expiresAt,consentMode});
    return {authorized:true,issuer:ISSUER,resource:RESOURCE,credentialReference,profileId,expiresAt,consentMode};
  } catch {const error=sanitized();error.stage=phase;throw error;}
  finally {clearTimeout(timer);signal?.removeEventListener('abort',abort);controller.abort();server.close();verifier=undefined;tokens=undefined;}
}

export async function getCloudflareAuthorization(profile,{storePath,store,fetchFn,now=()=>Date.now(),refreshFunction=refreshAuthorization}={}) {
  validateStorePath(storePath);
  if(profile?.transport!=='remote' || profile.resource!==RESOURCE)throw sanitized();
  const expected=binding(profile.credentialReference,profile.id),vault=store || createWindowsCredentialStore({storePath});
  try {
    const record=await vault.read();if(!validRecord(record,expected))throw sanitized();
    const current=tokenValue(record.tokens);
    if(record.expiresAt>now()+30000)return `Bearer ${current}`;
    if(record.consentMode==='cloudflare-read-only-session')throw sanitized();
    if(typeof record.tokens.refresh_token!=='string' || !record.tokens.refresh_token || record.tokens.refresh_token.length>16384)throw sanitized();
    // Refresh only. This never calls auth(), DCR, browser callbacks, or consent.
    const refreshed=await refreshFunction(ISSUER,{metadata:{issuer:ISSUER,token_endpoint:`${ISSUER}/token`,token_endpoint_auth_methods_supported:['none']},
      clientInformation:record.clientInformation,refreshToken:record.tokens.refresh_token,resource:RESOURCE,
      fetchFn:fetchFn || createCloudflareOAuthFetch({allowRegistration:false})});
    const tokens={...refreshed,refresh_token:refreshed.refresh_token || record.tokens.refresh_token,
      scope:checkedScope(refreshed.scope,record.tokens.scope || ''),issuer:ISSUER};
    tokenValue(tokens);
    const expiresAt=now()+Math.min(86400,Number(tokens.expires_in || 0))*1000;
    if(!Number.isFinite(expiresAt) || expiresAt<=now())throw sanitized();
    await vault.write({...record,tokens,expiresAt});return `Bearer ${tokens.access_token}`;
  } catch {throw sanitized();}
}
