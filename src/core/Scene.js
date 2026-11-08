export class Scene {
  constructor(name = 'Scene') {
    this.name = name;
    this.entities = new Map();
    this.systems = [];
  }
  add(entity) {
    if (this.entities.has(entity.id)) throw new Error(`Entity ${entity.id} is already in the scene`);
    this.entities.set(entity.id, entity);
    return entity;
  }
  remove(id) { return this.entities.delete(typeof id === 'object' ? id.id : id); }
  find(name) { return [...this.entities.values()].find((entity) => entity.name === name); }
  query(component) { return [...this.entities.values()].filter((entity) => entity.has(component)); }
  addSystem(system) {
    if (typeof system !== 'function') throw new TypeError('System must be a function');
    this.systems.push(system);
    return this;
  }
  update(dt, elapsed) { for (const system of this.systems) system(this, dt, elapsed); }
}
