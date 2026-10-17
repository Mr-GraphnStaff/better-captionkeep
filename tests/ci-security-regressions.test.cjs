const {test} = require('node:test');
const assert = require('node:assert/strict');
const {readFileSync} = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const prototypeSource = readFileSync(path.resolve(__dirname,'../prototypes/v6-wireframe/working-model.js'),'utf8');
function workingModel(crypto) {
    const records = new Map();
    const context = vm.createContext({crypto,Date,Uint8Array,
        Math:{...Math,random() {throw new Error('Insecure randomness must never be used');}},
        localStorage:{getItem:key => records.get(key) ?? null,
            setItem:(key,value) => records.set(key,value),removeItem:key => records.delete(key)}});
    vm.runInContext(prototypeSource,context);
    return context.CaptionKeepWorkingModel;
}

test('prototype session identifiers use UUID when available', () => {
    const model = workingModel({randomUUID:() => '12345678-1234-4234-8234-123456789abc'});
    assert.equal(model.start().id,'session-12345678-1234-4234-8234-123456789abc');
});

test('prototype secure-context fallback uses 128 cryptographic bits, never Math.random', () => {
    let calls = 0;
    const model = workingModel({getRandomValues(bytes) {
        assert.equal(bytes.length,16);
        bytes.fill(++calls);
        return bytes;
    }});
    assert.equal(model.start().id,'session-'+'01'.repeat(16));
    assert.equal(model.start().id,'session-'+'02'.repeat(16));
    assert.equal(calls,2);
});

test('prototype refuses new identifiers without secure randomness', () => {
    assert.throws(() => workingModel(undefined).start(), /Secure random identifiers are unavailable/);
    assert.throws(() => workingModel({}).start(), /Secure random identifiers are unavailable/);
});

test('surface audit checks visible text tokens without treating SVG-only buttons as named', async () => {
    const {hasVisibleButtonText} = await import('../scripts/audit-extension-surfaces.mjs');
    assert.equal(hasVisibleButtonText(' <span>Save</span> '),true);
    assert.equal(hasVisibleButtonText('<svg><title>Decorative icon</title></svg>'),false);
    assert.equal(hasVisibleButtonText(' <svg><path d="M0 0"></path></svg> <span>Copy</span>'),true);
    assert.equal(hasVisibleButtonText('<span> </span>'),false);
});
