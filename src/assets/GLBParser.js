/** glTF 2.0 binary container reader. The JSON and BIN payloads are never interpreted as code. */
const GLB_MAGIC = 0x46546c67;
const JSON_CHUNK = 0x4e4f534a;
const BIN_CHUNK = 0x004e4942;
const MAX_GLB_BYTES = 256 * 1024 * 1024;

export function parseGLB(input) {
  const bytes = input instanceof ArrayBuffer ? new Uint8Array(input)
    : ArrayBuffer.isView(input) ? new Uint8Array(input.buffer, input.byteOffset, input.byteLength) : null;
  if (!bytes) throw new TypeError('GLB source must be an ArrayBuffer or typed array');
  if (bytes.byteLength < 20 || bytes.byteLength > MAX_GLB_BYTES) throw new RangeError('Invalid GLB size');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.getUint32(0, true) !== GLB_MAGIC) throw new Error('Invalid GLB magic; expected glTF');
  if (view.getUint32(4, true) !== 2) throw new Error('Only GLB version 2 is supported');
  if (view.getUint32(8, true) !== bytes.byteLength) throw new Error('GLB header length mismatch');
  let cursor = 12, json = null, bin = null, chunkNumber = 0;
  while (cursor < bytes.byteLength) {
    if (bytes.byteLength - cursor < 8) throw new Error('Truncated GLB chunk header');
    const length = view.getUint32(cursor, true);
    const type = view.getUint32(cursor + 4, true);
    cursor += 8;
    if ((length & 3) !== 0 || cursor + length > bytes.byteLength) {
      throw new Error('Invalid or truncated GLB chunk length');
    }
    if (chunkNumber === 0 && type !== JSON_CHUNK) throw new Error('First GLB chunk must contain JSON');
    const payload = bytes.subarray(cursor, cursor + length);
    if (type === JSON_CHUNK) {
      if (json !== null || chunkNumber !== 0) throw new Error('Duplicate or misplaced GLB JSON chunk');
      const decoded = new TextDecoder('utf-8', { fatal: true }).decode(payload).replace(/[\x00\x20\t\r\n]+$/g, '');
      try { json = JSON.parse(decoded); } catch (error) { throw new Error(`Invalid GLB JSON: ${error.message}`); }
    } else if (type === BIN_CHUNK) {
      if (bin !== null) throw new Error('Duplicate GLB BIN chunk');
      bin = payload;
    }
    // Ignore future unknown chunk types per GLB forward-compatibility rules.
    cursor += length;
    chunkNumber++;
  }
  if (json === null) throw new Error('GLB is missing JSON');
  return { json, binaryChunk: bin };
}
