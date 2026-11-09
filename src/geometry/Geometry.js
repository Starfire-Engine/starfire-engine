/**
 * Geometry owns CPU-side vertex attributes. Renderers currently consume POSITION,
 * NORMAL, and TEXCOORD_0; additional attributes are preserved for future passes.
 * Mutate attribute arrays only with markDirty(), so GPU caches can refresh.
 */
const SEMANTICS = { POSITION: 3, NORMAL: 3, TEXCOORD_0: 2 };
const ALIASES = { position: 'POSITION', normal: 'NORMAL', uv: 'TEXCOORD_0' };

export class Geometry {
  constructor({ attributes, indices } = {}) {
    if (!attributes || typeof attributes !== 'object') throw new TypeError('Geometry requires attributes');
    this.attributes = new Map();
    this.version = 0;
    for (const [key, value] of Object.entries(attributes)) {
      const semantic = ALIASES[key] ?? key;
      if (this.attributes.has(semantic)) throw new Error(`Duplicate attribute: ${semantic}`);
      const array = value instanceof Float32Array ? value : value?.array;
      const size = value instanceof Float32Array ? SEMANTICS[semantic] : value?.itemSize;
      if (!(array instanceof Float32Array) || !Number.isInteger(size) || size < 1 || size > 4) {
        throw new TypeError(`Attribute ${semantic} requires Float32Array data and itemSize from 1 to 4`);
      }
      if (SEMANTICS[semantic] && SEMANTICS[semantic] !== size) {
        throw new RangeError(`Attribute ${semantic} requires itemSize=${SEMANTICS[semantic]}`);
      }
      if (array.length === 0 || array.length % size !== 0) throw new RangeError(`Invalid length for ${semantic}`);
      this.attributes.set(semantic, { array, itemSize: size });
    }
    const positions = this.attributes.get('POSITION');
    if (!positions) throw new TypeError('Geometry requires POSITION');
    this.vertexCount = positions.array.length / positions.itemSize;
    for (const [name, attribute] of this.attributes) {
      if (attribute.array.length / attribute.itemSize !== this.vertexCount) {
        throw new RangeError(`Attribute ${name} has a different vertex count`);
      }
    }
    if (indices === undefined) {
      // The index type is selected from the vertex count, not the number of triangles.
      if (this.vertexCount % 3) throw new RangeError('Unindexed triangles require a multiple of three vertices');
      const Type = this.vertexCount > 65536 ? Uint32Array : Uint16Array;
      this.indices = Type.from({ length: this.vertexCount }, (_, index) => index);
    } else {
      if (!(indices instanceof Uint16Array || indices instanceof Uint32Array)) {
        throw new TypeError('Indices must be Uint16Array or Uint32Array');
      }
      if (!indices.length || indices.length % 3 !== 0) throw new RangeError('Triangle indices must be nonempty and divisible by three');
      for (const i of indices) if (i >= this.vertexCount) throw new RangeError(`Index ${i} is outside geometry bounds`);
      this.indices = indices;
    }
  }
  getAttribute(name) { return this.attributes.get(ALIASES[name] ?? name); }
  markDirty() { this.version++; return this; }
  /** Packed position/normal/UV layout: 8 float32 values per vertex. */
  packedVertices() {
    const out = new Float32Array(this.vertexCount * 8);
    const position = this.getAttribute('POSITION').array;
    const normal = this.getAttribute('NORMAL')?.array;
    const uv = this.getAttribute('TEXCOORD_0')?.array;
    for (let i = 0; i < this.vertexCount; i++) {
      const src3 = i * 3, src2 = i * 2, dst = i * 8;
      out.set(position.subarray(src3, src3 + 3), dst);
      if (normal) out.set(normal.subarray(src3, src3 + 3), dst + 3);
      else out[dst + 4] = 1; // Default up normal, until normal generation is supported.
      if (uv) out.set(uv.subarray(src2, src2 + 2), dst + 6);
    }
    return out;
  }
}

/** Preserve support for 0.1.x interleaved position/normal meshes. */
export function prepareGeometry(geometry) {
  if (geometry instanceof Geometry) {
    return { vertices: geometry.packedVertices(), indices: geometry.indices };
  }
  if (!(geometry?.vertices instanceof Float32Array) ||
      !(geometry?.indices instanceof Uint16Array || geometry.indices instanceof Uint32Array)) {
    throw new TypeError('Expected Geometry or legacy typed-array mesh geometry');
  }
  if (geometry.vertices.length === 0 || geometry.vertices.length % 6 !== 0 ||
      geometry.indices.length === 0 || geometry.indices.length % 3 !== 0) {
    throw new RangeError('Invalid legacy geometry lengths');
  }
  const vertexCount = geometry.vertices.length / 6;
  for (const index of geometry.indices) if (index >= vertexCount) throw new RangeError('Legacy geometry index out of bounds');
  const packed = new Float32Array(vertexCount * 8);
  for (let i = 0; i < vertexCount; i++) {
    packed.set(geometry.vertices.subarray(i * 6, i * 6 + 6), i * 8);
  }
  return { vertices: packed, indices: geometry.indices };
}
