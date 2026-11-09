import test from 'node:test';
import assert from 'node:assert/strict';
import { GeometryResourceCache } from '../src/graphics/GeometryResourceCache.js';
import { WebGPURenderer } from '../src/graphics/WebGPURenderer.js';
import { WebGLRenderer } from '../src/graphics/WebGLRenderer.js';
import { createBox, createSphere } from '../src/geometry/primitives.js';
import { Scene } from '../src/core/Scene.js';
import { Entity } from '../src/core/Entity.js';
import { Mesh } from '../src/graphics/Mesh.js';
import { Mat4 } from '../src/math/Mat4.js';

test('cache retains shared resources and frees geometry removed from a scene', () => {
  const destroyed=[];
  const cache=new GeometryResourceCache(resource=>destroyed.push(resource));
  const a=createBox(), b=createBox();
  let created=0;
  const get=g=>cache.get(g,()=>({id:++created}));
  const shared=get(a);
  assert.equal(get(a),shared);
  get(b);
  cache.sweep(new Set([a]));
  assert.equal(cache.size,1);
  assert.equal(destroyed.length,1);
  cache.sweep(new Set());
  assert.equal(destroyed.length,2);
  assert.equal(cache.size,0);
});

test('dirty geometry refresh releases previous GPU allocation once', () => {
  const destroyed=[];
  const cache=new GeometryResourceCache(r=>destroyed.push(r));
  const sphere=createSphere();
  const first=cache.get(sphere,()=>({id:1}));
  sphere.markDirty();
  const second=cache.get(sphere,()=>({id:2}));
  assert.notEqual(first,second);
  assert.deepEqual(destroyed,[first]);
  cache.clear();
  assert.deepEqual(destroyed,[first,second]);
});

test('WebGPU geometry resource uses uint32 format for large meshes', () => {
  const oldUsage=globalThis.GPUBufferUsage;
  globalThis.GPUBufferUsage={VERTEX:1,INDEX:2,COPY_DST:4};
  try {
    const renderer=new WebGPURenderer({});
    const buffers=[];
    renderer.device={createBuffer(opts){const b={opts,destroyed:false,destroy(){this.destroyed=true}};buffers.push(b);return b;},queue:{writeBuffer(){}}};
    const sphere=createSphere(1,256,256);
    const first=renderer.getGeometry(sphere);
    assert.equal(first.indexFormat,'uint32');
    assert.equal(first.vertexBuffer.opts.size,sphere.vertexCount*32);
    assert.equal(first.indexBuffer.opts.size,sphere.indices.byteLength);
    renderer.cache.sweep(new Set());
    assert.equal(renderer.cache.size,0);
    assert.ok(buffers.every(b=>b.destroyed));
  } finally {
    if(oldUsage===undefined) delete globalThis.GPUBufferUsage;
    else globalThis.GPUBufferUsage=oldUsage;
  }
});

test('WebGL geometry uses UNSIGNED_INT for 32-bit meshes and sets UV attribute',()=>{
  const renderer=new WebGLRenderer({});
  const pointers=[];const deleted=[];
  let id=0;
  renderer.gl={
    UNSIGNED_INT:5125,UNSIGNED_SHORT:5123,FLOAT:5126,ARRAY_BUFFER:1,ELEMENT_ARRAY_BUFFER:2,STATIC_DRAW:3,
    createVertexArray(){return {id:++id}}, createBuffer(){return {id:++id}},
    bindVertexArray(){},bindBuffer(){},bufferData(){},enableVertexAttribArray(){},
    vertexAttribPointer(...args){pointers.push(args)},
    deleteVertexArray(obj){deleted.push(obj)},deleteBuffer(obj){deleted.push(obj)}
  };
  const geometry=createSphere(1,256,256);
  const resource=renderer.getGeometry(geometry);
  assert.equal(resource.indexType,renderer.gl.UNSIGNED_INT);
  assert.equal(pointers.length,3);
  assert.deepEqual(pointers[2],[2,2,renderer.gl.FLOAT,false,32,24]);
  renderer.cache.sweep(new Set());
  assert.equal(deleted.length,3);
});

test('cache creation failure does not replace existing valid resource',()=>{
  const destroyed=[];const cache=new GeometryResourceCache(x=>destroyed.push(x));
  const geometry=createSphere();
  const resource=cache.get(geometry,()=>({id:1}));
  geometry.markDirty();
  assert.throws(()=>cache.get(geometry,()=>{throw new Error('upload failure')}),/upload failure/);
  assert.equal(cache.size,1);
  assert.equal(destroyed.length,0);
  assert.equal(cache.get(geometry,()=>({id:2})).id,2);
  assert.deepEqual(destroyed,[resource]);
});

test('WebGL render path uses the shared queue and releases buffers when a mesh is removed', () => {
  const renderer = new WebGLRenderer({ width: 50, height: 50, clientWidth: 50, clientHeight: 50 });
  let created=0, destroyed=0, drawn=0;
  const gl={
    UNSIGNED_SHORT:5123,UNSIGNED_INT:5125,FLOAT:5126,ARRAY_BUFFER:1,ELEMENT_ARRAY_BUFFER:2,STATIC_DRAW:3,
    COLOR_BUFFER_BIT:1,DEPTH_BUFFER_BIT:2,TRIANGLES:4,
    createVertexArray(){return {id:++created}},createBuffer(){return {id:++created}},
    bindVertexArray(){},bindBuffer(){},bufferData(){},enableVertexAttribArray(){},vertexAttribPointer(){},
    deleteVertexArray(){destroyed++},deleteBuffer(){destroyed++},
    viewport(){},clear(){},useProgram(){},uniformMatrix4fv(){},uniform3fv(){},uniform4fv(){},
    drawElements(mode, count, type){drawn++;assert.equal(type,5123);assert.equal(count,36)}
  };
  renderer.gl=gl;
  renderer.program={};renderer.uniforms={viewProjection:1,eye:2,model:3,color:4};
  const scene=new Scene();const geo=createBox();
  const a=scene.add(new Entity('A').add('mesh',new Mesh(geo)));
  const b=scene.add(new Entity('B').add('mesh',new Mesh(geo)));
  const camera={position:[0,0,4],matrix(){return Mat4.identity()}};
  const oldWindow=globalThis.window;
  globalThis.window={devicePixelRatio:1};
  try {
    renderer.render(scene,camera);
    assert.equal(drawn,2);assert.equal(renderer.cache.size,1);assert.equal(created,3);
    scene.remove(a);
    renderer.render(scene,camera);
    assert.equal(renderer.cache.size,1);assert.equal(destroyed,0);
    scene.remove(b);
    renderer.render(scene,camera);
    assert.equal(renderer.cache.size,0);assert.equal(destroyed,3);
  } finally {
    if(oldWindow===undefined) delete globalThis.window;
    else globalThis.window=oldWindow;
  }
});

test('WebGPU render command passes uint32 index format to the GPU render pass', () => {
  const canvas={width:100,height:80,clientWidth:100,clientHeight:80};
  const renderer=new WebGPURenderer(canvas);
  const oldWindow=globalThis.window,oldUsage=globalThis.GPUBufferUsage;
  globalThis.window={devicePixelRatio:1};
  globalThis.GPUBufferUsage={VERTEX:1,INDEX:2,COPY_DST:4};
  let format=null,draws=0;
  const pass={setPipeline(){},setBindGroup(){},setVertexBuffer(){},setIndexBuffer(_buffer,value){format=value},drawIndexed(){draws++},end(){}};
  renderer.device={
    createBuffer(options){return {options,destroy(){}}},
    queue:{writeBuffer(){},submit(){}},
    createCommandEncoder(){return {beginRenderPass(){return pass},finish(){return {}}}}
  };
  renderer.context={getCurrentTexture(){return {createView(){return {}}}}};
  renderer.depthTexture={createView(){return {}},destroy(){}};
  renderer.cameraBuffer={destroy(){}};
  renderer.objectBuffer={destroy(){}};
  renderer.bindGroup={};renderer.pipeline={};
  const scene=new Scene();
  const sphere=createSphere(1,256,256);
  scene.add(new Entity('Large sphere').add('mesh',new Mesh(sphere)));
  const camera={position:[0,0,5],matrix(){return Mat4.identity()}};
  try {
    renderer.render(scene,camera);
    assert.equal(format,'uint32');
    assert.equal(draws,1);
    assert.equal(renderer.triangles,sphere.indices.length/3);
    assert.equal(renderer.cache.size,1);
    scene.remove(scene.find('Large sphere'));
    renderer.render(scene,camera);
    assert.equal(renderer.cache.size,0);
  } finally {
    if(oldWindow===undefined) delete globalThis.window;
    else globalThis.window=oldWindow;
    if(oldUsage===undefined) delete globalThis.GPUBufferUsage;
    else globalThis.GPUBufferUsage=oldUsage;
  }
});
