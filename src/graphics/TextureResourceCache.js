import { GeometryResourceCache } from './GeometryResourceCache.js';

/** Shares one GPU texture upload per Texture2D identity and renderer instance. */
export class TextureResourceCache extends GeometryResourceCache {}
