import path from 'node:path';
import {readFile,writeFile,mkdir,lstat} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';

export const STAGING_KEY='Software\\Policies\\DAF-TECH\\BetterCaptionKeep\\Managed';
export const CLEAR_OVERRIDE='__BCK_EMPLOYEE_CHOICE__';
const XML_NAMESPACE='http://schemas.microsoft.com/GroupPolicy/2006/07/PolicyDefinitions';
const AUTOMATIC=new Set(['enableGraphTranscriptImport','graphTenantId','graphClientId']);
const BROWSERS=['edge','chrome'];
const escape=value=>String(value).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&apos;');
const digest=value=>createHash('sha256').update(value).digest('hex');
const title=key=>key.replace(/([a-z])([A-Z])/g,'$1 $2').replace(/^./,s=>s.toUpperCase());
function category(key){
  if(/Ai|Workspace|Console/.test(key))return 'AI';
  if(/Session|Retention/.test(key))return 'History';
  if(/Locale|Theme|timestamp/.test(key))return 'Appearance';
  if(/Privacy|Profanity|Scrub/.test(key))return 'Privacy';
  if(/Attendee/.test(key))return 'Capture';
  return 'Exports';
}

export function createManagedPolicyTemplates(schema){
  const properties=schema?.properties;
  if(!properties||Object.keys(properties).length!==27)throw Error('Review the template contract when changing the 27-key policy schema.');
  const keys=Object.keys(properties).filter(key=>!AUTOMATIC.has(key)).sort();
  if(keys.length!==24||keys.some(key=>!/^\w+$/.test(key)))throw Error('Unexpected editable policy keys.');
  const strings=new Map(),presentations=[],policies=[],categories=[],units=[];
  const string=(id,value)=>{if(strings.has(id)&&strings.get(id)!==value)throw Error('Resource collision.');strings.set(id,value);return `$(string.${id})`;};
  categories.push(`<category name="BCK" displayName="${string('BCK','Better CaptionKeep')}"><parentCategory ref="BCKRoot"/></category>`);
  categories.unshift(`<category name="BCKRoot" displayName="${string('BCKRoot','DAF-TECH') }"/>`);
  string('SupportedWindows','Windows 10 or later');
  const support='<supportedOn ref="SUPPORTED_WINDOWS"/>';
  const managementHelp='Enabled: apply this profile through the BCK management component. Disabled: release BCK-owned setting overrides after ownership checks; leave the extension installed. Not configured or missing input after management was observed retains the last good settings and reports stale input. This prototype is not yet validated by Intune ingestion or endpoint rollout.';
  policies.push(`<policy name="Management" class="Machine" displayName="${string('Management','Manage Better CaptionKeep settings')}" explainText="${string('Management_Help',managementHelp)}" key="${escape(STAGING_KEY)}" valueName="Management"><parentCategory ref="BCK"/>${support}<enabledValue><decimal value="1"/></enabledValue><disabledValue><decimal value="0"/></disabledValue></policy>`);
  function disabled(key,names){return `<disabledList>${names.map(name=>`<item key="${escape(key)}" valueName="${escape(name)}"><value><string>${CLEAR_OVERRIDE}</string></value></item>`).join('')}</disabledList>`;}
  function field(browser,key,definition,{optional=false,defaultValue}={}){
    const id=`${browser}_${key}`,label=definition.title||title(key),name=escape(key);
    if(definition.type==='string'&&Array.isArray(definition.enum)){
      const items=definition.enum.map((value,index)=>`<item displayName="${string(`${id}_${index}`,value)}"><value><string>${escape(value)}</string></value></item>`).join('');
      return {element:`<enum id="${id}" valueName="${name}" required="true">${items}</enum>`,presentation:`<dropdownList refId="${id}" defaultItem="0">${escape(label)}</dropdownList>`};
    }
    if(definition.type==='string')return {element:`<text id="${id}" valueName="${name}" required="${!optional}"/>`,presentation:`<textBox refId="${id}"><label>${escape(label)}</label>${defaultValue===undefined?'':`<defaultValue>${escape(defaultValue)}</defaultValue>`}</textBox>`};
    if(definition.type==='integer')return {element:`<decimal id="${id}" valueName="${name}" minValue="${definition.minimum}" maxValue="${definition.maximum}" required="true"/>`,presentation:`<decimalTextBox refId="${id}" defaultValue="${definition.minimum}">${escape(label)}</decimalTextBox>`};
    if(definition.type==='array'&&definition.items?.type==='string')return {element:`<multiText id="${id}" valueName="${name}" required="false"/>`,presentation:`<multiTextBox refId="${id}">${escape(label)} — one entry per line</multiTextBox>`};
    throw Error(`Unsupported policy field: ${key}`);
  }
  for(const browser of BROWSERS){
    const browserLabel=browser==='edge'?'Microsoft Edge':'Google Chrome';
    categories.push(`<category name="${browser}" displayName="${string(browser,browserLabel)}"><parentCategory ref="BCK"/></category>`);
    for(const group of ['Privacy','AI','History','Appearance','Capture','Exports'])categories.push(`<category name="${browser}_${group}" displayName="${string(group,group)}"><parentCategory ref="${browser}"/></category>`);
    const registryKey=`${STAGING_KEY}\\${browser}`;
    for(const key of keys){
      if(key==='saveLocation')continue;
      const definition=properties[key],name=`${browser}_${key}`,pair=key==='saveAsType',names=pair?['saveAsType','saveLocation']:[key];
      const label=pair?'Default transcript download destination':definition.title||title(key);
      const help=[definition.description||label,'Enabled sets this BCK override. Disabled explicitly releases the BCK override, restoring an original backed-up value if one existed. Not configured is not an explicit release after a value was managed. Other organizational controls can still apply.',`The literal ${CLEAR_OVERRIDE} is reserved and cannot be used as a managed filename, folder or other string value.`,pair?'Save mode and subfolder are grouped. The subfolder is used only in Custom mode. Delivery is not claimed to be transactional, and this is not a file-confinement control.':'','The management component validates values before applying them.'].filter(Boolean).join(' ');
      const attributes=`name="${name}" class="Machine" displayName="${string(name,label)}" explainText="${string(`${name}_Help`,help)}" key="${escape(registryKey)}"`;
      if(definition.type==='boolean'){
        policies.push(`<policy ${attributes} valueName="${key}"><parentCategory ref="${browser}_${category(key)}"/>${support}<enabledValue><decimal value="1"/></enabledValue><disabledValue><decimal value="0"/></disabledValue></policy>`);
      }else{
        const fields=pair?[field(browser,'saveAsType',definition),field(browser,'saveLocation',properties.saveLocation,{defaultValue:'CaptionKeep'})]:[field(browser,key,definition)];
        presentations.push(`<presentation id="${name}">${fields.map(value=>value.presentation).join('')}</presentation>`);
        // No parent valueName: enabling a numeric input must not first write an
        // implicit DWORD 1 (which could briefly enforce one-day retention).
        policies.push(`<policy ${attributes} presentation="$(presentation.${name})"><parentCategory ref="${browser}_${category(key)}"/>${support}${disabled(registryKey,names)}<elements>${fields.map(value=>value.element).join('')}</elements></policy>`);
      }
      units.push({browser,name,keys:names,registryKey,boolean:definition.type==='boolean'});
    }
  }
  const header='<?xml version="1.0" encoding="utf-8"?>\n';
  const admx=header+`<policyDefinitions revision="1.0" schemaVersion="1.0" xmlns="${XML_NAMESPACE}"><policyNamespaces><target prefix="bck" namespace="DAFTECH.BetterCaptionKeep.Management.V1"/></policyNamespaces><resources minRequiredRevision="1.0"/><supportedOn><definitions><definition name="SUPPORTED_WINDOWS" displayName="$(string.SupportedWindows)"/></definitions></supportedOn><categories>${categories.join('')}</categories><policies>${policies.join('')}</policies></policyDefinitions>\n`;
  const adml=header+`<policyDefinitionResources revision="1.0" schemaVersion="1.0" xmlns="${XML_NAMESPACE}"><displayName>Better CaptionKeep management</displayName><description>Development prototype: Intune controls backed by the bounded BCK policy bridge.</description><resources><stringTable>${[...strings].map(([id,value])=>`<string id="${id}">${escape(value)}</string>`).join('')}</stringTable><presentationTable>${presentations.join('')}</presentationTable></resources></policyDefinitionResources>\n`;
  return {admx,adml,contract:{version:1,state:'OfflinePrototypeNotImported',stagingKey:STAGING_KEY,clearOverride:CLEAR_OVERRIDE,automaticKeys:[...AUTOMATIC],editableKeys:keys,management:{valueName:'Management',on:1,off:0},units,policyCount:policies.length,atomicAcrossSettings:false,requiresNativeIngestionProof:true}};
}

export async function buildManagedPolicyTemplates(outputDirectory){
  if(!process.env.AGENT_WORKING_DIR)throw Error('Use the checked working-area launcher.');
  const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),output=path.resolve(outputDirectory||path.join(root,'Dev','managed-policy-templates-v1'));
  const relative=path.relative(root,output);
  if(relative.startsWith('..')||path.isAbsolute(relative)||(!relative.startsWith(`Dev${path.sep}`)&&!relative.startsWith(`working${path.sep}`)))throw Error('Template output belongs in Dev or managed working space.');
  for(let cursor=output;cursor!==root;cursor=path.dirname(cursor)){try{if((await lstat(cursor)).isSymbolicLink())throw Error('Linked output path.');}catch(error){if(error.code!=='ENOENT')throw error;}}
  const schema=JSON.parse(await readFile(path.join(root,'teams-captions-saver','managed-schema.json'),'utf8'));
  const result=createManagedPolicyTemplates(schema),files={'BetterCaptionKeep.Management.v1.admx':result.admx,'en-US/BetterCaptionKeep.Management.v1.adml':result.adml,'contract.json':JSON.stringify(result.contract,null,2)+'\n'};
  const hashes={};
  for(const [name,contents]of Object.entries(files)){
    const target=path.join(output,name);
    for(let cursor=target;cursor!==root;cursor=path.dirname(cursor)){try{if((await lstat(cursor)).isSymbolicLink())throw Error('Linked output path.');}catch(error){if(error.code!=='ENOENT')throw error;}}
    try{const previous=await readFile(target,'utf8');if(previous!==contents)throw Error(`Preserve the previous candidate before replacement: ${target}`);}catch(error){if(error.code!=='ENOENT')throw error;}
    await mkdir(path.dirname(target),{recursive:true});await writeFile(target,contents);hashes[name]=digest(contents);
  }
  return {output,hashes,...result.contract};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const result=await buildManagedPolicyTemplates(process.argv[2]);
  console.log(JSON.stringify({output:result.output,hashes:result.hashes,state:result.state,editableSettings:result.editableKeys.length,policyCount:result.policyCount,requiresNativeIngestionProof:true}));
}
