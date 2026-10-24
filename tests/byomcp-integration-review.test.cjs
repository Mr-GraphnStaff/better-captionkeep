// Deferred MCP source-module coverage only. This does not exercise shipping 6.0 MCP.
// Original worker-materialization integration cases are preserved verbatim at
// tests/fixtures/deferred-mcp/byomcp-integration-review.test.cjs.txt.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {randomUUID}=require('node:crypto');
const contracts=require('../teams-captions-saver/evidenceActionContracts.js');
const runtime=require('../teams-captions-saver/byomcpRuntimeAdapter.js');
async function fixture() {
    const caller=`chrome-extension://${'a'.repeat(32)}/`;
    const identity={id:'synthetic-owner',label:'Synthetic',revision:1,transport:'remote',resource:'https://synthetic.invalid/mcp',credentialReference:'SYNTHETIC_ENV',
        tools:[{name:'lookup',operation:'read',readOnly:true,schemaDigest:'b'.repeat(64)}]};
    const profile={...identity,profileDigest:await contracts.digest(identity)};
    const action={kind:'directory-lookup',tool:'lookup',tenantId:randomUUID(),allowedFields:['displayName']};
    const config={version:1,hostName:'com.daftech.captionkeep.byomcp',allowedCallers:[{browser:'chrome',caller}],profiles:[{profile,actions:[action]}]};
    return {config,caller};
}

test('deferred-module coverage: browser configuration rejects unknown secret-bearing profile and caller fields even with a recomputed digest',async()=>{
    const f=await fixture();
    for(const mutate of [configuration=>{configuration.profiles[0].profile.authorization='Bearer SYNTHETIC_SECRET_SHOULD_NOT_PERSIST';},
        configuration=>{configuration.allowedCallers.push({browser:'edge',caller:f.caller,token:'SYNTHETIC_SECRET'});},
        configuration=>{configuration.profiles[0].profile.tools[0].token='SYNTHETIC_SECRET';},
        configuration=>{configuration.profiles[0].profile.resource='https://synthetic.invalid/mcp?token=SYNTHETIC_SECRET';}]) {
        const configuration=structuredClone(f.config);mutate(configuration);
        const {profileDigest,...identity}=configuration.profiles[0].profile;configuration.profiles[0].profile.profileDigest=await contracts.digest(identity);
        await assert.rejects(runtime.validateConfiguration(configuration,{contracts,browserTarget:'chrome',caller:f.caller}));
    }
});
