import { Material } from './Material.js';
import { Texture2D } from './Texture2D.js';

function unit(value, name) {
  if (!(Number.isFinite(value) && value >= 0 && value <= 1))
    throw new RangeError(`${name} must be a finite number from 0 to 1`);
  return value;
}

/**
 * First-pass metallic-roughness material. Factors use linear color space.
 * For metallicRoughnessTexture: G = roughness, B = metallic; it MUST be linear.
 * Base color textures use sRGB (their RGB channels are decoded by the GPU).
 * Opaque materials only in PR 04; alpha blending, normal maps, IBL are future work.
 */
export class PBRMaterial extends Material {
  constructor({ color = [1, 1, 1, 1], baseColorTexture = null, sampler,
    metallic = 0, roughness = 0.6, metallicRoughnessTexture = null,
    emissive = [0, 0, 0] } = {}) {
    super({ color, baseColorTexture, sampler });
    if (baseColorTexture !== null && baseColorTexture.colorSpace !== 'srgb') {
      throw new RangeError('PBR baseColorTexture must use sRGB for correct color decoding');
    }
    if (metallicRoughnessTexture !== null && !(metallicRoughnessTexture instanceof Texture2D)) {
      throw new TypeError('PBR metallicRoughnessTexture must be Texture2D or null');
    }
    if (metallicRoughnessTexture !== null && metallicRoughnessTexture.colorSpace !== 'linear') {
      throw new RangeError('PBR metallicRoughnessTexture must use linear color space');
    }
    if (!Array.isArray(emissive) || emissive.length !== 3 ||
        !emissive.every((n) => Number.isFinite(n) && n >= 0)) {
      throw new TypeError('PBR emissive must be a non-negative linear RGB vec3');
    }
    this.metallic = unit(metallic, 'PBR metallic');
    this.roughness = unit(roughness, 'PBR roughness');
    this.metallicRoughnessTexture = metallicRoughnessTexture;
    this.emissive = [...emissive];
  }
}

/** Values shared by the WebGPU uniform writer and WebGL uniform writer. */
export function resolveMaterial(material) {
  if (!(material instanceof PBRMaterial)) {
    return { isPBR: false, metallic: 0, roughness: 1, emissive: [0, 0, 0], metallicRoughnessTexture: null };
  }
  const metallic = unit(material.metallic, 'PBR metallic');
  const roughness = unit(material.roughness, 'PBR roughness');
  const texture = material.metallicRoughnessTexture;
  if (texture !== null && (!(texture instanceof Texture2D) || texture.colorSpace !== 'linear')) {
    throw new TypeError('PBR metallicRoughnessTexture must be a linear Texture2D or null');
  }
  if (material.baseColorTexture && material.baseColorTexture.colorSpace !== 'srgb') {
    throw new RangeError('PBR baseColorTexture must be sRGB');
  }
  if (!Array.isArray(material.emissive) || material.emissive.length !== 3 ||
      !material.emissive.every((n) => Number.isFinite(n) && n >= 0)) {
    throw new TypeError('PBR emissive must be a non-negative linear RGB vec3');
  }
  return { isPBR: true, metallic, roughness, emissive: [...material.emissive], metallicRoughnessTexture: texture };
}
