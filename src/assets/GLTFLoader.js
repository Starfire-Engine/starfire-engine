import { Scene } from '../core/Scene.js';
import { Entity } from '../core/Entity.js';
import { Geometry } from '../geometry/Geometry.js';
import { Mesh } from '../graphics/Mesh.js';
import { PBRMaterial } from '../graphics/PBRMaterial.js';
import { Texture2D } from '../graphics/Texture2D.js';
import { TextureSampler } from '../graphics/TextureSampler.js';
import { decodeAccessor } from './AccessorDecoder.js';
import { parseGLB } from './GLBParser.js';

const MAX_RESOURCE_SIZE = 256 * 1024 * 1024;
const MAX_IMAGE_SIZE = 32 * 1024 * 1024;
const allowedMime = new Set(['image/png', 'image/jpeg']);
const nonnegativeInt = value => Number.isSafeInteger(value) && value >= 0;
const finiteArray = (v, n) => Array.isArray(v) && v.length === n && v.every(Number.isFinite);

function decodeDataURI(uri) {
  const match = /^data:([^;,]*)(;base64)?,([\s\S]*)$/i.exec(uri);
  if (!match) throw new Error('Malformed data URI in glTF asset');
  if (match[2]) {
    const raw = atob(match[3]);
    if (raw.length > MAX_RESOURCE_SIZE) throw new RangeError('Data URI is too large');
    return { mime: match[1].toLowerCase(), bytes: Uint8Array.from(raw, char => char.charCodeAt(0)) };
  }
  // Percent escapes in a data URI represent raw bytes, not necessarily UTF-8 text.
  const encoded = match[3], out = [];
  for (let i = 0; i < encoded.length; i++) {
    if (encoded[i] === '%') {
      if (!/^[0-9a-f]{2}$/i.test(encoded.slice(i + 1, i + 3))) throw new Error('Malformed data URI escape');
      out.push(parseInt(encoded.slice(i + 1, i + 3), 16)); i += 2;
    } else {
      const n = encoded.charCodeAt(i);
      if (n > 127) throw new Error('Non-ASCII bytes must be percent-encoded in data URIs');
      out.push(n);
    }
    if (out.length > MAX_RESOURCE_SIZE) throw new RangeError('Data URI is too large');
  }
  return { mime: match[1].toLowerCase(), bytes: new Uint8Array(out) };
}

function bufferViewBytes(document, buffers, index) {
  const view = document.bufferViews?.[index];
  if (!view || !nonnegativeInt(view.buffer) || !nonnegativeInt(view.byteOffset ?? 0) ||
      !nonnegativeInt(view.byteLength)) throw new Error(`Invalid bufferView ${index}`);
  const bytes = buffers[view.buffer];
  const start = view.byteOffset ?? 0;
  if (!bytes || start + view.byteLength > bytes.length) throw new Error(`bufferView ${index} exceeds buffer data`);
  return bytes.subarray(start, start + view.byteLength);
}

async function readResource(uri, baseURL, fetcher, limit = MAX_RESOURCE_SIZE) {
  if (typeof uri !== 'string' || !uri.length) throw new Error('glTF resource URI is missing');
  if (uri.startsWith('data:')) {
    const value = decodeDataURI(uri);
    if (value.bytes.length > limit) throw new RangeError('glTF resource is too large');
    return value;
  }
  if (!baseURL) throw new Error('External glTF resources require a baseURL');
  const resolved = new URL(uri, baseURL);
  if (!['http:', 'https:'].includes(resolved.protocol)) throw new Error(`Unsupported glTF resource protocol: ${resolved.protocol}`);
  if (typeof fetcher !== 'function') throw new Error('A fetch implementation is required for external glTF resources');
  const response = await fetcher(resolved.href);
  if (!response.ok) throw new Error(`Asset request failed (${response.status}): ${resolved.href}`);
  const headerSize = Number(response.headers?.get?.('content-length'));
  if (Number.isFinite(headerSize) && headerSize > limit) throw new RangeError('glTF resource exceeds maximum size');
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.byteLength > limit) throw new RangeError('glTF resource exceeds maximum size');
  return { bytes, mime: response.headers?.get?.('content-type')?.split(';')[0]?.toLowerCase() ?? '' };
}

function validateDocument(doc) {
  if (!doc || typeof doc !== 'object' || !/^2\./.test(doc.asset?.version ?? '')) {
    throw new Error('Only glTF 2.0 assets are supported');
  }
  if (doc.extensionsRequired?.length) {
    throw new Error(`Unsupported required glTF extensions: ${doc.extensionsRequired.join(', ')}`);
  }
}

function autoNormals(positions, indices) {
  const normals = new Float32Array(positions.length);
  for (let i = 0; i < indices.length; i += 3) {
    const a = indices[i] * 3, b = indices[i + 1] * 3, c = indices[i + 2] * 3;
    const ab = [positions[b]-positions[a], positions[b+1]-positions[a+1], positions[b+2]-positions[a+2]];
    const ac = [positions[c]-positions[a], positions[c+1]-positions[a+1], positions[c+2]-positions[a+2]];
    const cross = [ab[1]*ac[2]-ab[2]*ac[1], ab[2]*ac[0]-ab[0]*ac[2], ab[0]*ac[1]-ab[1]*ac[0]];
    for (const vertex of [a,b,c]) for (let k=0; k<3; k++) normals[vertex+k] += cross[k];
  }
  for (let i=0; i<normals.length; i+=3) {
    const len = Math.hypot(normals[i], normals[i+1], normals[i+2]);
    if (len > 1e-10) for (let k=0; k<3; k++) normals[i+k] /= len;
    else normals[i+1] = 1;
  }
  return normals;
}

function gltfSampler(input = {}) {
  const wraps = { 10497: 'repeat', 33071: 'clamp-to-edge', 33648: 'mirror-repeat' };
  const filters = { 9728: 'nearest', 9729: 'linear', 9984: 'nearest', 9985: 'linear', 9986: 'nearest', 9987: 'linear' };
  const wrapU = wraps[input.wrapS ?? 10497], wrapV = wraps[input.wrapT ?? 10497];
  const minFilter = filters[input.minFilter ?? 9729], magFilter = filters[input.magFilter ?? 9729];
  if (!wrapU || !wrapV || !minFilter || !magFilter || (input.magFilter && ![9728,9729].includes(input.magFilter))) {
    throw new Error('Unsupported glTF texture sampler');
  }
  return new TextureSampler({ wrapU, wrapV, minFilter, magFilter });
}

export class GLTFLoader {
  constructor({ fetcher = globalThis.fetch, imageDecoder = globalThis.createImageBitmap } = {}) {
    this.fetcher = fetcher;
    this.imageDecoder = imageDecoder;
  }
  /** Fetch a .glb or .gltf URL; external resources resolve relative to this URL. */
  async load(url, options = {}) {
    if (typeof url !== 'string' || !url.length) throw new TypeError('A glTF URL is required');
    const baseURL = new URL(url, globalThis.location?.href).href;
    const { bytes } = await readResource(baseURL, baseURL, this.fetcher);
    return this.parse(bytes, { ...options, baseURL });
  }
  /** Parse GLB binary bytes or an already-decoded glTF JSON object. */
  async parse(source, { baseURL = null, sceneIndex = undefined } = {}) {
    let document, binaryChunk = null;
    if (source instanceof ArrayBuffer || ArrayBuffer.isView(source)) {
      const bytes = source instanceof ArrayBuffer ? new Uint8Array(source)
        : new Uint8Array(source.buffer, source.byteOffset, source.byteLength);
      if (bytes.byteLength >= 4 && new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(0,true) === 0x46546c67) {
        ({ json: document, binaryChunk } = parseGLB(bytes));
      } else {
        if (bytes.byteLength > MAX_RESOURCE_SIZE) throw new RangeError('glTF JSON too large');
        document = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
      }
    } else if (source && typeof source === 'object') {
      document = source;
    } else throw new TypeError('Expected GLB bytes or a glTF document object');
    validateDocument(document);
    const buffers = [];
    for (let i = 0; i < (document.buffers?.length ?? 0); i++) {
      const buffer = document.buffers[i];
      if (!nonnegativeInt(buffer.byteLength) || buffer.byteLength > MAX_RESOURCE_SIZE) throw new Error(`Invalid glTF buffer ${i}`);
      let bytes;
      if (buffer.uri !== undefined) {
        ({ bytes } = await readResource(buffer.uri, baseURL, this.fetcher));
      } else {
        if (i !== 0 || !binaryChunk) throw new Error(`Buffer ${i} lacks a URI or GLB binary chunk`);
        bytes = binaryChunk;
        if (bytes.length > buffer.byteLength + 3) throw new Error('Unexpected GLB BIN padding');
      }
      if (bytes.byteLength < buffer.byteLength) throw new Error(`Truncated glTF buffer ${i}`);
      buffers.push(bytes.subarray(0, buffer.byteLength));
    }
    const warnings = [];
    const imageCache = new Map(), textureCache = new Map(), materialCache = new Map(), meshCache = new Map();
    const decoder = this.imageDecoder;
    try {

    const getTexture = async (info, colorSpace) => {
      if (info === undefined || info === null) return null;
      if (!nonnegativeInt(info.index) || (info.texCoord ?? 0) !== 0 || info.extensions) {
        throw new Error('Only TEXCOORD_0 textures without extensions are supported');
      }
      const gltfTexture = document.textures?.[info.index];
      if (!gltfTexture || !nonnegativeInt(gltfTexture.source) || gltfTexture.extensions) {
        throw new Error(`Invalid or unsupported glTF texture ${info.index}`);
      }
      const sampler = gltfSampler(gltfTexture.sampler === undefined ? {} : document.samplers?.[gltfTexture.sampler]);
      if (gltfTexture.sampler !== undefined && !document.samplers?.[gltfTexture.sampler]) {
        throw new Error('glTF texture sampler index is invalid');
      }
      const samplerSpec = gltfTexture.sampler === undefined ? {} : document.samplers[gltfTexture.sampler];
      if (gltfTexture.sampler === undefined || [9984,9985,9986,9987].includes(samplerSpec.minFilter)) {
        if (!warnings.includes('Mipmapped minification is approximated using a single texture level.')) {
          warnings.push('Mipmapped minification is approximated using a single texture level.');
        }
      }
      const key = `${gltfTexture.source}:${colorSpace}`;
      if (!textureCache.has(key)) {
        const image = document.images?.[gltfTexture.source];
        if (!image || image.extensions) throw new Error(`Invalid glTF image ${gltfTexture.source}`);
        if (!imageCache.has(gltfTexture.source)) {
          let bytes, mime;
          if (image.bufferView !== undefined) {
            bytes = bufferViewBytes(document, buffers, image.bufferView);
            mime = image.mimeType;
          } else if (image.uri !== undefined) {
            ({ bytes, mime } = await readResource(image.uri, baseURL, this.fetcher, MAX_IMAGE_SIZE));
            mime = image.mimeType ?? mime;
          } else throw new Error('glTF image needs a URI or bufferView');
          // Some servers return octet-stream for PNG/JPEG resources. Their file
          // signature is authoritative if the glTF image has no explicit mimeType.
          if (!allowedMime.has(mime) && image.mimeType === undefined) {
            if (bytes.length >= 8 && bytes[0] === 137 && bytes[1] === 80 && bytes[2] === 78 && bytes[3] === 71) mime = 'image/png';
            else if (bytes.length >= 3 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) mime = 'image/jpeg';
          }
          if (!allowedMime.has(mime)) throw new Error(`Unsupported glTF image MIME type: ${mime}`);
          if (bytes.byteLength > MAX_IMAGE_SIZE) throw new RangeError('glTF image is too large');
          if (typeof decoder !== 'function') throw new Error('createImageBitmap is required to load glTF image textures');
          const bitmap = await decoder(new Blob([bytes], { type: mime }),
            { imageOrientation: 'none', colorSpaceConversion: 'none' });
          imageCache.set(gltfTexture.source, bitmap);
        }
        textureCache.set(key, Texture2D.fromImage(imageCache.get(gltfTexture.source), { colorSpace }));
      }
      return { texture: textureCache.get(key), sampler };
    };

    const getMaterial = async (index) => {
      if (index === undefined) return new PBRMaterial({ color: [1,1,1,1], metallic: 1, roughness: 1 });
      if (!nonnegativeInt(index) || !document.materials?.[index]) throw new Error(`Invalid glTF material ${index}`);
      if (materialCache.has(index)) return materialCache.get(index);
      const def = document.materials[index];
      if (def.extensions || def.pbrMetallicRoughness?.extensions || def.normalTexture || def.occlusionTexture || def.emissiveTexture ||
          def.doubleSided || (def.alphaMode ?? 'OPAQUE') !== 'OPAQUE') {
        throw new Error(`Material ${index} needs unsupported alpha/double-sided/extension/texture features`);
      }
      const pbr = def.pbrMetallicRoughness ?? {};
      const base = await getTexture(pbr.baseColorTexture, 'srgb');
      const mr = await getTexture(pbr.metallicRoughnessTexture, 'linear');
      if (base && mr && base.sampler.key !== mr.sampler.key) {
        throw new Error('Different samplers for base-color and metallic-roughness textures are not yet supported');
      }
      const options = {
        color: pbr.baseColorFactor ?? [1,1,1,1],
        metallic: pbr.metallicFactor ?? 1,
        roughness: pbr.roughnessFactor ?? 1,
        emissive: def.emissiveFactor ?? [0,0,0],
        baseColorTexture: base?.texture ?? null,
        metallicRoughnessTexture: mr?.texture ?? null,
        sampler: base?.sampler ?? mr?.sampler ?? TextureSampler.DEFAULT
      };
      const material = new PBRMaterial(options);
      materialCache.set(index, material);
      return material;
    };

    const getMesh = async (index) => {
      if (!nonnegativeInt(index) || !document.meshes?.[index]) throw new Error(`Invalid glTF mesh ${index}`);
      if (meshCache.has(index)) return meshCache.get(index);
      const primitives = document.meshes[index].primitives;
      if (!Array.isArray(primitives) || !primitives.length) throw new Error(`glTF mesh ${index} has no primitives`);
      const results = [];
      for (let p=0; p<primitives.length; p++) {
        const primitive = primitives[p];
        if (primitive.extensions || primitive.targets || (primitive.mode ?? 4) !== 4) {
          throw new Error(`Mesh ${index}, primitive ${p}: only static TRIANGLES without extensions are supported`);
        }
        const a = primitive.attributes;
        if (!a || !nonnegativeInt(a.POSITION) || a.JOINTS_0 !== undefined ||
            a.WEIGHTS_0 !== undefined || a.COLOR_0 !== undefined) {
          throw new Error(`Mesh ${index}, primitive ${p}: unsupported or missing vertex attributes`);
        }
        const positionDef = document.accessors?.[a.POSITION];
        if (positionDef?.type !== 'VEC3' || positionDef.componentType !== 5126) {
          throw new Error('glTF POSITION must be VEC3 FLOAT');
        }
        const positions = decodeAccessor(document, buffers, a.POSITION);
        const count = positions.length / 3;
        let indices;
        if (primitive.indices !== undefined) {
          indices = decodeAccessor(document, buffers, primitive.indices, { asIndices: true });
        } else {
          if (count % 3 !== 0) throw new Error('Unindexed triangle vertex count must be divisible by three');
          indices = count > 65536 ? Uint32Array.from({ length: count }, (_,i)=>i)
            : Uint16Array.from({ length: count }, (_,i)=>i);
        }
        if (!indices.length || indices.length % 3 !== 0) throw new Error('Triangle indices must be nonempty and divisible by three');
        const normals = a.NORMAL === undefined ? autoNormals(positions, indices)
          : decodeAccessor(document, buffers, a.NORMAL);
        if (a.NORMAL !== undefined && document.accessors?.[a.NORMAL]?.type !== 'VEC3') {
          throw new Error('NORMAL must be VEC3');
        }
        const uvs = a.TEXCOORD_0 === undefined ? new Float32Array(count * 2)
          : decodeAccessor(document, buffers, a.TEXCOORD_0);
        if (a.TEXCOORD_0 !== undefined && document.accessors?.[a.TEXCOORD_0]?.type !== 'VEC2') {
          throw new Error('TEXCOORD_0 must be VEC2');
        }
        const geometry = new Geometry({ attributes: {
          POSITION: positions, NORMAL: normals, TEXCOORD_0: uvs
        }, indices });
        const material = await getMaterial(primitive.material);
        if (material.baseColorTexture && a.TEXCOORD_0 === undefined ||
            material.metallicRoughnessTexture && a.TEXCOORD_0 === undefined) {
          throw new Error('Textured primitives require TEXCOORD_0');
        }
        results.push(new Mesh(geometry, material));
      }
      meshCache.set(index, results);
      return results;
    };

    const chosenScene = sceneIndex ?? document.scene ?? 0;
    const sceneInfo = document.scenes?.[chosenScene];
    if (!nonnegativeInt(chosenScene) || !sceneInfo || !Array.isArray(sceneInfo.nodes)) {
      throw new Error(`glTF scene ${chosenScene} is missing or invalid`);
    }
    const scene = new Scene(sceneInfo.name || 'Imported glTF Scene');
    const nodeCache = new Map(), visiting = new Set();
    const createNode = async (index) => {
      if (!nonnegativeInt(index) || !document.nodes?.[index]) throw new Error(`Invalid glTF node ${index}`);
      if (visiting.has(index)) throw new Error('Cycle in glTF node hierarchy');
      if (nodeCache.has(index)) return nodeCache.get(index);
      const spec = document.nodes[index];
      if (spec.extensions || spec.skin !== undefined || spec.weights !== undefined) {
        throw new Error(`Node ${index} uses unsupported skin, morph, or extension features`);
      }
      const entity = new Entity(spec.name ?? `glTF Node ${index}`);
      nodeCache.set(index, entity);
      visiting.add(index);
      if (spec.matrix !== undefined) {
        if (!finiteArray(spec.matrix, 16) || spec.translation || spec.rotation || spec.scale) {
          throw new Error(`Invalid glTF node matrix at ${index}`);
        }
        entity.transform.setMatrix(spec.matrix);
      } else {
        for (const [key,size] of [['translation',3],['rotation',4],['scale',3]]) {
          if (spec[key] !== undefined && !finiteArray(spec[key],size)) throw new Error(`Invalid ${key} for node ${index}`);
        }
        if (spec.translation) entity.transform.position = [...spec.translation];
        if (spec.rotation) entity.transform.quaternion = [...spec.rotation];
        if (spec.scale) entity.transform.scale = [...spec.scale];
      }
      if (spec.mesh !== undefined) {
        const parts = await getMesh(spec.mesh);
        if (parts.length === 1) entity.add('mesh', parts[0]);
        else parts.forEach((mesh, i) => entity.addChild(new Entity(`Primitive ${i}`).add('mesh', mesh)));
      }
      for (const childIndex of spec.children ?? []) {
        const child = await createNode(childIndex);
        if (child.parent) throw new Error(`glTF node ${childIndex} has multiple parents`);
        entity.addChild(child);
      }
      visiting.delete(index);
      return entity;
    };
    const roots = [];
    for (const index of sceneInfo.nodes) {
      const root = await createNode(index);
      if (root.parent || roots.includes(root)) throw new Error('Duplicate or nested glTF scene root');
      roots.push(root);
    }
    for (const root of roots) scene.add(root);
    return {
      scene, roots, nodes: nodeCache,
      textures: [...textureCache.values()],
      warnings,
      /** Call AFTER removing this imported scene from rendering to close decoded image bitmaps. */
      dispose() { for (const bitmap of imageCache.values()) bitmap.close?.(); imageCache.clear(); }
    };
    } catch (error) {
      for (const bitmap of imageCache.values()) bitmap.close?.();
      imageCache.clear();
      throw error;
    }
  }
}
