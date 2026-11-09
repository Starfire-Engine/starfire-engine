/** Immutable sampler descriptor compatible with WebGPU and WebGL 2. */
const WRAPS = new Set(['repeat', 'clamp-to-edge', 'mirror-repeat']);
const FILTERS = new Set(['nearest', 'linear']);

export class TextureSampler {
  constructor({ wrapU = 'repeat', wrapV = 'repeat', minFilter = 'linear', magFilter = 'linear' } = {}) {
    if (!WRAPS.has(wrapU) || !WRAPS.has(wrapV)) throw new RangeError('Invalid texture wrap mode');
    if (!FILTERS.has(minFilter) || !FILTERS.has(magFilter)) throw new RangeError('Invalid texture filter');
    this.wrapU = wrapU;
    this.wrapV = wrapV;
    this.minFilter = minFilter;
    this.magFilter = magFilter;
    this.key = `${wrapU}|${wrapV}|${minFilter}|${magFilter}`;
    Object.freeze(this);
  }
  static DEFAULT = new TextureSampler();
}
