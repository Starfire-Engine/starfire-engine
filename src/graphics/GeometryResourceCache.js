/**
 * Owns uploaded GPU geometry resources, shared across meshes using the same
 * geometry object. sweep() releases geometry no longer used by any visible mesh.
 */
export class GeometryResourceCache {
  constructor(destroy) {
    if (typeof destroy !== 'function') throw new TypeError('A resource destructor is required');
    this.destroy = destroy;
    this.entries = new Map();
  }
  get(geometry, create) {
    const version = geometry.version ?? 0;
    const cached = this.entries.get(geometry);
    if (cached?.version === version) return cached.resource;
    const resource = create(geometry);
    if (cached) this.destroy(cached.resource);
    this.entries.set(geometry, { resource, version });
    return resource;
  }
  sweep(visibleGeometry) {
    for (const [geometry, value] of this.entries) {
      if (visibleGeometry.has(geometry)) continue;
      this.destroy(value.resource);
      this.entries.delete(geometry);
    }
  }
  clear() {
    for (const value of this.entries.values()) this.destroy(value.resource);
    this.entries.clear();
  }
  get size() { return this.entries.size; }
}
