const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {RE2}=require('re2-wasm');
const schema=JSON.parse(fs.readFileSync(path.join(__dirname,'../teams-captions-saver/managed-schema.json'),'utf8'));

test('all managed schema patterns compile in actual RE2 used by Chromium',async()=>{
  const {validateManagedSchemaPatterns}=await import('../scripts/managed-schema-validation.mjs');
  assert.deepEqual(validateManagedSchemaPatterns(schema),[]);
  for(const pattern of ['^[^\\u0000-\\u001f]*$','^(?!reserved$).+$']){
    assert.equal(validateManagedSchemaPatterns({properties:{example:{type:'string',pattern}}}).length,1);
  }
});

test('RE2 patterns preserve filename, folder and workspace restrictions',()=>{
  const patterns=Object.fromEntries(Object.entries(schema.properties).filter(([,value])=>value.pattern).map(([key,value])=>[key,new RE2(value.pattern,'u')]));
  for(const key of ['filenamePattern','saveLocation']){
    assert.ok(patterns[key].test('{date}_Synthetic meeting'));
    for(const char of '<>:"\\|?*'+Array.from({length:32},(_,index)=>String.fromCharCode(index)).join(''))assert.equal(patterns[key].test('safe'+char+'name'),false,`${key} must reject ${char.charCodeAt(0)}`);
  }
  assert.ok(patterns.saveLocation.test('Organization/Transcripts'));
  assert.equal(patterns.filenamePattern.test('name/file'),false);
  for(const [key,host] of [['chatgptWorkspaceUrl','chatgpt.com'],['claudeWorkspaceUrl','claude.ai'],['claudeConsoleUrl','console.anthropic.com']]){
    assert.ok(patterns[key].test('https://'+host+'/workspace/synthetic'));
    for(const url of ['http://'+host,'https://'+host+'.invalid/','https://'+host+'/?token=x','https://'+host+'/#fragment','https://'+host+':444/','https://'+host+'/space here'])assert.equal(patterns[key].test(url),false,url);
  }
});
