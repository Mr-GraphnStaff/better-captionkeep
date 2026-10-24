const {test}=require('node:test');
const assert=require('node:assert/strict');

test('browser failure evidence retains the startup cause beyond the old 500-character truncation',async()=>{
  const {browserFailureDiagnostic}=await import('../scripts/browser-platform.mjs');
  const text='Browser did not open a debugging connection; code=running; '+ 'synthetic benign startup '.repeat(45)
    +'FATAL: synthetic diagnostic that used to disappear';
  const actual=browserFailureDiagnostic(Error(text),{homeDirectory:'C:\\SyntheticHome',projectRoot:'P:\\SyntheticProject'});
  assert(actual.includes('code=running'));
  assert(actual.includes('FATAL: synthetic diagnostic that used to disappear'));
  assert(actual.length<=3000);
});

test('bounded startup evidence preserves prefix and tail while redacting local roots and full URLs',async()=>{
  const {browserFailureDiagnostic}=await import('../scripts/browser-platform.mjs');
  const text='code=running P:\\SyntheticProject\n'+'noise '.repeat(900)
    +'C:\\SyntheticHome https://example.invalid/?synthetic=private FATAL: final cause';
  const actual=browserFailureDiagnostic(Error(text),{homeDirectory:'C:\\SyntheticHome',projectRoot:'P:\\SyntheticProject'});
  assert(actual.startsWith('code=running [project]'));
  assert(actual.endsWith('[home] [url] FATAL: final cause'));
  assert(actual.includes('[truncated]'));assert.equal(actual.length,3000);
  assert(!actual.includes('synthetic=private'));assert(!actual.includes('\n'));
});

test('rendered browser startup isolates background networking without weakening sandbox or assertion transport',async()=>{
  const {chromiumSurfaceArguments}=await import('../scripts/rendered-surface-checks.mjs');
  const args=chromiumSurfaceArguments('C:\\Synthetic Temp\\profile');
  assert(args.includes('--disable-background-networking'));
  assert(args.includes('--no-first-run'));assert(args.includes('--remote-debugging-port=0'));
  assert(args.includes('--user-data-dir=C:\\Synthetic Temp\\profile'));
  assert(!args.some(value=>/no-sandbox|disable-setuid-sandbox|disable-web-security/.test(value)));
  assert.equal(args.at(-1),'about:blank');
});

test('Firefox screenshot uses its newly created isolated profile and removes only that profile after success or failure',async()=>{
  const {runFirefoxSurface}=await import('../scripts/browser-platform.mjs');
  const fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path');
  const temporaryRoot=await fs.mkdtemp(path.join(os.tmpdir(),'captionkeep-firefox-regression-'));
  const screenshot=path.join(temporaryRoot,'synthetic.png'),url='file:///synthetic-popup.html?view=settings';
  const sentinel=path.join(temporaryRoot,'ordinary-profile');await fs.mkdir(sentinel);
  try {
    const profiles=[];
    for(const fail of [false,true]) {
      const execute=(binary,args,options)=>{
        assert.equal(binary,'synthetic-firefox');assert(args.includes('--no-remote'));
        const profile=args[args.indexOf('--profile')+1];profiles.push(profile);
        assert.equal(path.dirname(profile),temporaryRoot);assert(profile.includes('captionkeep-firefox-surface-'));
        assert.equal(args.at(-1),url);assert.equal(args[args.indexOf('--screenshot')+1],screenshot);
        assert.equal(options.timeout,60000);assert.equal(options.windowsHide,true);
        if(fail)throw Error('synthetic-timeout');
      };
      const run=runFirefoxSurface('synthetic-firefox',screenshot,url,{temporaryRoot,execute});
      if(fail)await assert.rejects(run,/synthetic-timeout/);else await run;
      await assert.rejects(fs.access(profiles.at(-1)));await fs.access(sentinel);
    }
    assert.notEqual(profiles[0],profiles[1]);
  } finally {await fs.rm(temporaryRoot,{recursive:true,force:true});}
});
