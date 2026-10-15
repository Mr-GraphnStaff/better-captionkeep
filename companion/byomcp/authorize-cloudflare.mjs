import {spawn} from 'node:child_process';
import {stat} from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {loadConfiguration} from './cli.mjs';
import {authorizeCloudflare,authorizationFailureDiagnostic,RESOURCE} from './cloudflare-oauth.mjs';

export function signInFailureMessage(error) {
  const {stage,reason,httpStatus}=authorizationFailureDiagnostic(error);
  return `Cloudflare sign-in could not be verified (${stage}; ${reason}${httpStatus===undefined?'':`; HTTP ${httpStatus}`}). No authenticated connection is claimed.\n`;
}

// Explicit interactive setup only. Native invocation never calls this command.
export async function signInCloudflare({configurationPath,profileId,browserPath,readOnlySessionPreset=false,
  load=loadConfiguration,authorize=authorizeCloudflare,open=spawn,platform=process.platform}={}) {
  if(platform!=='win32' || !path.isAbsolute(configurationPath || '')
      || !path.isAbsolute(browserPath || '') || !/^[a-zA-Z0-9._-]{1,100}$/.test(profileId || '')) throw Error('invalid-sign-in-setup');
  if(!(await stat(browserPath)).isFile()) throw Error('browser-unavailable');
  const configuration=await load(configurationPath);
  const profile=configuration.browserConfiguration?.profiles?.find(entry=>entry.profile.id===profileId)?.profile;
  if(!configuration.oauthStorePath || profile?.transport!=='remote' || profile.resource!==RESOURCE) throw Error('cloudflare-oauth-setup-required');
  return authorize({storePath:configuration.oauthStorePath,profileId:profile.id,credentialReference:profile.credentialReference,
    // Narrow read-only scopes; offline access and action execution are not
    // silently requested by a connection test.
    allowOfflineAccess:false,readOnlySessionPreset:readOnlySessionPreset===true,onAuthorizationUrl:async url=>{
      await new Promise((resolve,reject)=>{
        const child=open(browserPath,[url],{windowsHide:false,detached:true,stdio:'ignore',shell:false});
        child.once('error',reject);child.once('spawn',()=>{child.unref();resolve();});
      });
      process.stderr.write('Cloudflare authorization opened in your browser. Review and approve there; no token is printed.\n');
    }});
}
if(process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href===import.meta.url) {
  const args=process.argv.slice(2);
  try {
    if(![6,7].includes(args.length) || args[0]!=='--config' || args[2]!=='--profile' || args[4]!=='--browser'
        || args.length===7 && args[6]!=='--read-only-session') throw Error('invalid-arguments');
    const result=await signInCloudflare({configurationPath:args[1],profileId:args[3],browserPath:args[5],readOnlySessionPreset:args[6]==='--read-only-session'});
    console.log(JSON.stringify(result));
  } catch(error) {
    process.stderr.write(signInFailureMessage(error));process.exitCode=1;
  }
}
