import re2Wasm from 're2-wasm/build/wasm/re2.js';

// Chromium compiles managed-storage patterns with RE2, not JavaScript RegExp.
// This is build tooling only; the WASM compiler is never shipped in the extension.
export function validateManagedSchemaPatterns(schema) {
  const errors=[];
  function visit(value,location){
    if(!value||typeof value!=='object')return;
    if(Object.hasOwn(value,'pattern')){
      let compiled;
      try{
        // The package's public RegExp wrapper translates JavaScript \u escapes
        // before compilation. Chromium receives the raw schema, so bypass that
        // translator and compile the exact bytes with the pinned WASM engine.
        compiled=new re2Wasm.WrappedRE2(value.pattern,false,false,false);
        if(!compiled.ok())throw new Error(compiled.error());
      }
      catch(error){errors.push(`${location}.pattern is not supported by Chromium RE2: ${error.message}`);}
      finally{compiled?.delete?.();}
    }
    for(const [key,child] of Object.entries(value))visit(child,`${location}.${key}`);
  }
  visit(schema,'managed-schema');
  return errors;
}
