import { Texture2D } from './Texture2D.js';

/** Deduplicates in-flight/completed URL image decodes. GPU uploads are renderer-owned. */
export class TextureManager {
  constructor({ loader = Texture2D.load } = {}) {
    if (typeof loader !== 'function') throw new TypeError('Texture loader must be a function');
    this.loader = loader;
    this.pending = new Map();
  }
  key(url, colorSpace) { return `${colorSpace}\0${url}`; }
  load(url, { colorSpace = 'srgb' } = {}) {
    if (typeof url !== 'string' || url.length === 0) throw new TypeError('A texture URL is required');
    if (colorSpace !== 'srgb' && colorSpace !== 'linear') throw new RangeError('Invalid color space');
    const key = this.key(url, colorSpace);
    if (!this.pending.has(key)) {
      const promise = Promise.resolve().then(() => this.loader(url, { colorSpace }));
      this.pending.set(key, promise);
      // Remove failed requests to allow explicit retry; don't cache an endless rejection.
      promise.catch(() => { if (this.pending.get(key) === promise) this.pending.delete(key); });
    }
    return this.pending.get(key);
  }
  forget(url, { colorSpace = 'srgb' } = {}) { return this.pending.delete(this.key(url, colorSpace)); }
  clear() { this.pending.clear(); }
  get size() { return this.pending.size; }
}
