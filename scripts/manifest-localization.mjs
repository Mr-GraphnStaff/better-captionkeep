import { readFile } from 'node:fs/promises';
import path from 'node:path';

const TOKEN = /^__MSG_([A-Za-z0-9_]+)__$/;

export async function readEnglishMessages(extensionRoot) {
  const catalogPath = extensionRoot instanceof URL
    ? new URL('_locales/en/messages.json', extensionRoot)
    : path.join(extensionRoot, '_locales', 'en', 'messages.json');
  return JSON.parse(await readFile(catalogPath, 'utf8'));
}

export function resolveManifestMessage(value, messages) {
  const match = TOKEN.exec(String(value || ''));
  return match ? String(messages?.[match[1]]?.message || value) : value;
}

export function resolvedManifest(manifest, messages) {
  return {
    ...manifest,
    name: resolveManifestMessage(manifest.name, messages),
    description: resolveManifestMessage(manifest.description, messages),
    action: manifest.action ? {
      ...manifest.action,
      default_title: resolveManifestMessage(manifest.action.default_title, messages)
    } : manifest.action
  };
}
