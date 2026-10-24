import {NativeDecoder, encodeNative} from './framing.mjs';

// Embedding entrypoint only: installer, native caller verification and credential
// provisioning are deliberately not provided by this prototype.
export function serveNative(input, output, helper) {
  const decoder = new NativeDecoder();
  const pending = new Set();
  let failed = false;
  function close() {
    if(failed) return;
    failed=true;
    // EOF/error revokes consent immediately, not after pending provider awaits.
    // Helper close sets its denial/abort flags synchronously before any await.
    try {void Promise.resolve(helper.close?.()).catch(()=>{});} catch {}
    input.destroy();output.end();
  }
  input.on('data', chunk => {
    if (failed) return;
    let messages;
    try {messages = decoder.push(chunk);} catch {close();return;}
    for (const message of messages) {
      if (pending.size >= 8) {close();return;}
      const operation = Promise.resolve().then(() => helper.handle(message)).then(
        result => ({version:1,requestId:message.requestId,ok:true,result}),
        () => ({version:1,requestId:typeof message.requestId === 'string' ? message.requestId : '',ok:false,error:'request-rejected'})
      ).then(reply => {if (!failed) output.write(encodeNative(reply));}).catch(() => {
        close();
      }).finally(() => pending.delete(operation));
      pending.add(operation);
    }
  });
  input.on('end', () => {
    try {decoder.end();} catch {}
    close();
  });
  input.on('error',close);input.on('close',close);
  output.on('error',close);output.on('close',close);
  return Object.freeze({close});
}
