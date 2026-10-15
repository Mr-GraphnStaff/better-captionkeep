const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const os=require('node:os');
const {createWriteStream}=require('node:fs');
const {createHash}=require('node:crypto');
async function fixture(run,{cloudflareModules=false}={}){
    const prefix=path.join(os.tmpdir(),'captionkeep-native-probe-test-'),root=await fs.mkdtemp(prefix);
    try{
        async function write(name,text){const file=path.join(root,name);await fs.mkdir(path.dirname(file),{recursive:true});await fs.writeFile(file,text);}
        const build=await fs.readFile(path.resolve(__dirname,'../scripts/build-browser-targets.mjs'),'utf8');
        await write('scripts/build-browser-targets.mjs',build);
        await write('dist/prod/brave-unpacked/manifest.json',JSON.stringify({manifest_version:3,name:'Synthetic',version:'6.0.0',optional_permissions:['nativeMessaging']}));
        await write('dist/prod/brave-unpacked/browserRuntimeConfig.js','globalThis.CaptionKeepBrowserRuntime=Object.freeze({"target":"brave"});');
        await write('dist/prod/brave-unpacked/service_worker.js','// Synthetic worker');
        await write('companion/byomcp/test/fixtures/mcp-server.mjs','// Synthetic peer fixture');
        const zipName='better-captionkeep-byomcp-helper-6.0.0.zip',zipPath=path.join(root,'dist/prod',zipName);
        const entries=[['companion/byomcp/cli.mjs',Buffer.from('// Synthetic CLI')]];
        if(cloudflareModules){
            entries.push(['companion/byomcp/cloudflare-oauth.mjs',Buffer.from("export const RESOURCE='https://mcp.cloudflare.com/mcp';export async function getCloudflareAuthorization(){return 'Bearer SYNTHETIC_TEST_ONLY';}")]);
            entries.push(['companion/byomcp/transports.mjs',Buffer.from("export function createSdkAdapters({getAuthorization}){return {remote:{async inspect(profile){if(profile.id!=='cloudflare-readonly'||await getAuthorization('https://mcp.cloudflare.com/mcp')!=='Bearer SYNTHETIC_TEST_ONLY')throw Error('binding');return [{name:'execute',schemaDigest:'b'.repeat(64)},{name:'whoami',schemaDigest:'a'.repeat(64)}];},async disconnect(){}}};}")]);
        }
        const hash=bytes=>createHash('sha256').update(bytes).digest('hex').toUpperCase();
        const {ZipArchive}=await import('archiver');
        await fs.mkdir(path.dirname(zipPath),{recursive:true});
        await new Promise((resolve,reject)=>{const output=createWriteStream(zipPath),archive=new ZipArchive();
            output.on('close',resolve);output.on('error',reject);archive.on('error',reject);archive.pipe(output);
            for(const [name,bytes] of entries)archive.append(bytes,{name});archive.finalize().catch(reject);});
        await write('dist/prod/byomcp-helper-hashes.json',JSON.stringify({zip:zipName,zipSha256:hash(await fs.readFile(zipPath)),
            entries:entries.map(([name,bytes])=>({path:name,sha256:hash(bytes)}))}));
        const api=await import('../scripts/probe-byomcp-native.mjs');await run({root,api,write,baseDirectory:path.join(root,'private/BYOMCP-Probe')});
    }finally{assert(path.resolve(root).startsWith(path.resolve(prefix)));await fs.rm(root,{recursive:true,force:true});}
}
test('prepare produces only isolated synthetic registration plans with a single exact stable caller',{skip:process.platform!=='win32'},async()=>{
    await fixture(async({root,api,baseDirectory})=>{
        const record=await api.prepareByomcpNativeProbe({root,baseDirectory});
        const manifest=JSON.parse(await fs.readFile(record.manifestPath,'utf8'));
        const config=JSON.parse(await fs.readFile(record.configurationPath,'utf8'));
        assert.deepEqual(manifest.allowed_origins,[`chrome-extension://${record.extensionId}/`]);
        assert.equal(record.registrationPerformed,false);
        assert(record.registryCandidate.key.startsWith('HKCU\\Software\\Google\\Chrome\\NativeMessagingHosts\\'));
        assert.equal(config.browserConfiguration.allowedCallers[0].browser,'brave');
        assert.equal(config.browserConfiguration.profiles[0].profile.tools[0].name,'synthetic_read');
        assert.deepEqual(config.browserConfiguration.profiles[0].actions,[]);
        assert.deepEqual(config.verificationTools,[]);
        assert.equal(config.browserStoragePath,record.profileDirectory);
        assert(record.configurationPath.startsWith(path.join(baseDirectory,'setup')));
        assert(config.browserConfiguration.profiles[0].profile.cwd.startsWith(path.join(baseDirectory,'installation')));
        assert(config.browserConfiguration.profiles[0].profile.args[0].startsWith(path.join(baseDirectory,'installation')));
        const launcher=await fs.readFile(record.launcherPath,'utf8');
        assert(launcher.includes(path.join(baseDirectory,'installation/companion/byomcp/cli.mjs')));
        assert.equal((await api.prepareByomcpNativeProbe({root,baseDirectory})).extensionId,record.extensionId);
    });
});
test('prepare rejects a package without optional native permission rather than silently granting it',{skip:process.platform!=='win32'},async()=>{
    await fixture(async({root,api,write,baseDirectory})=>{
        await write('dist/prod/brave-unpacked/manifest.json',JSON.stringify({manifest_version:3,name:'Synthetic',version:'6.0.0'}));
        await assert.rejects(api.prepareByomcpNativeProbe({root,baseDirectory}),/optional nativeMessaging/);
    });
});
test('Cloudflare metadata mode fails closed without approved OAuth modules, leaving synthetic config intact',{skip:process.platform!=='win32'},async()=>{
    await fixture(async({root,api,baseDirectory})=>{
        const record=await api.prepareByomcpNativeProbe({root,baseDirectory}),before=await fs.readFile(record.configurationPath,'utf8');
        await assert.rejects(api.prepareByomcpNativeProbe({root,baseDirectory,cloudflareInventory:true}),/existing matching private OAuth grant/);
        assert.equal(await fs.readFile(record.configurationPath,'utf8'),before);
    });
});
test('post-grant metadata fixture pins only returned whoami schema and no executable action',{skip:process.platform!=='win32'},async()=>{
    await fixture(async({root,api,baseDirectory})=>{
        const record=await api.prepareByomcpNativeProbe({root,baseDirectory,cloudflareInventory:true});
        const config=JSON.parse(await fs.readFile(record.configurationPath,'utf8')),entry=config.browserConfiguration.profiles[0];
        assert.equal(entry.profile.id,'cloudflare-readonly');assert.equal(entry.profile.credentialReference,'cloudflare-readonly');
        assert.deepEqual(entry.profile.tools,[{name:'whoami',operation:'read',readOnly:true,schemaDigest:'a'.repeat(64)}]);
        assert.deepEqual(entry.actions,[]);assert.equal(config.oauthStorePath,path.join(baseDirectory,'CloudflareOAuth/cloudflare.dpapi'));
        assert(!JSON.stringify(config).includes('Bearer'));assert(record.scope.includes('NEVER invoked'));
    },{cloudflareModules:true});
});
test('manual connection mode cannot run invisibly',async()=>{
    const api=await import('../scripts/probe-byomcp-native.mjs');
    await assert.rejects(api.runByomcpNativeProbe({manualConnect:true,interactive:false}),/visible interactive/);
});
