import { Mat4 } from '../math/Mat4.js';

export class Transform {
  constructor({ position = [0, 0, 0], rotation = [0, 0, 0], scale = [1, 1, 1] } = {}) {
    this.position = [...position];
    this.rotation = [...rotation];
    this.scale = [...scale];
  }
  matrix() { return Mat4.compose(this.position, this.rotation, this.scale); }
}
