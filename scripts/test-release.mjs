import {readdir} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import path from 'node:path';

// These suites exercise retained, unshipped MCP implementation. Historical
// receipt compatibility and explicit removal/boundary tests remain required.
export const deferredTestFiles=Object.freeze([
  'byomcp-catalog-ui.test.cjs','byomcp-contracts.test.cjs','byomcp-integration-review.test.cjs',
  'byomcp-native-client.test.cjs','byomcp-native-diagnostics.test.cjs','byomcp-native-discovery.test.cjs',
  'byomcp-runtime-adapter.test.cjs','byomcp-settings-diagnostics.test.cjs','byomcp-settings-recovery.test.cjs',
  'byomcp-settings.test.cjs','byomcp-setup-ui.test.cjs','byomcp-tool-catalog.test.cjs',
  'byomcp-worker-bridge.test.cjs','byomcp-workspace.test.cjs',
  'cloudflare-dns-review.test.cjs','cloudflare-oauth-review.test.cjs','evidence-action-jobs.test.cjs',
  'helper-package.test.cjs','helper-package-review.test.cjs','probe-byomcp-native.test.cjs'
]);
export function selectReleaseTests(names) {
  const deferred=new Set(deferredTestFiles);
  return {included:names.filter(name=>name.endsWith('.test.cjs') && !deferred.has(name)).sort(),
    deferred:names.filter(name=>deferred.has(name)).sort()};
}
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
if(process.argv[1] && path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  const selection=selectReleaseTests(await readdir(path.join(root,'tests')));
  if(process.argv.includes('--list')) console.log(JSON.stringify(selection,null,2));
  else {
    console.log(`6.0 shipping suite: ${selection.included.length} files; ${selection.deferred.length} deferred implementation files excluded (npm test retains developer coverage).`);
    console.log(`Deferred files: ${selection.deferred.join(', ')}`);
    const result=spawnSync(process.execPath,['--test',...selection.included.map(name=>path.join(root,'tests',name))],{cwd:root,stdio:'inherit',windowsHide:true});
    if(result.error) throw result.error;
    process.exitCode=result.status??1;
  }
}
