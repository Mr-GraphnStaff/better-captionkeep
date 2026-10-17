import {readFileSync} from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';

const packageMetadata = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));

export function canonicalizeSbomText(text) {
  const sbom = JSON.parse(text);
  delete sbom.serialNumber;
  if (sbom.metadata && typeof sbom.metadata === 'object') {
    delete sbom.metadata.timestamp;
    if (sbom.metadata.component && typeof sbom.metadata.component === 'object') {
      sbom.metadata.component.name = packageMetadata.name;
      sbom.metadata.component.version = packageMetadata.version;
    }
  }
  return `${JSON.stringify(sbom, null, 2)}\n`;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  let text = '';
  process.stdin.setEncoding('utf8');
  for await (const chunk of process.stdin) text += chunk;
  process.stdout.write(canonicalizeSbomText(text));
}
