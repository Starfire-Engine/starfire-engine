import { Mat4 } from '../math/Mat4.js';

export class Transform {
  constructor({ position = [0, 0, 0], rotation = [0, 0, 0], quaternion = null, scale = [1, 1, 1] } = {}) {
    this.position = [...position];
    this.rotation = [...rotation];
    this.scale = [...scale];
    this.quaternion = quaternion === null ? null : [...quaternion];
  }
  /** Quaternion overrides Euler rotation when set; use null to revert to Euler. */
  matrix() {
    return this.quaternion === null
      ? Mat4.compose(this.position, this.rotation, this.scale)
      : Mat4.composeQuaternion(this.position, this.quaternion, this.scale);
  }
}
