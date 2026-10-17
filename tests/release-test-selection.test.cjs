const test=require('node:test');
const assert=require('node:assert/strict');
const {readdir}=require('node:fs/promises');
const path=require('node:path');
test('shipping suite retains core, historical receipt and MCP-removal acceptance',async()=>{
  const {selectReleaseTests}=await import('../scripts/test-release.mjs');
  const selection=selectReleaseTests(await readdir(path.join(__dirname)));
  for(const name of ['byomcp-receipt-view.test.cjs','mcp-removed-ui.test.cjs','no-mcp-runtime.test.cjs','shipping-boundary.test.cjs','reliability.test.cjs','store-metadata.test.cjs']) {
    assert(selection.included.includes(name),`Shipping acceptance missing ${name}`);
  }
  assert(selection.deferred.includes('helper-package-review.test.cjs'));
  assert(!selection.deferred.some(name=>/receipt-view|removed-ui|no-mcp-runtime|shipping-boundary/.test(name)));
  assert(selectReleaseTests(['future-core.test.cjs']).included.includes('future-core.test.cjs'));
});
