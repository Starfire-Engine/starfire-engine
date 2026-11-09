import { Mat4 } from '../math/Mat4.js';
import { Transform } from './Transform.js';

let nextId = 1;
export class Entity {
  constructor(name = 'Entity') {
    this.id = nextId++;
    this.name = name;
    this.transform = new Transform();
    this.visible = true;
    this.components = new Map();
    this.parent = null;
    this.children = new Set();
    this._scene = null;
  }
  add(type, component) {
    if (type === 'transform') throw new Error('Transform is built into every entity');
    this.components.set(type, component);
    return this;
  }
  get(type) { return this.components.get(type); }
  has(type) { return this.components.has(type); }
  remove(type) { return this.components.delete(type); }

  addChild(child) {
    if (!(child instanceof Entity)) throw new TypeError('Child must be an Entity');
    for (let node = this; node; node = node.parent) {
      if (node === child) throw new Error('Cyclic entity hierarchy');
    }
    if (child.parent === this) return child;
    if (child._scene && child._scene !== this._scene) {
      throw new Error('Remove the child from its current scene before reparenting');
    }
    if (this._scene) this._scene._assertCanRegister(child);
    child.parent?.children.delete(child);
    child.parent = this;
    this.children.add(child);
    if (this._scene) this._scene._register(child);
    return child;
  }
  removeChild(child) {
    if (child.parent !== this) return false;
    this.children.delete(child);
    child.parent = null;
    // The child stays as a root entity in its current scene until removed.
    return true;
  }
  worldMatrix() {
    const local = this.transform.matrix();
    return this.parent ? Mat4.multiply(this.parent.worldMatrix(), local) : local;
  }
  isVisibleInHierarchy() {
    for (let node = this; node; node = node.parent) if (!node.visible) return false;
    return true;
  }
}
