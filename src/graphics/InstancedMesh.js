import { Mesh } from './Mesh.js';

/**
 * One draw for multiple copies of the same geometry/material, each with a
 * local transform relative to its owner entity. Updates require setInstances.
 * Per-instance materials and per-instance culling are out of scope for PR 07.
 */
export class InstancedMesh extends Mesh {
  constructor(geometry, material, instanceMatrices) {
    super(geometry, material);
    this.version = 0;
    this.setInstances(instanceMatrices);
  }
  setInstances(matrices) {
    if (!(matrices instanceof Float32Array) || matrices.length % 16 !== 0 ||
        !matrices.every(Number.isFinite)) {
      throw new TypeError('InstancedMesh requires finite Float32Array matrices (16 floats each)');
    }
    if (matrices.length / 16 > 16384) throw new RangeError('InstancedMesh is limited to 16,384 instances');
    this.instanceMatrices = new Float32Array(matrices);
    this.instanceCount = matrices.length / 16;
    this.version++;
    return this;
  }
}
