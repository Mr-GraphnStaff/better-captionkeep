const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const schema=JSON.parse(fs.readFileSync(path.resolve(__dirname,'../teams-captions-saver/managed-schema.json'),'utf8'));
const modulePromise=import('../scripts/build-managed-policy-templates.mjs');

test('Intune template stages 24 editable settings for each browser without exposing automatic connection values',async()=>{
  const {createManagedPolicyTemplates,STAGING_KEY}=await modulePromise;
  const {admx,contract}=createManagedPolicyTemplates(schema);
  assert.equal(contract.editableKeys.length,24);assert.equal(contract.policyCount,47);
  for(const browser of ['edge','chrome']){
    const units=contract.units.filter(unit=>unit.browser===browser);
    assert.equal(units.length,23);
    assert.deepEqual(units.flatMap(unit=>unit.keys).sort(),contract.editableKeys);
    for(const unit of units)assert.equal(unit.registryKey,STAGING_KEY+'\\'+browser);
  }
  assert.ok(!admx.includes('Software\\Policies\\Microsoft'));
  for(const key of contract.automaticKeys)assert.ok(!admx.includes(`valueName="${key}"`));
  assert.equal(contract.state,'OfflinePrototypeNotImported');assert.equal(contract.atomicAcrossSettings,false);
});

test('disabled controls have explicit release values and numeric inputs cannot receive implicit DWORD one',async()=>{
  const {createManagedPolicyTemplates,CLEAR_OVERRIDE}=await modulePromise;
  const {admx}=createManagedPolicyTemplates(schema);
  for(const block of admx.matchAll(/<policy\b([^>]+)>([\s\S]*?)<\/policy>/g)){
    const [,attributes,body]=block;
    if(body.includes('<elements>')){
      assert.ok(!/\svalueName=/.test(attributes),'No parent valueName before typed element writes');
      assert.ok(body.includes('<disabledList>'));assert.ok(body.includes(CLEAR_OVERRIDE));
    }else assert.ok(body.includes('<disabledValue><decimal value="0"/></disabledValue>'));
  }
  assert.match(admx,/<multiText[^>]+required="false"/);
  for(const browser of ['edge','chrome']){
    const group=admx.match(new RegExp(`<policy name="${browser}_saveAsType"[\\s\\S]*?<\\/policy>`))[0];
    assert.match(group,/enum[^>]+valueName="saveAsType"/);assert.match(group,/text[^>]+valueName="saveLocation"/);
    assert.equal((group.match(new RegExp(CLEAR_OVERRIDE,'g'))||[]).length,2);
  }
});

test('generated XML parses and every resource, presentation and control reference resolves',async()=>{
  assert.ok(process.env.AGENT_WORKING_DIR,'Managed run required');
  const {createManagedPolicyTemplates}=await modulePromise;
  const {admx,adml}=createManagedPolicyTemplates(schema);
  const dir=fs.mkdtempSync(path.join(process.env.AGENT_WORKING_DIR,'admx-structure-'));
  fs.writeFileSync(path.join(dir,'candidate.admx'),admx);fs.writeFileSync(path.join(dir,'candidate.adml'),adml);
  const quote=value=>`'${value.replaceAll("'","''")}'`;
  const script=`$ErrorActionPreference='Stop';[xml]$a=Get-Content -LiteralPath ${quote(path.join(dir,'candidate.admx'))} -Raw;[xml]$l=Get-Content -LiteralPath ${quote(path.join(dir,'candidate.adml'))} -Raw
    $ns=New-Object Xml.XmlNamespaceManager($a.NameTable);$ns.AddNamespace('p',$a.DocumentElement.NamespaceURI)
    $resources=@{};foreach($node in $l.SelectNodes('//*[local-name()="stringTable"]/*')){if($resources.ContainsKey($node.id)){throw 'Duplicate string'};$resources[$node.id]=$true}
    foreach($match in [regex]::Matches($a.OuterXml,'\\$\\(string\\.([^\)]+)\\)')){if(-not $resources.ContainsKey($match.Groups[1].Value)){throw 'Unresolved string'}}
    $presentations=@{};foreach($node in $l.SelectNodes('//*[local-name()="presentation"]')){$presentations[$node.id]=$node}
    $names=@{};foreach($policy in $a.SelectNodes('//p:policies/p:policy',$ns)){if($names.ContainsKey($policy.name)){throw 'Duplicate policy'};$names[$policy.name]=$true
      if($policy.presentation){$id=([string]$policy.presentation).Replace('$(presentation.','').TrimEnd(')');if(-not $presentations.ContainsKey($id)){throw 'Unresolved presentation'}
        $controls=@($presentations[$id].ChildNodes | ForEach-Object {$_.refId})
        foreach($element in $policy.SelectNodes('p:elements/*',$ns)){if($controls -cnotcontains $element.id){throw 'Missing accessible presentation input'}}
      }
    }
    Write-Output ('POLICIES:'+ $names.Count)`;
  const file=path.join(dir,'check.ps1');fs.writeFileSync(file,script);
  const result=spawnSync('pwsh',['-NoProfile','-NonInteractive','-File',file],{encoding:'utf8',windowsHide:true,timeout:30000});
  assert.equal(result.error,undefined);assert.equal(result.status,0,result.stdout+'\n'+result.stderr);assert.match(result.stdout,/POLICIES:47/);
});

test('schema changes require explicit contract review',async()=>{
  const {createManagedPolicyTemplates}=await modulePromise;
  assert.throws(()=>createManagedPolicyTemplates({properties:{}}),/contract/);
});
