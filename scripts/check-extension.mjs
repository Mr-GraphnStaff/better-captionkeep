import { access, readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');
const sourceDir = path.join(projectRoot, 'teams-captions-saver');

const manifestPath = path.join(sourceDir, 'manifest.json');

function formatList(items) {
  return items.map(item => `- ${item}`).join('\n');
}

async function fileExists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function validateManifest(manifest) {
  const errors = [];
  const warnings = [];

  if (manifest.manifest_version !== 3) {
    errors.push('manifest_version must be set to 3.');
  }

  if (!manifest.name) {
    errors.push('Extension name is missing in manifest.');
  }

  if (!manifest.version) {
    warnings.push('Extension version is missing in manifest.');
  }

  const requiredPermissions = ['downloads', 'storage', 'sidePanel'];
  const permissions = manifest.permissions ?? [];
  for (const permission of requiredPermissions) {
    if (!permissions.includes(permission)) {
      errors.push(`Required permission "${permission}" is missing.`);
    }
  }

  const hostPermissions = manifest.host_permissions ?? [];
  const requiredTeamsHosts = [
    'https://teams.microsoft.com/*',
    'https://teams.cloud.microsoft/*'
  ];
  for (const host of requiredTeamsHosts) {
    if (!hostPermissions.includes(host)) {
      errors.push(`Host permissions must include "${host}".`);
    }
  }
  if (!hostPermissions.includes('https://meet.google.com/*')) {
    errors.push('Google Meet development requires the exact "https://meet.google.com/*" host permission.');
  }

  const backgroundWorker = manifest.background?.service_worker;
  if (!backgroundWorker) {
    errors.push('background.service_worker is not defined.');
  } else if (!(await fileExists(path.join(sourceDir, backgroundWorker)))) {
    errors.push(`Background service worker file "${backgroundWorker}" is missing.`);
  }

  const defaultPopup = manifest.action?.default_popup;
  if (defaultPopup && !(await fileExists(path.join(sourceDir, defaultPopup)))) {
    errors.push(`Action popup file "${defaultPopup}" is missing.`);
  }

  const sidePanelPath = manifest.side_panel?.default_path;
  if (!sidePanelPath) {
    errors.push('side_panel.default_path is required for the Evidence Board.');
  } else if (!(await fileExists(path.join(sourceDir, sidePanelPath)))) {
    errors.push(`Evidence Board side panel file "${sidePanelPath}" is missing.`);
  }

  const managedSchema = manifest.storage?.managed_schema;
  if (!managedSchema) {
    errors.push('storage.managed_schema is required for enterprise policy support.');
  } else if (!(await fileExists(path.join(sourceDir, managedSchema)))) {
    errors.push(`Managed storage schema "${managedSchema}" is missing.`);
  } else {
    try {
      JSON.parse(await readFile(path.join(sourceDir, managedSchema), 'utf8'));
    } catch (error) {
      errors.push(`Managed storage schema is not valid JSON: ${error.message}`);
    }
  }

  const defaultIcon = manifest.action?.default_icon;
  for (const icon of typeof defaultIcon === 'string' ? [defaultIcon] : Object.values(defaultIcon ?? {})) {
    if (!(await fileExists(path.join(sourceDir, icon)))) errors.push(`Action icon ${icon} is missing.`);
  }

  const icons = manifest.icons ?? {};
  for (const [size, iconPath] of Object.entries(icons)) {
    if (!(await fileExists(path.join(sourceDir, iconPath)))) {
      errors.push(`Icon for size ${size}px is missing at path "${iconPath}".`);
    }
  }

  const scriptsToCheck = new Set([
    'aiDestinations.js',
    'configuration.js',
    'content_script.js',
    'googleMeetContentScript.js',
    'googleMeetProvider.js',
    'privacyScrubber.js',
    'providerRegistry.js',
    'managed-schema.json',
    'popup.html',
    'popup.js',
    'service_worker.js',
    'teamsCaptionBuffer.js',
    'sessionManager.js',
    'evidenceBoard.js',
    'sidepanel.css',
    'sidepanel.html',
    'sidepanel.js',
    'theme.css',
    'theme.js',
    'viewer.html',
    'viewer.js',
    'zoomContentScript.js',
    'zoomProvider.js'
  ]);

  for (const script of scriptsToCheck) {
    if (!(await fileExists(path.join(sourceDir, script)))) {
      errors.push(`Expected file "${script}" was not found in the extension directory.`);
    }
  }

  const declaredContentScripts = (manifest.content_scripts ?? []).flatMap(entry => entry.js ?? []);
  if (declaredContentScripts[0] !== 'providerRegistry.js') {
    errors.push('providerRegistry.js must load before provider content scripts.');
  }
  if (declaredContentScripts[1] !== 'configuration.js') {
    errors.push('configuration.js must load before the Teams content script.');
  }
  if (declaredContentScripts[2] !== 'transcriptInsights.js') {
    errors.push('transcriptInsights.js must load before the Teams content script.');
  }
  if (declaredContentScripts[3] !== 'teamsCaptionBuffer.js') {
    errors.push('teamsCaptionBuffer.js must load before the Teams content script.');
  }
  const googleMeetScripts = (manifest.content_scripts ?? [])
    .find(entry => (entry.matches ?? []).includes('https://meet.google.com/*'))?.js ?? [];
  const expectedGoogleMeetScripts = ['providerRegistry.js', 'configuration.js', 'captureCoordinator.js', 'transcriptInsights.js', 'googleMeetProvider.js', 'googleMeetContentScript.js'];
  if (JSON.stringify(googleMeetScripts) !== JSON.stringify(expectedGoogleMeetScripts)) {
    errors.push(`Google Meet content scripts must load in this order: ${expectedGoogleMeetScripts.join(', ')}.`);
  }
  const zoomEntry = (manifest.content_scripts ?? [])
    .find(entry => (entry.matches ?? []).includes('https://app.zoom.us/wc/*'));
  const zoomScripts = zoomEntry?.js ?? [];
  const expectedZoomScripts = ['providerRegistry.js', 'configuration.js', 'captureCoordinator.js', 'transcriptInsights.js', 'zoomProvider.js', 'zoomContentScript.js'];
  if (JSON.stringify(zoomScripts) !== JSON.stringify(expectedZoomScripts)) {
    errors.push(`Zoom content scripts must load in this order: ${expectedZoomScripts.join(', ')}.`);
  }
  if (zoomEntry?.all_frames !== true) {
    errors.push('Zoom content scripts must run in all frames so the embedded Web client can expose its caption DOM.');
  }
  for (const script of declaredContentScripts) {
    if (!scriptsToCheck.has(script) && !(await fileExists(path.join(sourceDir, script)))) {
      warnings.push(`Content script "${script}" declared in manifest is missing.`);
    }
  }

  return { errors, warnings };
}

async function main() {
  let manifestRaw;
  try {
    manifestRaw = await readFile(manifestPath, 'utf8');
  } catch (error) {
    console.error(`Unable to read manifest.json: ${error.message}`);
    process.exitCode = 1;
    return;
  }

  let manifest;
  try {
    manifest = JSON.parse(manifestRaw);
  } catch (error) {
    console.error(`manifest.json is not valid JSON: ${error.message}`);
    process.exitCode = 1;
    return;
  }

  const { errors, warnings } = await validateManifest(manifest);

  if (errors.length > 0) {
    console.error('Extension validation failed:');
    console.error(formatList(errors));
    process.exitCode = 1;
  } else {
    console.log('Extension validation passed.');
  }

  if (warnings.length > 0) {
    console.warn('\nWarnings:');
    console.warn(formatList(warnings));
  }
}

main().catch(error => {
  console.error(`Unexpected error during validation: ${error.message}`);
  process.exitCode = 1;
});
