import { Transform } from './Transform.js';

let nextId = 1;
export class Entity {
  constructor(name = 'Entity') {
    this.id = nextId++;
    this.name = name;
    this.transform = new Transform();
    this.visible = true;
    this.components = new Map();
  }
  add(type, component) {
    if (type === 'transform') throw new Error('Transform is built into every entity');
    this.components.set(type, component);
    return this;
  }
  get(type) { return this.components.get(type); }
  has(type) { return this.components.has(type); }
  remove(type) { return this.components.delete(type); }
}
