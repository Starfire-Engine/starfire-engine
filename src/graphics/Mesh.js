export class Mesh {
  constructor(geometry, material = { color: [0.35, 0.64, 0.95, 1] }) {
    if (!(geometry?.vertices instanceof Float32Array) || !(geometry?.indices instanceof Uint16Array)) {
      throw new TypeError('Mesh requires geometry with Float32Array vertices and Uint16Array indices');
    }
    this.geometry = geometry;
    this.material = material;
  }
}
