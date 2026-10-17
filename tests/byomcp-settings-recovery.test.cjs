// Standalone deferred-module unit coverage only. Removed-UI rendered case preserved in fixtures/deferred-mcp/byomcp-settings-recovery.test.cjs.txt.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {createController}=require('../teams-captions-saver/byomcpSettings.js');
const deferred=()=>{let resolve;const promise=new Promise(done=>{resolve=done;});return {promise,resolve};};
const status={ok:true,status:{protocolVersion:1,enrollmentVerified:true,enabled:true,helperVersion:'synthetic',profiles:[]}};
test('unanswered permission times out recoverably; late grant never connects; fresh gesture can retry',async()=>{
  const permission=deferred(),calls=[];
  const controller=createController({permissionTimeoutMs:5,policy:async()=>({}),send:async message=>{calls.push(message);return status;}});
  await assert.rejects(controller.connect(permission.promise),error=>error.code==='permission-timeout');
  assert.match(controller.getState().label,/Dismiss any open permission prompt/);assert.equal(calls.length,0);
  permission.resolve(true);await new Promise(resolve=>setImmediate(resolve));assert.equal(calls.length,0);
  await controller.connect(Promise.resolve(true));assert.equal(calls.length,1);assert.equal(controller.getState().enabled,true);
});
test('superseded permission result cannot replace a newer connection or contact helper again',async()=>{
  const permission=deferred(),calls=[];
  const controller=createController({permissionTimeoutMs:100,policy:async()=>({}),send:async message=>{calls.push(message);return status;}});
  const old=controller.connect(permission.promise);const rejected=assert.rejects(old,error=>error.code==='stale-operation');
  await controller.connect(Promise.resolve(true));permission.resolve(true);await rejected;
  assert.equal(calls.length,1);assert.equal(controller.getState().enabled,true);
});
test('hung policy and worker replies release the pending slot; late success cannot replace a fresh check',async()=>{
  const worker=deferred();let calls=0;
  const controller=createController({operationTimeoutMs:5,policy:async()=>({}),send:async()=>++calls===1?worker.promise:{ok:true,code:'not-connected'}});
  await assert.rejects(controller.connect(Promise.resolve(true)),error=>error.code==='helper-timeout');
  await controller.check();worker.resolve(status);await new Promise(resolve=>setImmediate(resolve));
  assert.equal(controller.getState().enabled,false);assert.match(controller.getState().label,/not connected/);
  const policy=deferred();let sends=0;
  const blocked=createController({operationTimeoutMs:5,policy:()=>policy.promise,send:async()=>{sends++;return status;}});
  await assert.rejects(blocked.connect(Promise.resolve(true)),error=>error.code==='policy-timeout');policy.resolve({});
  await new Promise(resolve=>setImmediate(resolve));assert.equal(sends,0);
});
