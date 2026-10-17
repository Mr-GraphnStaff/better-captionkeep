import path from 'node:path';
import {pathToFileURL} from 'node:url';

export function canonicalizeSbomText(text) {
  const sbom = JSON.parse(text);
  delete sbom.serialNumber;
  if (sbom.metadata && typeof sbom.metadata === 'object') delete sbom.metadata.timestamp;
  return `${JSON.stringify(sbom, null, 2)}\n`;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  let text = '';
  process.stdin.setEncoding('utf8');
  for await (const chunk of process.stdin) text += chunk;
  process.stdout.write(canonicalizeSbomText(text));
}
