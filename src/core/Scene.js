import { Lighting } from '../graphics/Lighting.js';
import { Entity } from './Entity.js';

export class Scene {
  constructor(name = 'Scene') {
    this.name = name;
    this.entities = new Map();
    this.systems = [];
    this.lighting = new Lighting();
  }
  _subtree(entity) {
    const entries = [];
    const visit = (node) => { entries.push(node); for (const child of node.children) visit(child); };
    visit(entity);
    return entries;
  }
  _assertCanRegister(entity) {
    for (const item of this._subtree(entity)) {
      if (item._scene && item._scene !== this) throw new Error('Entity belongs to a different scene');
      const existing = this.entities.get(item.id);
      if (existing && existing !== item) throw new Error(`Entity id collision: ${item.id}`);
    }
  }
  _register(entity) {
    this._assertCanRegister(entity);
    for (const item of this._subtree(entity)) {
      this.entities.set(item.id, item);
      item._scene = this;
    }
  }
  add(entity) {
    if (!(entity instanceof Entity)) throw new TypeError('Scene requires an Entity');
    if (entity.parent && entity.parent._scene !== this) throw new Error('Add the parent or detach the child first');
    if (this.entities.has(entity.id)) throw new Error(`Entity ${entity.id} is already in the scene`);
    this._register(entity);
    return entity;
  }
  remove(id) {
    const entity = typeof id === 'object' ? this.entities.get(id.id) : this.entities.get(id);
    if (!entity) return false;
    entity.parent?.children.delete(entity);
    entity.parent = null;
    for (const item of this._subtree(entity)) {
      this.entities.delete(item.id);
      item._scene = null;
    }
    return true;
  }
  find(name) { return [...this.entities.values()].find((entity) => entity.name === name); }
  query(component) { return [...this.entities.values()].filter((entity) => entity.has(component)); }
  addSystem(system) {
    if (typeof system !== 'function') throw new TypeError('System must be a function');
    this.systems.push(system);
    return this;
  }
  update(dt, elapsed) { for (const system of this.systems) system(this, dt, elapsed); }
}
