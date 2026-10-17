import path from 'node:path';
import {NATIVE_HOST_NAME} from './enrollment.mjs';

// Pure generation. Never writes files, registry, app bundles or credentials.
export function installerTemplate({browser,os,extensionId,launcherPath,manifestPath,hostName=NATIVE_HOST_NAME}) {
  if (!['windows','macos'].includes(os) || !['chrome','edge','brave','opera','firefox'].includes(browser)) throw Error('unsupported-installer-profile');
  if (!/^[a-z0-9_]+(?:\.[a-z0-9_]+)+$/.test(hostName)) throw Error('invalid-host-name');
  const platformPath=os==='windows'?path.win32:path.posix;
  if (!platformPath.isAbsolute(launcherPath || '') || !platformPath.isAbsolute(manifestPath || '')
      || [launcherPath,manifestPath].some(value=>/[\u0000-\u001f\u007f]/.test(value))) throw Error('absolute-path-required');
  const firefox=browser==='firefox';
  if (firefox ? typeof extensionId!=='string' || !/^[a-zA-Z0-9@._{}-]{1,128}$/.test(extensionId) : !/^[a-p]{32}$/.test(extensionId)) throw Error('invalid-extension-id');
  const manifest={name:hostName,description:'Optional user-owned CaptionKeep BYOMCP helper',path:launcherPath,type:'stdio',
    ...(firefox?{allowed_extensions:[extensionId]}:{allowed_origins:[`chrome-extension://${extensionId}/`]})};
  const registryVendor=firefox?'Mozilla':browser==='edge'?'Microsoft\\Edge':browser==='chrome'?'Google\\Chrome':null;
  const windowsRegistry=os==='windows' && registryVendor?{key:`HKCU\\Software\\${registryVendor}\\NativeMessagingHosts\\${hostName}`,defaultValue:manifestPath}:null;
  const macUserDirectory=browser==='chrome'?'Library/Application Support/Google/Chrome/NativeMessagingHosts':
    browser==='edge'?'Library/Application Support/Microsoft Edge/NativeMessagingHosts':firefox?'Library/Application Support/Mozilla/NativeMessagingHosts':null;
  return {dryRunOnly:true,manifest,windowsRegistry,macUserDirectory:os==='macos'?macUserDirectory:null,
    registrationConventionVerified:['chrome','edge','firefox'].includes(browser),
    instructions:['Inspect this template and the signed absolute launcher; nothing has been installed.',
      'Verify exact extension ID, native host name, owner-only configuration and reviewed profile digests.',
      os==='windows'?(windowsRegistry?'Registry location is a per-user template; verify the selected installed browser before explicit installation.':'Brave/Opera registration location is not established by this template; do not invent a registry key.'):
        'Place a reviewed manifest only in the selected browser’s documented user NativeMessagingHosts location after explicit installation approval.',
      'Test enrollment, permission denial, update/removal and caller allowlisting in an isolated profile before deployment.',
      'Only the five 6.0 browser targets are in scope; other browser integrations are deferred.']};
}
