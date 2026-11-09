import { Mat4 } from '../math/Mat4.js';

export class Transform {
  constructor({ position = [0, 0, 0], rotation = [0, 0, 0], quaternion = null, scale = [1, 1, 1] } = {}) {
    this.position = [...position];
    this.rotation = [...rotation];
    this.scale = [...scale];
    this.quaternion = quaternion === null ? null : [...quaternion];
    this.matrixOverride = null;
  }
  /** glTF node matrix overrides local TRS until clearMatrix() is called. */
  setMatrix(matrix) {
    if (!matrix || matrix.length !== 16 || !Array.from(matrix).every(Number.isFinite)) {
      throw new TypeError('Matrix override requires 16 finite column-major components');
    }
    this.matrixOverride = new Float32Array(matrix);
    return this;
  }
  clearMatrix() { this.matrixOverride = null; return this; }
  /** Quaternion overrides Euler rotation when set; use null to revert to Euler. */
  matrix() {
    if (this.matrixOverride !== null) return new Float32Array(this.matrixOverride);
    return this.quaternion === null
      ? Mat4.compose(this.position, this.rotation, this.scale)
      : Mat4.composeQuaternion(this.position, this.quaternion, this.scale);
  }
}
