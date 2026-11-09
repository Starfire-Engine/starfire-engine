import test from 'node:test';
import assert from 'node:assert/strict';
import { Entity } from '../src/core/Entity.js';
import { Scene } from '../src/core/Scene.js';
import { Transform } from '../src/core/Transform.js';
import { Mat4 } from '../src/math/Mat4.js';
import { Mesh } from '../src/graphics/Mesh.js';
import { createBox } from '../src/geometry/primitives.js';
import { collectRenderables } from '../src/graphics/RenderQueue.js';

const close=(a,b,epsilon=1e-5)=>assert.ok(Math.abs(a-b)<epsilon,`${a} != ${b}`);

test('child transforms combine with parent transforms', () => {
  const parent = new Entity('Parent');
  const child = new Entity('Child');
  parent.transform.position = [3, 0, 0];
  parent.transform.rotation = [0, Math.PI/2, 0];
  child.transform.position = [1, 0, 0];
  parent.addChild(child);
  const actual = Mat4.transformPoint(child.worldMatrix(),[0,0,0]);
  close(actual[0],3); close(actual[1],0); close(actual[2],-1);
  parent.transform.position = [9,0,0];
  close(Mat4.transformPoint(child.worldMatrix(),[0,0,0])[0],9);
});

test('scene indexes children added both before and after parent registration', () => {
  const parent = new Entity('Parent');
  const first = new Entity('First');
  const second = new Entity('Second');
  parent.addChild(first);
  const scene = new Scene();
  scene.add(parent);
  parent.addChild(second);
  assert.equal(scene.entities.size,3);
  assert.equal(scene.find('Second'),second);
  assert.throws(()=>scene.add(first),/already/);
});

test('scene removal detaches subtree and allows attaching it to another scene',()=>{
  const parent = new Entity('Root');
  const child = new Entity('Child');
  parent.addChild(child);
  const a = new Scene('A'), b = new Scene('B');
  a.add(parent);
  assert.throws(()=>b.add(parent),/different scene/);
  assert.equal(a.remove(parent),true);
  assert.equal(a.entities.size,0);
  b.add(parent);
  assert.equal(b.entities.size,2);
  assert.equal(b.remove(child),true);
  assert.equal(child.parent,null);
  assert.equal(b.entities.size,1);
});

test('hierarchy rejects cycles and cross-scene reparenting',()=>{
  const parent=new Entity('P'), child=new Entity('C'), grandchild=new Entity('G');
  parent.addChild(child); child.addChild(grandchild);
  assert.throws(()=>grandchild.addChild(parent),/Cyclic/);
  assert.throws(()=>parent.addChild(parent),/Cyclic/);
  assert.throws(()=>parent.addChild({}),TypeError);
  const a=new Scene(), b=new Scene();
  a.add(parent); const other=b.add(new Entity('Other'));
  assert.throws(()=>parent.addChild(other),/current scene/);
  assert.equal(parent.children.size,1);
});

test('render submission honors ancestor visibility and produces world matrices', () => {
  const parent=new Entity('Parent');
  const child=new Entity('Child').add('mesh',new Mesh(createBox()));
  parent.addChild(child);parent.transform.position=[4,0,0];child.transform.position=[2,0,0];
  const scene=new Scene();scene.add(parent);
  assert.equal(collectRenderables(scene).length,1);
  close(collectRenderables(scene)[0].modelMatrix[12],6);
  parent.visible=false;
  assert.equal(collectRenderables(scene).length,0);
  parent.visible=true;child.visible=false;
  assert.equal(collectRenderables(scene).length,0);
});

test('quaternion transforms support glTF-compatible rotations while Euler remains valid', () => {
  const transform = new Transform({position:[1,2,3],quaternion:[0,Math.sin(Math.PI/4),0,Math.cos(Math.PI/4)]});
  const point=Mat4.transformPoint(transform.matrix(),[1,0,0]);
  close(point[0],1);close(point[1],2);close(point[2],2);
  transform.quaternion=null;
  const noRotation=Mat4.transformPoint(transform.matrix(),[1,0,0]);
  close(noRotation[0],2);close(noRotation[2],3);
  assert.throws(()=>Mat4.composeQuaternion([0,0,0],[0,0,0,0]),RangeError);
});

test('explicit unparenting retains a child as a root in the same scene', () => {
  const scene = new Scene();
  const parent=scene.add(new Entity('Parent'));
  const child=parent.addChild(new Entity('Child'));
  assert.equal(scene.entities.size,2);
  assert.equal(parent.removeChild(child),true);
  assert.equal(scene.entities.size,2);
  assert.equal(child.parent,null);
  scene.remove(parent);
  assert.equal(scene.entities.size,1);
  assert.equal(scene.find('Child'),child);
});
