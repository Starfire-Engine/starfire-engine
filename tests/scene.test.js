import test from 'node:test';
import assert from 'node:assert/strict';
import { Entity } from '../src/core/Entity.js';
import { Scene } from '../src/core/Scene.js';
import { Mesh } from '../src/graphics/Mesh.js';
import { createBox } from '../src/geometry/primitives.js';

test('Entities have unique identities and components', () => {
  const one = new Entity('One').add('score', { value: 1 });
  const two = new Entity('Two');
  assert.notEqual(one.id, two.id);
  assert.ok(one.has('score'));
  assert.equal(one.get('score').value, 1);
  assert.equal(one.remove('score'), true);
  assert.equal(one.has('score'), false);
  assert.throws(() => one.add('transform', {}));
});

test('Scene stores objects, supports query and updates systems', () => {
  const scene = new Scene('Test');
  const entity = new Entity('Box').add('mesh', new Mesh(createBox(), { color: [1, 1, 1, 1] }));
  scene.add(entity);
  assert.equal(scene.find('Box'), entity);
  assert.deepEqual(scene.query('mesh'), [entity]);
  assert.throws(() => scene.add(entity));
  let count = 0;
  scene.addSystem((_scene, dt, elapsed) => { count += dt + elapsed; });
  scene.update(.01, .03);
  assert.equal(count, .04);
  assert.equal(scene.remove(entity), true);
  assert.equal(scene.entities.size, 0);
});

test('Box has 24 vertices, 36 indices, and normalized normals', () => {
  const box = createBox(2, 3, 4);
  assert.equal(box.vertices.length, 144);
  assert.equal(box.indices.length, 36);
  for (let i = 0; i < box.vertices.length; i += 6) {
    assert.equal(Math.hypot(box.vertices[i + 3], box.vertices[i + 4], box.vertices[i + 5]), 1);
  }
});

test('Invalid geometry and box dimensions are rejected', () => {
  assert.throws(() => createBox(-1), RangeError);
  assert.throws(() => new Mesh({ vertices: [1], indices: [1] }), TypeError);
});


test('All generated box triangles face outward for backface culling', () => {
  const { vertices, indices } = createBox(2, 2, 2);
  for (let triangle = 0; triangle < indices.length; triangle += 3) {
    const points = [0, 1, 2].map((i) => {
      const base = indices[triangle + i] * 6;
      return [...vertices.slice(base, base + 3)];
    });
    const a = points[1].map((n, i) => n - points[0][i]);
    const b = points[2].map((n, i) => n - points[0][i]);
    const cross = [a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]];
    const base = indices[triangle] * 6 + 3;
    const normal = [...vertices.slice(base, base + 3)];
    assert.ok(cross.reduce((total, n, i) => total + n * normal[i], 0) > 0);
  }
});
