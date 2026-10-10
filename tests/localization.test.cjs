const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const extensionRoot = path.join(root, 'teams-captions-saver');
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8');

test('source and Store manifests use one MV3 localization contract', () => {
  for (const relative of ['teams-captions-saver/manifest.json', 'manifests/manifest.chrome-store.json']) {
    const manifest = JSON.parse(read(relative));
    assert.equal(manifest.manifest_version, 3);
    assert.equal(manifest.default_locale, 'en');
    assert.equal(manifest.name, '__MSG_extensionName__');
    assert.equal(manifest.description, '__MSG_extensionDescription__');
    assert.equal(manifest.action.default_title, '__MSG_actionTitle__');
  }
});

test('global preview catalogs preserve exact English key and placeholder parity', () => {
  const localeRoot = path.join(extensionRoot, '_locales');
  const locales = fs.readdirSync(localeRoot).filter(name => fs.statSync(path.join(localeRoot, name)).isDirectory()).sort();
  assert.equal(locales.length, 38);
  for (const expected of ['ar','bn','de','es_419','fa','fil','fr','gu','he','hi','ja','kn','ko','ml','mr','pt_BR','ta','te','zh_CN','zh_TW']) {
    assert(locales.includes(expected), expected);
  }
  const english = JSON.parse(fs.readFileSync(path.join(localeRoot, 'en', 'messages.json'), 'utf8'));
  const englishKeys = Object.keys(english).sort();
  assert.equal(english.localizationQuality.message, 'reviewed');
  for (const locale of locales.filter(value => value !== 'en')) {
    const catalog = JSON.parse(fs.readFileSync(path.join(localeRoot, locale, 'messages.json'), 'utf8'));
    assert.deepEqual(Object.keys(catalog).sort(), englishKeys, locale);
    assert.equal(catalog.localizationQuality.message, 'preview', locale);
    for (const [key, record] of Object.entries(catalog)) {
      assert.equal(typeof record.message, 'string', `${locale}:${key}`);
      assert(record.message.trim(), `${locale}:${key}`);
      assert(!/<script|javascript:/i.test(record.message), `${locale}:${key}`);
      const expectedPlaceholders = [...english[key].message.matchAll(/\$\d+/g)].map(match => match[0]).sort();
      const actualPlaceholders = [...record.message.matchAll(/\$\d+/g)].map(match => match[0]).sort();
      assert.deepEqual(actualPlaceholders, expectedPlaceholders, `${locale}:${key}`);
    }
  }
});

test('extension surfaces load localization and expose a private-by-default feedback center', () => {
  for (const page of ['popup.html','viewer.html','sidepanel.html','export.html','extras.html','handoff.html','settings.html','platform-coming-soon.html']) {
    assert(read(`teams-captions-saver/${page}`).includes('localization.js'), page);
  }
  const popup = read('teams-captions-saver/popup.html');
  assert(popup.includes('id="uiLocaleSelect"'));
  assert(popup.includes('template=bug_report.yml'));
  assert(popup.includes('template=feature_request.yml'));
  assert(popup.includes('template=localization_report.yml'));
  const helper = read('teams-captions-saver/localization.js');
  assert(helper.includes('localization-preview-notice'));
  assert(helper.includes('template=localization_report.yml'));
  assert(!helper.includes('transcriptArray'));
});

test('managed language wins over the user choice and unsupported values are rejected', () => {
  const source = read('teams-captions-saver/configuration.js');
  assert(source.includes("'forceUiLocale'"));
  assert(source.includes("locked.add('uiLocale')"));
  const schema = JSON.parse(read('teams-captions-saver/managed-schema.json'));
  assert.equal(schema.properties.forceUiLocale.type, 'string');
});

test('feedback forms are task-specific and prohibit meeting data disclosure', () => {
  for (const template of ['bug_report.yml','feature_request.yml','localization_report.yml']) {
    const form = read(`.github/ISSUE_TEMPLATE/${template}`);
    assert.match(form, /meeting/i, template);
    assert.match(form, /participant/i, template);
    assert.match(form, /credential/i, template);
  }
});
