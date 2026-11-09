import { Mat4 } from '../math/Mat4.js';

export class PerspectiveCamera {
  constructor({ fov = 55, near = 0.1, far = 500, position = [8, 6, 11], target = [0, 0, 0] } = {}) {
    this.fov = fov;
    this.near = near;
    this.far = far;
    this.position = [...position];
    this.target = [...target];
    this.frustumCulling = true; // Opt-in for third-party camera implementations.
  }
  matrix(aspect, depthMode = 'webgpu') {
    return Mat4.multiply(
      Mat4.perspective(this.fov * Math.PI / 180, aspect, this.near, this.far, depthMode),
      Mat4.lookAt(this.position, this.target)
    );
  }
}
