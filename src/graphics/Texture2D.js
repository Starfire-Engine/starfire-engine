/**
 * CPU-side texture source. Texture2D doesn't own GPU resources: every renderer
 * maintains its own cache and releases unused uploads during render/dispose.
 * UV (0,0) is the top-left pixel of an RGBA source, on both backends.
 */
const COLOR_SPACES = new Set(['srgb', 'linear']);

function size(value, label) {
  if (!Number.isSafeInteger(value) || value < 1) throw new RangeError(`${label} must be a positive integer`);
  return value;
}
function dimensions(width, height) {
  size(width, 'Texture width');
  size(height, 'Texture height');
  if (width * height > 268435456) throw new RangeError('Texture dimensions are too large');
}
function validateColorSpace(colorSpace) {
  if (!COLOR_SPACES.has(colorSpace)) throw new RangeError(`Unsupported texture color space: ${colorSpace}`);
}

export class Texture2D {
  constructor({ width, height, data = null, image = null, colorSpace = 'srgb' } = {}) {
    dimensions(width, height);
    validateColorSpace(colorSpace);
    if ((data === null) === (image === null)) throw new TypeError('Provide exactly one texture source: data or image');
    if (data !== null) {
      if (!(data instanceof Uint8Array || data instanceof Uint8ClampedArray) ||
          data.byteLength !== width * height * 4) {
        throw new TypeError('RGBA data must contain width × height × 4 bytes');
      }
      this.data = new Uint8Array(data);
      this.image = null;
    } else {
      if (typeof image !== 'object' || image === null) throw new TypeError('Invalid image source');
      const actualWidth = image.naturalWidth ?? image.width;
      const actualHeight = image.naturalHeight ?? image.height;
      if (actualWidth !== width || actualHeight !== height) throw new RangeError('Image dimensions do not match texture');
      this.data = null;
      this.image = image;
    }
    Object.defineProperties(this, {
      width: { value: width, enumerable: true },
      height: { value: height, enumerable: true },
      colorSpace: { value: colorSpace, enumerable: true }
    });
    this.version = 0;
  }
  static fromRGBA(width, height, data, options = {}) {
    return new Texture2D({ width, height, data, ...options });
  }
  static fromImage(image, options = {}) {
    if (!image) throw new TypeError('An image is required');
    const width = image.naturalWidth ?? image.width;
    const height = image.naturalHeight ?? image.height;
    return new Texture2D({ width, height, image, ...options });
  }
  /** Decode PNG/JPEG/WebP through the browser; keep URL loading outside the render loop. */
  static async load(url, { fetcher = globalThis.fetch, decoder = globalThis.createImageBitmap,
    colorSpace = 'srgb' } = {}) {
    if (typeof url !== 'string' || url.length === 0) throw new TypeError('A texture URL is required');
    validateColorSpace(colorSpace);
    if (typeof fetcher !== 'function' || typeof decoder !== 'function') {
      throw new Error('Texture2D.load requires fetch and createImageBitmap (a supported browser)');
    }
    const response = await fetcher(url);
    if (!response.ok) throw new Error(`Texture request failed (${response.status}): ${url}`);
    const image = await decoder(await response.blob(), { imageOrientation: 'none' });
    try { return Texture2D.fromImage(image, { colorSpace }); }
    catch (error) { image.close?.(); throw error; }
  }
  /** Call after mutating data/image to refresh GPU uploads on the next rendered frame. */
  markDirty() { this.version++; return this; }
}
