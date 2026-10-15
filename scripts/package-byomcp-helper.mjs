import {createHash, randomUUID} from 'node:crypto';
import {createWriteStream} from 'node:fs';
import {lstat, mkdir, readFile, readdir, rename, rm, stat, writeFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {ZipArchive} from 'archiver';
import {zipEntries} from './verify-package-source.mjs';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const HELPER_PUBLIC_FILES = Object.freeze([
  'cli.mjs','authorize-cloudflare.mjs','cloudflare-oauth.mjs','cloudflare-dns.mjs','controlled-actions.mjs','enrollment.mjs','framing.mjs',
  'helper.mjs','catalog-session.mjs','install-plan.mjs','installer-templates.mjs','native.mjs','transports.mjs',
  'package.json','package-lock.json','README.md'
]);
const RUNTIME_FILES = ['evidenceActionContracts.js','byomcpRuntimeAdapter.js'];
const excluded = /^(?:\..*|test|tests|__tests__|fixtures|benchmarks|examples)$/i;
const unsafe = /(?:\.env(?:\.|$)|\.(?:pem|key|p12|pfx|node|exe|dll|so|dylib|wasm|ps1|cmd|bat)$)/i;
const hash = bytes => createHash('sha256').update(bytes).digest('hex').toUpperCase();

export function helperArtifactNames(version) {
  if (!/^\d+\.\d+\.\d+(?:\.\d+)?$/.test(version)) throw new Error('Invalid helper release version.');
  const stem = `better-captionkeep-byomcp-helper-${version}`;
  return {zip:`${stem}.zip`,sbom:`${stem}.cdx.json`,hashes:'byomcp-helper-hashes.json'};
}

async function regularBytes(file) {
  if (!(await lstat(file)).isFile()) throw new Error('Helper packages require regular files, not symlinks.');
  return readFile(file);
}

async function dependencyFiles(root, relative, files) {
  if (!(await lstat(path.join(root,relative))).isDirectory()) throw new Error('Invalid helper dependency directory.');
  for (const entry of await readdir(path.join(root,relative),{withFileTypes:true})) {
    if (excluded.test(entry.name)) continue;
    const next = `${relative}/${entry.name}`;
    if (unsafe.test(entry.name) || entry.isSymbolicLink()) throw new Error(`Unsupported helper dependency file: ${next}`);
    if (entry.isDirectory()) await dependencyFiles(root,next,files);
    else files.set(next,await regularBytes(path.join(root,next)));
  }
}

export async function collectHelperSources(root = projectRoot) {
  const files = new Map();
  for (const name of HELPER_PUBLIC_FILES) {
    const relative = `companion/byomcp/${name}`;
    files.set(relative,await regularBytes(path.join(root,relative)));
  }
  for (const name of RUNTIME_FILES) {
    const relative = `teams-captions-saver/${name}`;
    files.set(relative,await regularBytes(path.join(root,relative)));
  }
  files.set('LICENSE',await regularBytes(path.join(root,'LICENSE')));
  const helper = JSON.parse(files.get('companion/byomcp/package.json'));
  const lock = JSON.parse(files.get('companion/byomcp/package-lock.json'));
  if (helper.name !== lock.name || helper.version !== lock.version || helper.version !== lock.packages?.['']?.version
      || JSON.stringify(helper.dependencies) !== JSON.stringify(lock.packages[''].dependencies)) {
    throw new Error('Helper package and dependency lock identity differ.');
  }
  for (const [relative,details] of Object.entries(lock.packages || {})) {
    if (!relative) continue;
    if (!/^node_modules\/(?:@[\w.-]+\/)?[\w.-]+$/.test(relative) || details.link || details.dev || !details.integrity) {
      throw new Error(`Unsupported helper dependency lock entry: ${relative}`);
    }
    const prefix = `companion/byomcp/${relative}`;
    const installed = JSON.parse(await regularBytes(path.join(root,prefix,'package.json')));
    if (installed.version !== details.version) throw new Error(`Helper dependency version differs: ${relative}`);
    await dependencyFiles(root,prefix,files);
    if (![...files.keys()].some(name => name.startsWith(`${prefix}/`) && /\/licen[cs]e(?:\.[^/]*)?$/i.test(name))) {
      throw new Error(`Helper dependency license is missing: ${relative}`);
    }
  }
  return {files,helper,lock};
}

function validateSbom(text, helper, lock) {
  const bom = JSON.parse(text);
  const root = bom.metadata?.component;
  if (bom.bomFormat !== 'CycloneDX' || root?.version !== helper.version
      || root.purl !== `pkg:npm/${helper.name}@${helper.version}`) throw new Error('Helper SBOM identity differs.');
  const expected = Object.entries(lock.packages).filter(([key]) => key).map(([key,value]) =>
    `${key.slice('node_modules/'.length)}@${value.version}`).sort();
  const actual = (bom.components || []).map(item => `${item.name}@${item.version}`).sort();
  if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error('Helper SBOM dependency versions differ from the lockfile.');
}

function startHere(releaseVersion, helperVersion) {
  return Buffer.from(`# Better CaptionKeep ${releaseVersion}: optional BYOMCP helper ${helperVersion}\n\n`
    + 'UAT/development package, not a standalone installer or certification.\n'
    + 'Install Node.js 22 or newer separately. No Node runtime is bundled.\n'
    + 'Pure-JavaScript locked dependencies are included for offline use.\n'
    + 'Keep this complete folder structure when extracting the ZIP.\n'
    + 'Read companion/byomcp/README.md before any explicit configuration or host installation.\n'
    + 'No credentials, native host registration, launcher installation or browser enrollment is provided.\n'
    + 'Do not put private configuration or credentials in this distribution folder.\n'
    + 'Safari is not a supported 6.0 target.\n');
}

async function releaseIdentity(root) {
  return JSON.parse(await regularBytes(path.join(root,'teams-captions-saver/manifest.json'))).version;
}

async function outputDirectory(root) {
  for (const relative of ['dist','dist/prod']) {
    const directory = path.join(root,relative);
    await mkdir(directory,{recursive:true});
    if (!(await lstat(directory)).isDirectory()) throw new Error('Helper output must be a real directory, not a symlink.');
  }
  return path.join(root,'dist/prod');
}

export async function packageByomcpHelper({root = projectRoot, sbomText, npmCli = process.env.npm_execpath} = {}) {
  root = path.resolve(root);
  const version = await releaseIdentity(root), names = helperArtifactNames(version);
  const {files,helper,lock} = await collectHelperSources(root);
  if (!sbomText) {
    if (!npmCli) throw new Error('Run helper packaging through npm run package:helper to locate the npm CLI.');
    sbomText = execFileSync(process.execPath,[npmCli,'sbom','--prefix',path.join(root,'companion/byomcp'),
      '--package-lock-only','--omit=dev','--sbom-format','cyclonedx','--sbom-type','application'],
    {cwd:root,encoding:'utf8',windowsHide:true,maxBuffer:10 * 1024 * 1024});
  }
  sbomText = `${sbomText.trim()}\n`;
  validateSbom(sbomText,helper,lock);
  files.set('START-HERE.md',startHere(version,helper.version));
  files.set('BYOMCP-SBOM.cdx.json',Buffer.from(sbomText));
  const destination = await outputDirectory(root), zipPath = path.join(destination,names.zip);
  const temporary = `${zipPath}.${randomUUID()}.partial`;
  try {
    await new Promise((resolve,reject) => {
      const output = createWriteStream(temporary,{flags:'wx'});
      const archive = new ZipArchive({zlib:{level:9}});
      output.on('close',resolve); output.on('error',reject);
      archive.on('error',reject); archive.on('warning',reject); archive.pipe(output);
      for (const [name,bytes] of [...files].sort(([a],[b]) => a.localeCompare(b))) {
        archive.append(bytes,{name,date:new Date('2000-01-01T00:00:00Z'),mode:0o644});
      }
      archive.finalize().catch(reject);
    });
    await rm(zipPath,{force:true});
    await rename(temporary,zipPath);
  } finally {await rm(temporary,{force:true});}
  await writeFile(path.join(destination,names.sbom),sbomText);
  const record = {releaseVersion:version,helperVersion:helper.version,nodeRuntime:'>=22',includesDependencies:true,
    zip:names.zip,sbom:names.sbom,zipSha256:hash(await readFile(zipPath)),sbomSha256:hash(Buffer.from(sbomText)),
    entries:[...files].sort(([a],[b]) => a.localeCompare(b)).map(([name,bytes]) => ({path:name,bytes:bytes.length,sha256:hash(bytes)}))};
  await writeFile(path.join(destination,names.hashes),`${JSON.stringify(record,null,2)}\n`);
  await verifyByomcpHelper(root);
  return {names,record};
}

export async function verifyByomcpHelper(root = projectRoot) {
  const version = await releaseIdentity(root), names = helperArtifactNames(version), destination = path.join(root,'dist/prod');
  const {files,helper,lock} = await collectHelperSources(root);
  const sbom = await regularBytes(path.join(destination,names.sbom));
  validateSbom(sbom.toString('utf8'),helper,lock);
  files.set('START-HERE.md',startHere(version,helper.version)); files.set('BYOMCP-SBOM.cdx.json',sbom);
  const zip = await regularBytes(path.join(destination,names.zip)), entries = zipEntries(zip);
  if (entries.size !== files.size) throw new Error('Helper ZIP contains unexpected or missing files.');
  for (const [name,bytes] of files) {
    if (!entries.get(name)?.equals(bytes)) throw new Error(`Helper ZIP source mismatch: ${name}`);
  }
  const expected = {releaseVersion:version,helperVersion:helper.version,nodeRuntime:'>=22',includesDependencies:true,
    zip:names.zip,sbom:names.sbom,zipSha256:hash(zip),sbomSha256:hash(sbom),
    entries:[...files].sort(([a],[b]) => a.localeCompare(b)).map(([name,bytes]) => ({path:name,bytes:bytes.length,sha256:hash(bytes)}))};
  const record = JSON.parse(await regularBytes(path.join(destination,names.hashes)));
  if (JSON.stringify(record) !== JSON.stringify(expected)) throw new Error('Helper package hash manifest differs from actual sources or artifacts.');
  return Promise.all([['byomcp-helper',names.zip],['byomcp-sbom',names.sbom],['byomcp-hashes',names.hashes]].map(async ([target,name]) => ({
    target,path:name,bytes:(await stat(path.join(destination,name))).size,sha256:hash(await readFile(path.join(destination,name)))
  })));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const {names,record} = await packageByomcpHelper();
  console.log(`Packaged optional BYOMCP helper ${record.helperVersion} for ${record.releaseVersion}: ${names.zip} (${record.entries.length} public files). Node.js 22+ is required separately; nothing was installed.`);
}
