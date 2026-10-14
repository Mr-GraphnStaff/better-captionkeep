export const MAX_NATIVE_BYTES = 98304;
export const MAX_NATIVE_RESPONSE_BYTES = 1048576;
export function encodeNative(value) {
  const payload = Buffer.from(JSON.stringify(value));
  if (!payload.length || payload.length > MAX_NATIVE_RESPONSE_BYTES) throw new Error('native-limit');
  const header = Buffer.alloc(4); header.writeUInt32LE(payload.length);
  return Buffer.concat([header, payload]);
}
export class NativeDecoder {
  #buffer = Buffer.alloc(0);
  push(chunk) {
    // Limit one input chunk too; never buffer an attacker-controlled giant frame.
    if (!Buffer.isBuffer(chunk) || chunk.length > MAX_NATIVE_BYTES + 4) throw new Error('native-limit');
    this.#buffer = Buffer.concat([this.#buffer, chunk]);
    const messages = [];
    while (this.#buffer.length >= 4) {
      const size = this.#buffer.readUInt32LE();
      if (!size || size > MAX_NATIVE_BYTES) {this.#buffer = Buffer.alloc(0); throw new Error('native-limit');}
      if (this.#buffer.length < size + 4) break;
      messages.push(JSON.parse(this.#buffer.subarray(4, size + 4).toString('utf8')));
      this.#buffer = this.#buffer.subarray(size + 4);
    }
    return messages;
  }
  end() {if (this.#buffer.length) throw new Error('native-truncated');}
}
