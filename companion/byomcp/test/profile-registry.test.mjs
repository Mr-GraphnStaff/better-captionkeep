import {test} from 'node:test';
import assert from 'node:assert/strict';
import {changeProfileRegistry} from '../profile-registry.mjs';
import {contracts} from '../helper.mjs';

const caller=`chrome-extension://${'a'.repeat(32)}/`;
const context={browserTarget:'chrome',caller};
async function entry(id,resource='https://first.invalid/mcp',revision=1) {
  const profile={id,label:id,revision,transport:'remote',resource,credentialReference:`TOKEN_${id}`,
    tools:[{name:'read',operation:'read',readOnly:true,schemaDigest:'b'.repeat(64)}]};
  return {profile:{...profile,profileDigest:await contracts.digest(profile)},actions:[]};
}
async function fixture() {
  return {version:1,hostName:'com.daftech.captionkeep.byomcp',allowedCallers:[{browser:'chrome',caller},
    {browser:'edge',caller:`chrome-extension://${'c'.repeat(32)}/`}],profiles:[await entry('first')]};
}
async function request(config,operation,extra={}) {
  return {operation,expectedConfigurationDigest:await contracts.digest(config),...extra};
}
const previous=value=>({profileId:value.profile.id,expectedRevision:value.profile.revision,
  expectedProfileDigest:value.profile.profileDigest});

test('add preserves two vendors and two accounts sharing an endpoint without rebinding callers or grants',async()=>{
  const original=await fixture(),saved=structuredClone(original);
  const second=await entry('second','https://second.invalid/mcp');
  const a=await changeProfileRegistry(original,await request(original,'add',{entry:second}),context);
  const third=await entry('third',original.profiles[0].profile.resource);
  const b=await changeProfileRegistry(a.configuration,await request(a.configuration,'add',{entry:third}),context);
  assert.deepEqual(original,saved);
  assert.deepEqual(b.configuration.allowedCallers,saved.allowedCallers);
  assert.deepEqual(b.configuration.profiles,[saved.profiles[0],second,third]);
  assert.equal(b.previousDigest,a.configurationDigest);
  assert.equal(b.configurationDigest,await contracts.digest(b.configuration));
});

test('update changes only the explicitly bound profile and increments its revision',async()=>{
  const config=await fixture();config.profiles.push(await entry('second'));
  const saved=structuredClone(config),replacement=await entry('second','https://replacement.invalid/mcp',2);
  const result=await changeProfileRegistry(config,await request(config,'update',{
    ...previous(config.profiles[1]),entry:replacement}),context);
  assert.deepEqual(config,saved);
  assert.deepEqual(result.configuration.profiles,[saved.profiles[0],replacement]);
  assert.deepEqual(result.configuration.allowedCallers,saved.allowedCallers);
});

test('remove uses exact identity, not resource, and preserves another account on that resource',async()=>{
  const config=await fixture();config.profiles.push(await entry('second'));
  const saved=structuredClone(config);
  const result=await changeProfileRegistry(config,await request(config,'remove',previous(config.profiles[0])),context);
  assert.deepEqual(result.configuration.profiles,[saved.profiles[1]]);
  assert.deepEqual(result.configuration.allowedCallers,saved.allowedCallers);
  assert.deepEqual(config,saved);
});

test('duplicate ID, changed digest, stale config and stale profile fail without mutation',async()=>{
  const config=await fixture(),saved=structuredClone(config),replacement=await entry('first',undefined,2);
  const update=await request(config,'update',{...previous(config.profiles[0]),entry:replacement});
  const failures=[await request(config,'add',{entry:config.profiles[0]}),
    {...update,expectedConfigurationDigest:'d'.repeat(64)},
    {...update,expectedRevision:2}, {...update,expectedProfileDigest:'d'.repeat(64)},
    {...update,entry:{...replacement,profile:{...replacement.profile,label:'tampered'}}},
    {...update,profileId:'missing'}, {...update,entry:await entry('wrong',undefined,2)},
    {...update,entry:await entry('first',undefined,3)},
    {...update,resource:config.profiles[0].profile.resource},
    {...update,allowedCallers:[{browser:'chrome',caller:`chrome-extension://${'d'.repeat(32)}/`}]},
    await request(config,'remove',previous(config.profiles[0]))];
  for(const change of failures) {
    await assert.rejects(changeProfileRegistry(config,change,context));
    assert.deepEqual(config,saved);
  }
});

test('malformed grants, caller, credential fields and over-capacity additions fail closed',async()=>{
  const config=await fixture(),saved=structuredClone(config);
  const bad=await entry('second');bad.profile.tools[0].readOnly=false;
  const {profileDigest,...definition}=bad.profile;bad.profile.profileDigest=await contracts.digest(definition);
  await assert.rejects(changeProfileRegistry(config,await request(config,'add',{entry:bad}),context));
  const secret=await entry('second');secret.profile.token='SYNTHETIC_SECRET';
  await assert.rejects(changeProfileRegistry(config,await request(config,'add',{entry:secret}),context));
  await assert.rejects(changeProfileRegistry(config,await request(config,'add',{entry:await entry('second')}),
    {...context,caller:`chrome-extension://${'e'.repeat(32)}/`}));
  assert.deepEqual(config,saved);
  while(config.profiles.length<20) config.profiles.push(await entry(`item${config.profiles.length}`));
  await assert.rejects(changeProfileRegistry(config,await request(config,'add',{entry:await entry('overflow')}),context));
});

test('asynchronous operation snapshots inputs and output does not alias input',async()=>{
  const config=await fixture(),change=await request(config,'add',{entry:await entry('second')});
  const pending=changeProfileRegistry(config,change,context);
  config.allowedCallers[0].browser='firefox';change.entry.profile.label='mutated';
  const result=await pending;
  assert.equal(result.configuration.allowedCallers[0].browser,'chrome');
  assert.equal(result.configuration.profiles[1].profile.label,'second');
  result.configuration.profiles[0].profile.label='output changed';
  assert.equal(config.profiles[0].profile.label,'first');
});
