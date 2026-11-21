import path from 'node:path';
import {readFile,writeFile,mkdir,lstat} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {createNativeHostManifest} from './build-admin-setup.mjs';
import {signAdministratorFile,signingArguments} from './sign-admin-payload.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const host='com.daftech.bettercaptionkeep.adminsetup';
const browsers=['Google\\Chrome','Microsoft\\Edge','BraveSoftware\\Brave-Browser'];
function quote(value) {
  if (/[\r\n]/.test(value)) throw Error('Invalid installer value.');
  return '"'+value.replaceAll('$','$$').replaceAll('"','$\\"')+'"';
}
export function installerSource({packageDirectory,outputFile,version,files,manifestFile,signing}) {
  if (!/^\d+\.\d+\.\d+$/.test(version)) throw Error('Installer requires a three-part version.');
  const seen=new Set();
  for(const name of files) {
    if(typeof name!=='string'||!name||!/^[A-Za-z0-9_./-]+$/.test(name)||name.startsWith('/')||name.split('/').some(p=>!p||p==='.'||p==='..')||seen.has(name.toLowerCase()))throw Error('Unsafe or duplicate package path.');
    seen.add(name.toLowerCase());
  }
  for(const required of ['BetterCaptionKeep.AdminSetup.exe','BetterCaptionKeep.AdminSetup.NativeHost.exe','BetterCaptionKeep.AdminSetup.NativeHost.dll','BetterCaptionKeep.AdminSetup.NativeHost.runtimeconfig.json','package-manifest.json'])if(!seen.has(required.toLowerCase()))throw Error(`Incomplete administrator installer: ${required}`);
  if(signing&&!signing.uninstallerScriptPath)throw Error('A managed uninstaller signing wrapper is required.');
  const uninstallerArgs=signing ? signingArguments('%1',{...signing,scriptPath:signing.uninstallerScriptPath}) : [];
  if(signing)uninstallerArgs[uninstallerArgs.indexOf('-FilePath')]='-TemporaryFilePath';
  const signHook=signing ? [signing.powerShellPath,...uninstallerArgs].map(part=>{
    if(/[\r\n'"$]/.test(part))throw Error('Unsafe compiler signing argument.');
    return '"'+part+'"';
  }).join(' ') : null;
  const lines=[
    'Unicode true','RequestExecutionLevel user','SetCompressor /SOLID lzma',
    `Name "Better CaptionKeep Administrator Setup"`,`OutFile ${quote(outputFile)}`,
    'InstallDir "$LOCALAPPDATA\\Programs\\DAF-TECH\\Better CaptionKeep Administrator Setup"',
    'BrandingText "DAF-TECH"',`VIProductVersion "${version}.0"`,
    ...(signHook?[`!uninstfinalize '${signHook}' = 0`]:[]),
    'VIAddVersionKey "ProductName" "Better CaptionKeep Administrator Setup"',
    'VIAddVersionKey "FileDescription" "Better CaptionKeep Administrator Setup Installer"',
    'VIAddVersionKey "CompanyName" "DAF-TECH"',`VIAddVersionKey "FileVersion" "${version}"`,
    'VIAddVersionKey "LegalCopyright" "DAF-TECH"',
    'Page instfiles',
    'UninstPage uninstConfirm','UninstPage instfiles',
    'Function InstallFailed','MessageBox MB_OK|MB_ICONSTOP "Installation did not complete. No successful connection has been confirmed. Close any running setup window and try the installer again." /SD IDOK','Abort','FunctionEnd',
    'Section "Install"','SetShellVarContext current','SetRegView 64','SetOutPath "$INSTDIR"',
    ...files.flatMap(name=>['ClearErrors',`SetOutPath "$INSTDIR${name.includes('/')?'\\'+name.slice(0,name.lastIndexOf('/')).replaceAll('/','\\'):''}"`,`File ${quote(path.join(packageDirectory,name))}`,'IfErrors 0 +2','Call InstallFailed']),
    'SetOutPath "$INSTDIR"',
    'ClearErrors',
    `File /oname=${host}.json ${quote(manifestFile)}`,
    'IfErrors 0 +2','Call InstallFailed','ClearErrors',
    'WriteUninstaller "$INSTDIR\\Uninstall.exe"',
    'IfErrors 0 +2','Call InstallFailed',
    ...browsers.flatMap(browser=>[32,64].flatMap(view=>[`SetRegView ${view}`,'ClearErrors',`WriteRegStr HKCU "Software\\${browser}\\NativeMessagingHosts\\${host}" "" "$INSTDIR\\${host}.json"`,'IfErrors 0 +2','Call InstallFailed',`ReadRegStr $0 HKCU "Software\\${browser}\\NativeMessagingHosts\\${host}" ""`,`StrCmp $0 "$INSTDIR\\${host}.json" +2`,'Call InstallFailed'])),
    'SetRegView 64',
    'WriteRegStr HKCU "Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\BetterCaptionKeepAdminSetup" "DisplayName" "Better CaptionKeep Administrator Setup"',
    `WriteRegStr HKCU "Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\BetterCaptionKeepAdminSetup" "DisplayVersion" "${version}"`,
    'WriteRegStr HKCU "Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\BetterCaptionKeepAdminSetup" "Publisher" "DAF-TECH"',
    'WriteRegStr HKCU "Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\BetterCaptionKeepAdminSetup" "UninstallString" \'$\\"$INSTDIR\\Uninstall.exe$\\"\'',
    'IfErrors 0 +2','Call InstallFailed',
    'MessageBox MB_OK "Installation complete. Return to Better CaptionKeep and choose Continue setup." /SD IDOK',
    'SectionEnd','Section "Uninstall"','SetShellVarContext current',
    ...browsers.flatMap((browser,i)=>[32,64].flatMap(view=>[
      `SetRegView ${view}`,`ReadRegStr $0 HKCU "Software\\${browser}\\NativeMessagingHosts\\${host}" ""`,
      `StrCmp $0 "$INSTDIR\\${host}.json" 0 skip_${i}_${view}`,
      `DeleteRegValue HKCU "Software\\${browser}\\NativeMessagingHosts\\${host}" ""`,
      `DeleteRegKey /ifempty HKCU "Software\\${browser}\\NativeMessagingHosts\\${host}"`,
      `skip_${i}_${view}:`])),
    'SetRegView 64','DeleteRegKey HKCU "Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\BetterCaptionKeepAdminSetup"',
    ...files.map(name=>`Delete "$INSTDIR\\${name.replaceAll('/','\\')}"`),
    `Delete "$INSTDIR\\${host}.json"`,'Delete "$INSTDIR\\Uninstall.exe"',
    ...[...new Set(files.flatMap(name=>{const parts=name.split('/');return parts.slice(0,-1).map((_,i)=>parts.slice(0,i+1).join('\\'));}))].sort((a,b)=>b.length-a.length).map(dir=>`RMDir "$INSTDIR\\${dir}"`),
    'RMDir "$INSTDIR"','SectionEnd'
  ];
  // No recursive deletion, PowerShell, machine policy or trust-store changes.
  return lines.join('\r\n')+'\r\n';
}
export async function buildAdministratorInstaller({packageDirectory,compilerPath,outputFile,version='6.0.1',signing}) {
  if(!process.env.AGENT_WORKING_DIR)throw Error('Use working_area.py run.');
  const packageRoot=path.resolve(packageDirectory),output=path.resolve(outputFile);
  if(!packageRoot.startsWith(path.join(root,'Dev')+path.sep)||!output.startsWith(path.join(root,'Dev')+path.sep))throw Error('Installer candidates belong under Dev.');
  const inventory=JSON.parse(await readFile(path.join(packageRoot,'package-manifest.json'),'utf8'));
  if(inventory.schemaVersion!==1||!Array.isArray(inventory.files))throw Error('Unsupported administrator inventory.');
  if(signing&&inventory.signed!==true)throw Error('Public installer requires the signed payload inventory.');
  const files=inventory.files.map(f=>f.path);
  for(const entry of inventory.files){
    if(/(^|\/)(operations|receipts|working|\.git)(\/|$)|administrator-settings\.json|signing-config\.json/i.test(entry.path))throw Error('Operational data cannot ship.');
    const full=path.resolve(packageRoot,entry.path);
    if(!full.startsWith(packageRoot+path.sep))throw Error('Unsafe package inventory.');
    for(let ancestor=full;ancestor;ancestor=path.dirname(ancestor)){
      if((await lstat(ancestor)).isSymbolicLink())throw Error('Linked package ancestor.');
      if(path.dirname(ancestor)===ancestor)break;
    }
    if(createHash('sha256').update(await readFile(full)).digest('hex')!==entry.sha256)throw Error(`Package changed: ${entry.path}`);
  }
  files.push('package-manifest.json');
  const working=process.env.AGENT_WORKING_DIR;
  const manifestFile=path.join(working,'installer-native-host.json');
  await writeFile(manifestFile,JSON.stringify(createNativeHostManifest('BetterCaptionKeep.AdminSetup.NativeHost.exe'),null,2));
  const source=path.join(working,'admin-installer.nsi');
  await writeFile(source,installerSource({packageDirectory:packageRoot,outputFile:output,version,files,manifestFile,signing}));
  await mkdir(path.dirname(output),{recursive:true});
  await new Promise((resolve,reject)=>{const child=spawn(compilerPath,['/V3',source],{cwd:root,env:process.env,stdio:'inherit',windowsHide:true});child.on('error',reject);child.on('exit',code=>code===0?resolve():reject(Error(`Installer compiler exited ${code}`)));});
  if(signing)await signAdministratorFile(output,signing);
  const sha256=createHash('sha256').update(await readFile(output)).digest('hex');
  await writeFile(`${output}.sha256`,`${sha256}  ${path.basename(output)}\n`);
  return {output,sha256,signed:Boolean(signing),releaseReady:false};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))console.log(JSON.stringify(await buildAdministratorInstaller({packageDirectory:process.argv[2],compilerPath:process.argv[3],outputFile:process.argv[4]})));
