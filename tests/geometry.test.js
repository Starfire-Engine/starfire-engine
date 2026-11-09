import test from 'node:test';
import assert from 'node:assert/strict';
import { Geometry, prepareGeometry } from '../src/geometry/Geometry.js';
import { createBox, createPlane, createSphere } from '../src/geometry/primitives.js';
import { Mesh } from '../src/graphics/Mesh.js';

const close = (a,b,epsilon=1e-5) => assert.ok(Math.abs(a-b) < epsilon, `${a} != ${b}`);

test('flexible Geometry packs positions, normals and UVs in a consistent 32-byte layout', () => {
  const geom = new Geometry({
    attributes: {
      position: new Float32Array([1,2,3, 4,5,6, 7,8,9]),
      normal: new Float32Array([0,1,0, 0,1,0, 0,1,0]),
      uv: new Float32Array([0,0, 1,0, 0,1]),
      COLOR_0: { array: new Float32Array(12), itemSize: 4 }
    },
    indices: new Uint16Array([0,1,2])
  });
  assert.equal(geom.vertexCount, 3);
  assert.equal(geom.attributes.size, 4);
  assert.deepEqual([...geom.packedVertices().slice(0,8)], [1,2,3,0,1,0,0,0]);
  assert.deepEqual([...geom.packedVertices().slice(8,16)], [4,5,6,0,1,0,1,0]);
  assert.equal(geom.getAttribute('COLOR_0').itemSize,4);
  assert.equal(prepareGeometry(geom).vertices.length, 24);
});

test('legacy box works with the new renderer geometry layout', () => {
  const box = createBox();
  const packed = prepareGeometry(box);
  assert.equal(packed.vertices.length, 24 * 8);
  assert.equal(packed.indices, box.indices);
  assert.deepEqual([...packed.vertices.slice(0,8)], [-.5,-.5,.5,0,0,1,0,0]);
  assert.doesNotThrow(() => new Mesh(box));
});

test('32-bit indexed geometry supports vertex indices above 65535', () => {
  const sphere = createSphere(1, 256, 256);
  assert.ok(sphere.vertexCount > 65536);
  assert.ok(sphere.indices instanceof Uint32Array);
  assert.ok(Math.max(...sphere.indices.slice(-30)) > 65535);
  assert.equal(prepareGeometry(sphere).indices, sphere.indices);
  assert.doesNotThrow(() => new Mesh(sphere));
});

test('sphere normal and geometry winding face outward', () => {
  const geometry = createSphere(2, 10, 8);
  const positions = geometry.getAttribute('POSITION').array;
  const a = geometry.indices[6 * 10 + 6], b = geometry.indices[6 * 10 + 7], c = geometry.indices[6 * 10 + 8];
  const v = idx => [...positions.slice(idx*3, idx*3+3)];
  const p=v(a),q=v(b),r=v(c);
  const cross=(u,w)=>[u[1]*w[2]-u[2]*w[1],u[2]*w[0]-u[0]*w[2],u[0]*w[1]-u[1]*w[0]];
  const diff=(u,w)=>u.map((n,i)=>n-w[i]);
  assert.ok(cross(diff(q,p), diff(r,p)).reduce((sum,n,i)=>sum+n*p[i],0)>0);
  close(Math.hypot(...p),2);
});

test('plane creates correct up-facing triangles and UVs', () => {
  const geometry = createPlane(4, 2);
  assert.equal(geometry.vertexCount, 4);
  assert.deepEqual([...geometry.indices], [0,2,1, 1,2,3]);
  assert.deepEqual([...geometry.getAttribute('TEXCOORD_0').array], [0,0,1,0,0,1,1,1]);
});

test('invalid geometry is rejected, and dirty versions can update existing buffers', () => {
  assert.throws(() => new Geometry({attributes:{}}), /POSITION/);
  assert.throws(() => new Geometry({attributes:{position:new Float32Array(4)}}), /length/i);
  assert.throws(() => new Geometry({attributes:{position:new Float32Array(9), uv:new Float32Array(4)}}), /vertex count/);
  assert.throws(() => new Geometry({attributes:{position:new Float32Array(9)}, indices:new Uint16Array([0,1,3])}), /bounds/);
  const geo=createPlane();
  assert.equal(geo.version,0);
  geo.getAttribute('POSITION').array[0]=2;
  assert.equal(geo.markDirty().version,1);
  assert.equal(geo.packedVertices()[0],2);
});
