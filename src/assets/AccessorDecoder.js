/** Converts glTF little-endian, potentially interleaved accessors to CPU-side arrays. */
const COMPONENT = new Map([
  [5120, { bytes: 1, read: 'getInt8', denominator: 127 }],
  [5121, { bytes: 1, read: 'getUint8', denominator: 255 }],
  [5122, { bytes: 2, read: 'getInt16', denominator: 32767 }],
  [5123, { bytes: 2, read: 'getUint16', denominator: 65535 }],
  [5125, { bytes: 4, read: 'getUint32' }],
  [5126, { bytes: 4, read: 'getFloat32' }]
]);
const WIDTH = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 };
const MAX_ELEMENTS = 3_000_000;
const uint = (value) => Number.isSafeInteger(value) && value >= 0;

export function decodeAccessor(document, buffers, index, { asIndices = false } = {}) {
  const accessor = document.accessors?.[index];
  if (!accessor || !uint(accessor.count) || accessor.count === 0 || accessor.count > MAX_ELEMENTS) {
    throw new Error(`Invalid or oversized glTF accessor ${index}`);
  }
  if (accessor.sparse !== undefined) throw new Error(`Sparse accessors are not supported (accessor ${index})`);
  const width = WIDTH[accessor.type], component = COMPONENT.get(accessor.componentType);
  if (!width || !component) throw new Error(`Unsupported accessor type/component: ${index}`);
  if (accessor.normalized && (accessor.componentType === 5125 || accessor.componentType === 5126)) {
    throw new Error(`Invalid normalized accessor ${index}`);
  }
  if (asIndices && (accessor.type !== 'SCALAR' || ![5121, 5123, 5125].includes(accessor.componentType) || accessor.normalized)) {
    throw new Error(`Invalid triangle indices accessor ${index}`);
  }
  const output = asIndices
    ? new (accessor.componentType === 5125 ? Uint32Array : Uint16Array)(accessor.count)
    : new Float32Array(accessor.count * width);
  if (accessor.bufferView === undefined) {
    if (accessor.byteOffset !== undefined) throw new Error(`Accessor ${index} has offset without a buffer view`);
    if (asIndices) throw new Error('Index accessors require a buffer view');
    return output; // glTF permits zero-initialized accessor data.
  }
  const bufferView = document.bufferViews?.[accessor.bufferView];
  if (!bufferView || !uint(bufferView.buffer) || !uint(bufferView.byteLength) ||
      !uint(bufferView.byteOffset ?? 0) || !uint(accessor.byteOffset ?? 0)) {
    throw new Error(`Malformed buffer view for accessor ${index}`);
  }
  const raw = buffers[bufferView.buffer];
  if (!(raw instanceof Uint8Array)) throw new Error(`Missing binary buffer for accessor ${index}`);
  const start = bufferView.byteOffset ?? 0;
  if (start + bufferView.byteLength > raw.byteLength) throw new Error(`Buffer view outside binary data (accessor ${index})`);
  const elementSize = width * component.bytes;
  const stride = bufferView.byteStride ?? elementSize;
  const relativeOffset = accessor.byteOffset ?? 0;
  if (!uint(stride) || stride < elementSize || stride % component.bytes !== 0 ||
      relativeOffset % component.bytes !== 0 || (asIndices && stride !== elementSize) ||
      relativeOffset + (accessor.count - 1) * stride + elementSize > bufferView.byteLength) {
    throw new Error(`Accessor ${index} exceeds its buffer view or has invalid alignment/stride`);
  }
  const reader = new DataView(raw.buffer, raw.byteOffset + start + relativeOffset,
    bufferView.byteLength - relativeOffset);
  for (let i = 0; i < accessor.count; i++) {
    for (let c = 0; c < width; c++) {
      const value = reader[component.read](i * stride + c * component.bytes, true);
      const normalized = accessor.normalized
        ? (accessor.componentType === 5120 || accessor.componentType === 5122
          ? Math.max(value / component.denominator, -1)
          : value / component.denominator)
        : value;
      if (!Number.isFinite(normalized)) throw new Error(`Nonfinite accessor value at ${index}`);
      output[i * width + c] = normalized;
    }
  }
  return output;
}
