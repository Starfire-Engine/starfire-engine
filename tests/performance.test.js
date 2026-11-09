import test from 'node:test';
import assert from 'node:assert/strict';
import { Mat4 } from '../src/math/Mat4.js';
import { PerspectiveCamera } from '../src/core/Camera.js';
import { FrameProfiler } from '../src/core/FrameProfiler.js';
import { Entity } from '../src/core/Entity.js';
import { Scene } from '../src/core/Scene.js';
import { Geometry } from '../src/geometry/Geometry.js';
import { createBox } from '../src/geometry/primitives.js';
import { Mesh } from '../src/graphics/Mesh.js';
import { InstancedMesh } from '../src/graphics/InstancedMesh.js';
import { collectRenderables } from '../src/graphics/RenderQueue.js';
import { cullRenderables, frustumPlanes, geometryBounds, sphereInFrustum, worldBoundingSphere } from '../src/graphics/Visibility.js';
import { shaderWGSLInstanced, vertexInstancedGLSL, shadowVertexInstancedGLSL } from '../src/graphics/shaders.js';

function sceneWith(position, geometry = createBox()) {
  const scene = new Scene();
  const item = new Entity('object').add('mesh', new Mesh(geometry));
  item.transform.position = position;
  scene.add(item);
  return { scene, item };
}

test('frustum recognizes near/far and left/right planes for WebGPU and WebGL 2', () => {
  const camera = new PerspectiveCamera({ position:[0,0,10], target:[0,0,0], near:0.1, far:40, fov:60 });
  for (const depth of ['webgpu', 'webgl']) {
    const planes = frustumPlanes(camera.matrix(1, depth), depth);
    assert.ok(sphereInFrustum({center:[0,0,0],radius:1}, planes));
    assert.equal(sphereInFrustum({center:[0,0,30],radius:1}, planes),false);
    assert.equal(sphereInFrustum({center:[150,0,0],radius:1}, planes),false);
    assert.equal(sphereInFrustum({center:[0,0,-100],radius:1}, planes),false);
    assert.ok(sphereInFrustum({center:[0,0,9.5],radius:0.5}, planes));
  }
});

test('culling includes geometry conservatively and can be disabled', () => {
  const {scene} = sceneWith([100,0,0]);
  const camera = new PerspectiveCamera({ position:[0,0,10],target:[0,0,0] });
  const list = collectRenderables(scene);
  const hidden = cullRenderables(list,camera.matrix(1,'webgpu'));
  assert.equal(hidden.culled,1); assert.equal(hidden.visible.length,0);
  assert.equal(cullRenderables(list,camera.matrix(1,'webgpu'),'webgpu',false).visible.length,1);
});

test('local bounds track markDirty and world sphere is conservative under shear', () => {
  const geometry = new Geometry({ attributes: { POSITION: new Float32Array([-1,0,0, 1,0,0, 0,1,0]) }});
  assert.deepEqual(geometryBounds(geometry).center,[0,0.5,0]);
  geometry.getAttribute('POSITION').array[0]=-20;
  geometry.markDirty();
  assert.equal(geometryBounds(geometry).center[0],-9.5);
  const shear = Mat4.identity(); shear[4] = 15;
  const bounds = worldBoundingSphere(geometry,shear);
  assert.ok(bounds.radius >= geometryBounds(geometry).radius * 15);
});

test('instanced mesh accepts finite matrices and can update its version', () => {
  const a=Mat4.identity(), b=Mat4.compose([2,0,0]);
  const matrices=new Float32Array([...a,...b]);
  const instance=new InstancedMesh(createBox(),{color:[1,1,1,1]},matrices);
  assert.equal(instance.instanceCount,2);
  const original=instance.version;
  matrices[12]=999;
  assert.equal(instance.instanceMatrices[12],0);
  instance.setInstances(new Float32Array(a));
  assert.equal(instance.version,original+1);
  assert.equal(instance.instanceCount,1);
  assert.throws(()=>new InstancedMesh(createBox(),undefined,new Float32Array(15)),/16 floats/);
  assert.throws(()=>new InstancedMesh(createBox(),undefined,Array(16).fill(0)),/Float32Array/);
});

test('instance groups remain visible conservatively until per-instance bounds exist', () => {
  const scene=new Scene();
  const far=new Entity('far'); far.transform.position=[1000,0,0];
  far.add('mesh',new InstancedMesh(createBox(),{color:[1,1,1,1]},new Float32Array(Mat4.identity())));
  scene.add(far);
  const camera=new PerspectiveCamera();
  assert.equal(cullRenderables(collectRenderables(scene),camera.matrix(1)).visible.length,1);
});

test('CPU profiler explicitly does not report GPU execution time',()=>{
  const profiler = new FrameProfiler();
  profiler.record({frameMs:10,updateMs:4,renderMs:6});
  profiler.record({frameMs:20,updateMs:8,renderMs:12});
  const report=profiler.snapshot();
  assert.ok(report.cpuFrameMs>10 && report.cpuFrameMs<20);
  assert.equal(report.gpuMs,null);
  assert.throws(()=>profiler.record({frameMs:-1}),RangeError);
  profiler.reset(); assert.equal(profiler.snapshot().frames,0);
});

test('instanced shaders include separate model matrix inputs for color and depth',()=>{
  assert.match(shaderWGSLInstanced,/@location\(6\) instance3: vec4<f32>/);
  assert.match(shaderWGSLInstanced,/object.model \* mat4x4<f32>/);
  assert.match(shaderWGSLInstanced,/fn shadowVertex/);
  assert.match(vertexInstancedGLSL,/#define STARFIRE_INSTANCED 1/);
  assert.match(shadowVertexInstancedGLSL,/aInstance3/);
});
