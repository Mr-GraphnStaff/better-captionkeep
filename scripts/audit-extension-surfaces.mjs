import {readFile, readdir} from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import {fileURLToPath} from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDir, '..');
const sourceDir = path.join(projectRoot, 'teams-captions-saver');
const pageNames = ['popup.html', 'sidepanel.html', 'viewer.html', 'export.html', 'extras.html', 'handoff.html', 'platform-coming-soon.html'];
const errors = [];

function fail(page, message) {
    errors.push(`${page}: ${message}`);
}

function attribute(tag, name) {
    return tag.match(new RegExp(`\\b${name}\\s*=\\s*["']([^"']*)["']`, 'i'))?.[1] ?? null;
}

for (const pageName of pageNames) {
    const html = await readFile(path.join(sourceDir, pageName), 'utf8');
    if (!/<html\b[^>]*\blang=["'][^"']+["']/i.test(html)) fail(pageName, 'document language is missing');
    if (!/<meta\b[^>]*name=["']viewport["']/i.test(html)) fail(pageName, 'responsive viewport is missing');
    if (!/<title>[^<]+<\/title>/i.test(html)) fail(pageName, 'document title is missing');
    if (!/<h1\b[^>]*>[^<]/i.test(html)) fail(pageName, 'one visible first-level heading is required');
    if (!/<main\b/i.test(html)) fail(pageName, 'main landmark is missing');
    if (!html.includes('theme.css')) fail(pageName, 'shared accessible theme is not loaded');
    if (/\son(?:click|change|input|keydown|keyup|submit)\s*=/i.test(html)) fail(pageName, 'inline event handlers are prohibited');

    const ids = [...html.matchAll(/\bid=["']([^"']+)["']/gi)].map(match => match[1]);
    const duplicates = ids.filter((id, index) => ids.indexOf(id) !== index);
    if (duplicates.length) fail(pageName, `duplicate element IDs: ${[...new Set(duplicates)].join(', ')}`);

    for (const match of html.matchAll(/<img\b[^>]*>/gi)) {
        if (attribute(match[0], 'alt') === null) fail(pageName, `image lacks alt text: ${match[0].slice(0, 90)}`);
    }
    for (const match of html.matchAll(/<a\b[^>]*target=["']_blank["'][^>]*>/gi)) {
        const rel = attribute(match[0], 'rel') || '';
        if (!/\bnoopener\b/i.test(rel) && !/\bnoreferrer\b/i.test(rel)) fail(pageName, 'new-tab link lacks noopener or noreferrer');
    }
    for (const match of html.matchAll(/<button\b([^>]*)>([\s\S]*?)<\/button>/gi)) {
        const tag = match[0];
        const visibleText = match[2].replace(/<svg[\s\S]*?<\/svg>/gi, '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
        if (!visibleText && !attribute(tag, 'aria-label') && !attribute(tag, 'title')) fail(pageName, 'button has no accessible name');
    }
    for (const match of html.matchAll(/<(?:input|select|textarea)\b[^>]*>/gi)) {
        const tag = match[0];
        if (/\btype=["'](?:hidden|checkbox|radio)["']/i.test(tag) || /\bhidden\b/i.test(tag)) continue;
        const id = attribute(tag, 'id');
        const labelled = attribute(tag, 'aria-label') || attribute(tag, 'aria-labelledby')
            || (id && new RegExp(`<label\\b[^>]*for=["']${id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}["']`, 'i').test(html));
        if (!labelled) fail(pageName, `form control ${id || tag.slice(0, 60)} lacks a programmatic label`);
    }
}

const theme = await readFile(path.join(sourceDir, 'theme.css'), 'utf8');
if (!theme.includes(':focus-visible')) errors.push('theme.css: visible keyboard focus styling is required');
if (!theme.includes('prefers-reduced-motion')) errors.push('theme.css: reduced-motion support is required');
if (!theme.includes('color-scheme: dark')) errors.push('theme.css: native dark controls are required');

const manifest = JSON.parse(await readFile(path.join(sourceDir, 'manifest.json'), 'utf8'));
if (manifest.manifest_version !== 3) errors.push('manifest.json: Manifest V3 is required');
if ((manifest.host_permissions || []).includes('<all_urls>')) errors.push('manifest.json: <all_urls> is prohibited');
for (const permission of manifest.host_permissions || []) {
    if (!permission.startsWith('https://')) errors.push(`manifest.json: insecure host permission ${permission}`);
}

const scriptNames = (await readdir(sourceDir)).filter(name => name.endsWith('.js'));
for (const scriptName of scriptNames) {
    const source = await readFile(path.join(sourceDir, scriptName), 'utf8');
    if (/\beval\s*\(/.test(source) || /\bnew\s+Function\s*\(/.test(source)) fail(scriptName, 'dynamic code execution is prohibited');
    if (/https?:\/\/(?!login\.microsoftonline\.com|graph\.microsoft\.com|teams\.microsoft\.com|teams\.cloud\.microsoft|meet\.google\.com|meet\.new|app\.zoom\.us|zoom\.new|chatgpt\.com|claude\.ai|console\.anthropic\.com|copilot\.microsoft\.com|m365\.cloud\.microsoft|gemini\.google\.com|outlook\.office\.com|outlook\.live\.com|mail\.google\.com|github\.com|www\.googleapis\.com|schemas\.openxmlformats\.org)/i.test(source)) {
        fail(scriptName, 'contains an unapproved remote endpoint');
    }
}

if (errors.length) {
    console.error(`6.0 accessibility/security surface audit failed (${errors.length}):`);
    for (const error of errors) console.error(`- ${error}`);
    process.exitCode = 1;
} else {
    console.log(`6.0 accessibility/security surface audit passed for ${pageNames.length} pages and ${scriptNames.length} scripts.`);
}
