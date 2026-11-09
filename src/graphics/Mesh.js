import { Geometry, prepareGeometry } from '../geometry/Geometry.js';
import { normalizeMaterial } from './Material.js';
export class Mesh {
  constructor(geometry, material = { color: [0.35, 0.64, 0.95, 1] }) {
    if (!(geometry instanceof Geometry)) {
      // Keep old 0.1.x typed-array meshes supported.
      prepareGeometry(geometry);
    }
    material = normalizeMaterial(material);
    this.geometry = geometry;
    this.material = material;
  }
}
