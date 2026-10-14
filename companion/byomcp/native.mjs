import {NativeDecoder, encodeNative} from './framing.mjs';

// Embedding entrypoint only: installer, native caller verification and credential
// provisioning are deliberately not provided by this prototype.
export function serveNative(input, output, helper) {
  const decoder = new NativeDecoder();
  const pending = new Set();
  let failed = false;
  input.on('data', chunk => {
    if (failed) return;
    let messages;
    try {messages = decoder.push(chunk);} catch {failed = true; input.destroy(); output.end(); return;}
    for (const message of messages) {
      if (pending.size >= 8) {failed = true; input.destroy(); output.end(); return;}
      const operation = Promise.resolve().then(() => helper.handle(message)).then(
        result => ({version:1,requestId:message.requestId,ok:true,result}),
        () => ({version:1,requestId:typeof message.requestId === 'string' ? message.requestId : '',ok:false,error:'request-rejected'})
      ).then(reply => {if (!failed) output.write(encodeNative(reply));}).catch(() => {
        failed = true; input.destroy(); output.end();
      }).finally(() => pending.delete(operation));
      pending.add(operation);
    }
  });
  input.on('end', () => {
    try {decoder.end();} catch {failed = true;}
    void Promise.allSettled([...pending]).then(() => output.end());
  });
  return Object.freeze({close() {failed = true; input.destroy(); output.end();}});
}
