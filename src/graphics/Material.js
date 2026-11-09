import { Texture2D } from './Texture2D.js';
import { TextureSampler } from './TextureSampler.js';

/**
 * Lit material used by the current directional diffuse/specular renderer.
 * Color is multiplied by the baseColorTexture (if present). This is NOT PBR;
 * PR 04 will introduce physically based shading as a separate milestone.
 */
export class Material {
  constructor({ color = [0.35, 0.64, 0.95, 1], baseColorTexture = null,
    sampler = TextureSampler.DEFAULT } = {}) {
    if (!Array.isArray(color) || color.length !== 4 || !color.every(Number.isFinite)) {
      throw new TypeError('Material.color must contain four finite RGBA values');
    }
    if (baseColorTexture !== null && !(baseColorTexture instanceof Texture2D)) {
      throw new TypeError('Material.baseColorTexture must be Texture2D or null');
    }
    if (!(sampler instanceof TextureSampler)) throw new TypeError('Material.sampler must be TextureSampler');
    this.color = [...color];
    this.baseColorTexture = baseColorTexture;
    this.sampler = sampler;
  }
}

/** Preserve mutable legacy {color} materials used by v0.1.x integrations. */
export function normalizeMaterial(material) {
  if (material instanceof Material) return material;
  if (!material || typeof material !== 'object') throw new TypeError('Mesh requires a material');
  // Test/validate the data without replacing the supplied object, preserving reference semantics.
  new Material(material);
  return material;
}
