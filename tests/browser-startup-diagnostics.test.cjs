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
