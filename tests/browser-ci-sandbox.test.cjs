const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {spawnSync} = require('node:child_process');

const stepName = '      - name: Restore packaged Edge sandbox permissions on the hosted image';
function preparation(workflow) {
  const source = fs.readFileSync(path.join(__dirname, '..', '.github', 'workflows', workflow), 'utf8');
  const block = source.split(stepName)[1]?.split('\n      - name:')[0];
  assert(block, `Missing sandbox preparation in ${workflow}`);
  assert(source.indexOf(stepName) < source.indexOf('run: npm run release:candidate'));
  return block.split('        run: |')[1].trimEnd().split(/\r?\n/)
    .filter(line => line.trim()).map(line => line.slice(10)).join('\n');
}

test('both hosted browser gates repair only a verified distribution sandbox and fail closed', () => {
  const script = preparation('release.yml');
  assert.equal(script, preparation('validate.yml'));
  const bash = process.platform === 'win32' ? 'C:/Program Files/Git/bin/bash.exe' : 'bash';
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'captionkeep-ci-sandbox-'));
  try {
    const fixture = path.join(temporary, 'sandbox');
    fs.writeFileSync(fixture, 'synthetic sandbox; never executed');
    const shellPath = process.platform === 'win32'
      ? fixture.replaceAll('\\', '/').replace(/^([A-Za-z]):/, (_, drive) => `/${drive.toLowerCase()}`)
      : fixture;
    const quote = value => `'${value.replaceAll("'", "'\\''")}'`;
    const cases = [
      {name:'distribution file', pass:true},
      {name:'absent browser sandbox', fixture:`${shellPath}-missing`, pass:true, untouched:true},
      {name:'directory is not an executable file', fixture:shellPath.slice(0, shellPath.lastIndexOf('/')), pass:false},
      {name:'unowned file', owner:'unrelated-package: /opt/microsoft/msedge/msedge-sandbox', pass:false},
      {name:'wrong package path', owner:'microsoft-edge-stable: /tmp/msedge-sandbox', pass:false},
      {name:'canonical path changed', canonical:'/unexpected/sandbox', pass:false},
      {name:'permission repair denied', sudoFails:true, pass:false, attempted:true},
      {name:'permission readback wrong', mode:'root:root:0755', pass:false, attempted:true},
    ];
    for (const scenario of cases) {
      const testedPath = scenario.fixture || shellPath;
      const prelude = [
        `readlink() { printf '%s\\n' ${quote(scenario.canonical || testedPath)}; }`,
        `dpkg-query() { printf '%s\\n' ${quote(scenario.owner || 'microsoft-edge-stable: /opt/microsoft/msedge/msedge-sandbox')}; }`,
        `stat() { printf '%s\\n' ${quote(scenario.mode || 'root:root:4755')}; }`,
        `sudo() { printf 'PRIVILEGED:%s\\n' "$*"; ${scenario.sudoFails ? 'return 1' : 'return 0'}; }`,
      ].join('\n');
      const result = spawnSync(bash, ['--noprofile', '--norc', '-c', `${prelude}\n${script.replace('edge_sandbox=/opt/microsoft/msedge/msedge-sandbox', `edge_sandbox=${quote(testedPath)}`)}`], {encoding:'utf8', windowsHide:true});
      assert.ifError(result.error);
      assert.equal(result.status === 0, scenario.pass, `${scenario.name}: ${result.stderr}`);
      if (!scenario.pass && !scenario.attempted) assert(!result.stdout.includes('PRIVILEGED:'), scenario.name);
      if (scenario.untouched) assert(!result.stdout.includes('PRIVILEGED:'), scenario.name);
      else if (scenario.pass) {
        assert(result.stdout.includes('PRIVILEGED:chown root:root '));
        assert(result.stdout.includes('PRIVILEGED:chmod 4755 '));
      }
    }
  } finally {
    fs.rmSync(temporary, {recursive:true, force:true});
  }
});
