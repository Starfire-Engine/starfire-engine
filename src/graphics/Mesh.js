import { Geometry, prepareGeometry } from '../geometry/Geometry.js';
export class Mesh {
  constructor(geometry, material = { color: [0.35, 0.64, 0.95, 1] }) {
    if (!(geometry instanceof Geometry)) {
      // Keep old 0.1.x typed-array meshes supported.
      prepareGeometry(geometry);
    }
    if (!Array.isArray(material?.color) || material.color.length !== 4 ||
        !material.color.every(Number.isFinite)) throw new TypeError('Mesh requires RGBA material color');
    this.geometry = geometry;
    this.material = material;
  }
}
