const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {execFileSync}=require('node:child_process');
const {pathToFileURL}=require('node:url');

test('actual public helper source packages and imports offline after ZIP extraction without installation',async()=>{
    const api=await import('../scripts/package-byomcp-helper.mjs');
    const {zipEntries}=await import('../scripts/verify-package-source.mjs');
    const project=path.resolve(__dirname,'..'),prefix=path.join(os.tmpdir(),'captionkeep-helper-review-');
    const root=await fs.mkdtemp(prefix),extracted=path.join(root,'extracted');
    try {
        const {files,helper,lock}=await api.collectHelperSources(project);
        for(const [name,bytes] of files){const file=path.join(root,name);await fs.mkdir(path.dirname(file),{recursive:true});await fs.writeFile(file,bytes);}
        await fs.mkdir(path.join(root,'teams-captions-saver'),{recursive:true});
        await fs.copyFile(path.join(project,'teams-captions-saver/manifest.json'),path.join(root,'teams-captions-saver/manifest.json'));
        // Synthetic BOM envelope for this isolated packaging-layout test. The
        // actual release independently generates its BOM using locked npm data.
        const sbom={bomFormat:'CycloneDX',metadata:{component:{version:helper.version,purl:`pkg:npm/${helper.name}@${helper.version}`}},
            components:Object.entries(lock.packages).filter(([name])=>name).map(([name,item])=>({name:name.slice('node_modules/'.length),version:item.version}))};
        const {names}=await api.packageByomcpHelper({root,sbomText:JSON.stringify(sbom)});
        const entries=zipEntries(await fs.readFile(path.join(root,'dist/prod',names.zip)));
        for(const [name,bytes] of entries){const file=path.resolve(extracted,name);assert(file.startsWith(path.resolve(extracted)+path.sep));await fs.mkdir(path.dirname(file),{recursive:true});await fs.writeFile(file,bytes);}
        const cli=pathToFileURL(path.join(extracted,'companion/byomcp/cli.mjs')).href;
        const output=execFileSync(process.execPath,['--input-type=module','-e',`const module=await import(${JSON.stringify(cli)});if(typeof module.launch!=='function')throw Error('missing CLI');console.log('OFFLINE_IMPORT_OK');`],
            {cwd:extracted,encoding:'utf8',windowsHide:true,timeout:10000});
        assert.equal(output.trim(),'OFFLINE_IMPORT_OK');
        assert(entries.has('companion/byomcp/node_modules/@modelcontextprotocol/client/package.json'));
        assert(![...entries.keys()].some(name=>/\.env|private-config|\/test\//i.test(name)));
        assert.equal((await api.verifyByomcpHelper(root)).length,3);
    } finally {
        assert(path.resolve(root).startsWith(path.resolve(prefix)));
        await fs.rm(root,{recursive:true,force:true});
    }
});
