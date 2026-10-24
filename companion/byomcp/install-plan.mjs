import path from 'node:path';
import {installerTemplate} from './installer-templates.mjs';

// Returns reviewable file CONTENT, not installed files. Registration, signing,
// ACL verification, permissions and browser installation require explicit setup.
export function createInstallPlan({browser,os,extensionId,nodePath,cliPath,configurationPath,launcherPath,manifestPath}) {
  const platformPath=os==='windows'?path.win32:path.posix;
  for(const value of [nodePath,cliPath,configurationPath,launcherPath,manifestPath]) {
    if(!platformPath.isAbsolute(value || '') || /[\u0000-\u001f\u007f"%&|<>^!]/.test(value)) throw Error('unsafe-launcher-path');
  }
  const quote=value=>`'${value.replace(/'/g,"'\\''")}'`;
  const launcher=os==='windows'
    ? `@echo off\r\n"${nodePath}" "${cliPath}" --config "${configurationPath}" %*\r\n`
    : `#!/bin/sh\nexec ${quote(nodePath)} ${quote(cliPath)} --config ${quote(configurationPath)} "$@"\n`;
  return {...installerTemplate({browser,os,extensionId,launcherPath,manifestPath}),launcher,
    limitations:['This plan performs no writes or registry edits.',
      'Windows launcher execution and per-browser native registration need installed acceptance testing.',
      'Keep configuration owner-controlled. Verify Windows ACLs before registration; POSIX group/world-writable configs are rejected.',
      'Use only explicitly supplied helper environment credentials. Codex credentials and browser tokens are never imported.']};
}
