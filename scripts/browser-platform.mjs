import {access} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

export function browserFailureDiagnostic(error,{projectRoot='',homeDirectory=os.homedir()}={}) {
  let message=String(error?.message || error);
  if(projectRoot)message=message.replaceAll(projectRoot,'[project]');
  if(homeDirectory)message=message.replaceAll(homeDirectory,'[home]');
  message=message.replace(/[\u0000-\u001f\u007f]/g,' ').replace(/https?:\/\/[^\s]+/g,'[url]');
  // Startup errors already contain bounded, redacted stderr. Retain its tail:
  // clipping at 500 characters discarded remaining hosted-Edge startup evidence.
  const limit=3000,separator=' [truncated] ';
  return message.length<=limit?message:message.slice(0,500)+separator+message.slice(-(limit-500-separator.length));
}

export function browserCandidates(platform = process.platform, environment = process.env) {
  if (platform === 'win32') return [
    {browser:'chrome', chromium:true, paths:['C:/Program Files/Google/Chrome/Application/chrome.exe']},
    {browser:'edge', chromium:true, paths:['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe']},
    {browser:'brave', chromium:true, paths:[path.join(environment.LOCALAPPDATA || '', 'BraveSoftware/Brave-Browser/Application/brave.exe')]},
    {browser:'opera', chromium:true, paths:[path.join(environment.LOCALAPPDATA || '', 'Programs/Opera/opera.exe')]},
    {browser:'firefox', chromium:false, paths:['C:/Program Files/Mozilla Firefox/firefox.exe']}
  ];
  if (platform === 'darwin') return [
    {browser:'chrome', chromium:true, paths:['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome']},
    {browser:'edge', chromium:true, paths:['/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge']},
    {browser:'brave', chromium:true, paths:['/Applications/Brave Browser.app/Contents/MacOS/Brave Browser']},
    {browser:'opera', chromium:true, paths:['/Applications/Opera.app/Contents/MacOS/Opera']},
    {browser:'firefox', chromium:false, paths:['/Applications/Firefox.app/Contents/MacOS/firefox']}
  ];
  return [
    {browser:'chrome', chromium:true, paths:['/usr/bin/google-chrome-stable','/usr/bin/google-chrome']},
    {browser:'edge', chromium:true, paths:['/usr/bin/microsoft-edge-stable','/usr/bin/microsoft-edge']},
    {browser:'brave', chromium:true, paths:['/usr/bin/brave-browser']},
    {browser:'opera', chromium:true, paths:['/usr/bin/opera']},
    {browser:'firefox', chromium:false, paths:['/usr/bin/firefox']}
  ];
}

export async function installedBrowsers(platform = process.platform, environment = process.env) {
  const result = [];
  for (const definition of browserCandidates(platform, environment)) {
    let binary = null;
    for (const candidate of definition.paths) {
      try {await access(candidate); binary = candidate; break;} catch {}
    }
    result.push({...definition, binary});
  }
  return result;
}
