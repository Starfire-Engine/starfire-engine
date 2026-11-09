import test from 'node:test';
import assert from 'node:assert/strict';
import { Scene } from '../src/core/Scene.js';
import { Entity } from '../src/core/Entity.js';
import { Mat4 } from '../src/math/Mat4.js';
import { createBox } from '../src/geometry/primitives.js';
import { InstancedMesh } from '../src/graphics/InstancedMesh.js';
import { Mesh } from '../src/graphics/Mesh.js';
import { WebGPURenderer } from '../src/graphics/WebGPURenderer.js';
import { WebGLRenderer } from '../src/graphics/WebGLRenderer.js';
import { PerspectiveCamera } from '../src/core/Camera.js';

function sceneWithInstance(count = 3) {
  const scene = new Scene();
  const matrices = new Float32Array(count * 16);
  for (let i = 0; i < count; i++) matrices.set(Mat4.compose([i*2,0,0]),i*16);
  const mesh = new InstancedMesh(createBox(),{color:[1,0.5,0.2,1]},matrices);
  const entity = new Entity('instanced').add('mesh',mesh);
  scene.add(entity);
  return { scene,entity,mesh };
}

function swap(name,value) {const old=globalThis[name];globalThis[name]=value;return ()=>{
  if(old===undefined) delete globalThis[name]; else globalThis[name]=old;
};}

test('WebGPU submits one instanced draw rather than three, and releases instance buffer',()=>{
  const restoreWindow=swap('window',{devicePixelRatio:1});
  const restoreUsage=swap('GPUBufferUsage',{VERTEX:1,INDEX:2,COPY_DST:4});
  try {
    const {scene,entity}=sceneWithInstance();
    const canvas={clientWidth:64,clientHeight:64,width:64,height:64};
    const r=new WebGPURenderer(canvas);
    const draws=[],pipelines=[];let destroyed=0;
    r.device={createBuffer:()=>({destroy(){destroyed++}}),queue:{writeBuffer(){},submit(){}},
      createCommandEncoder:()=>({beginRenderPass:()=>({setPipeline:p=>pipelines.push(p),
        setBindGroup(){},setVertexBuffer(){},setIndexBuffer(){},drawIndexed:(n,instances)=>draws.push([n,instances]),end(){}}),finish:()=>({})})};
    r.context={getCurrentTexture:()=>({createView:()=>({})})};
    r.depthTexture={createView:()=>({}),destroy(){}};
    r.cameraBuffer={};r.objectBuffer={};r.bindGroup={};
    r.pipeline={tag:'regular'};r.instancedPipeline={tag:'instanced'};
    r.render(scene,{position:[0,0,10],matrix:()=>Mat4.identity()});
    assert.deepEqual(draws,[[36,3]]);
    assert.ok(pipelines.some(p=>p.tag==='instanced'));
    assert.equal(r.drawCalls,1);assert.equal(r.instancesRendered,3);
    assert.equal(r.triangles,36);
    assert.equal(r.instanceCache.size,1);
    assert.ok(r.getDiagnostics().estimatedGPUBytes>0);
    scene.remove(entity);
    r.render(scene,{position:[0,0,10],matrix:()=>Mat4.identity()});
    assert.equal(r.instanceCache.size,0);
    assert.ok(destroyed>=3);
  } finally {restoreWindow();restoreUsage();}
});

test('WebGL 2 submits one instanced draw, correctly sets matrix divisors, and cleans resources',()=>{
  const restoreWindow=swap('window',{devicePixelRatio:1});
  try {
    const {scene,entity}=sceneWithInstance(4);
    const draws=[],divisors=[];let deleted=0;
    const gl={TRIANGLES:4,UNSIGNED_SHORT:5123,UNSIGNED_INT:5125,FLOAT:5126,
      ARRAY_BUFFER:1,ELEMENT_ARRAY_BUFFER:2,STATIC_DRAW:3,COLOR_BUFFER_BIT:16384,DEPTH_BUFFER_BIT:256,
      createBuffer:()=>({}),createVertexArray:()=>({}),
      deleteBuffer(){deleted++},deleteVertexArray(){},bindVertexArray(){},bindBuffer(){},bufferData(){},
      enableVertexAttribArray(){},vertexAttribPointer(){},vertexAttribDivisor:(loc,n)=>divisors.push([loc,n]),
      drawElementsInstanced:(topology,count,type,offset,instanceCount)=>draws.push(instanceCount),
      viewport(){},clear(){},useProgram(){},uniformMatrix4fv(){},uniform3fv(){},uniform4fv(){},uniform1f(){},
      bindTexture(){},bindSampler(){},activeTexture(){},
    };
    const r=new WebGLRenderer({clientWidth:64,clientHeight:64,width:64,height:64});
    r.gl=gl;r.program={};r.instancedProgram={};r.uniforms={};r.instancedUniforms={};
    r.render(scene,{position:[0,0,10],matrix:()=>Mat4.identity()});
    assert.deepEqual(draws,[4]);assert.equal(divisors.length,4);
    assert.deepEqual(divisors.map(x=>x[0]),[3,4,5,6]);
    assert.equal(r.drawCalls,1);assert.equal(r.instancesRendered,4);assert.equal(r.triangles,48);
    scene.remove(entity);r.render(scene,{position:[0,0,10],matrix:()=>Mat4.identity()});
    assert.equal(r.instanceCache.size,0);assert.ok(deleted>=3);
  } finally {restoreWindow();}
});


test('WebGPU separately culls main and shadow pass casters',()=>{
  const restoreWindow=swap('window',{devicePixelRatio:1});
  const restoreUsage=swap('GPUBufferUsage',{VERTEX:1,INDEX:2,COPY_DST:4});
  const restoreTex=swap('GPUTextureUsage',{RENDER_ATTACHMENT:8,TEXTURE_BINDING:16});
  try {
    const scene=new Scene();
    scene.lighting.shadows.enabled=true;
    const near=new Entity('near').add('mesh',new Mesh(createBox(),{color:[1,1,1,1]}));
    scene.add(near);
    const far=new Entity('far').add('mesh',new Mesh(createBox(),{color:[1,1,1,1]}));
    far.transform.position=[1000,0,0];scene.add(far);
    const camera=new PerspectiveCamera({position:[0,0,10],target:[0,0,0]});
    const r=new WebGPURenderer({width:80,height:80,clientWidth:80,clientHeight:80});
    const draws=[];
    r.device={createBuffer:()=>({destroy(){}}),createTexture:()=>({createView:()=>({}),destroy(){}}),
      createBindGroup:()=>({}),queue:{writeBuffer(){},submit(){}},createCommandEncoder:()=>({
        beginRenderPass:(settings)=>({setPipeline(){},setBindGroup(){},setVertexBuffer(){},setIndexBuffer(){},
          drawIndexed:()=>draws.push(settings.colorAttachments.length ? 'main' : 'shadow'),end(){}}),finish:()=>({})})};
    r.context={getCurrentTexture:()=>({createView:()=>({})})};
    r.depthTexture={createView:()=>({})};r.bindGroup={};r.cameraBuffer={};r.objectBuffer={};
    r.pipeline={};r.shadowPipeline={};r.shadowSampler={};r.shadowBindGroupLayout={};
    r.render(scene,camera);
    assert.deepEqual(draws,['shadow','main']);
    assert.equal(r.culledMeshes,1);assert.equal(r.shadowCulled,1);
    assert.equal(r.shadowDrawCalls,1);assert.equal(r.drawCalls,1);
  } finally {restoreWindow();restoreUsage();restoreTex();}
});

test('WebGL culls main and shadow geometry independently',()=>{
  const restoreWindow=swap('window',{devicePixelRatio:1});
  try {
    const scene=new Scene();scene.lighting.shadows.enabled=true;
    const near=new Entity('near').add('mesh',new Mesh(createBox(),{color:[1,1,1,1]}));
    const far=new Entity('far').add('mesh',new Mesh(createBox(),{color:[1,1,1,1]}));
    far.transform.position=[1000,0,0];scene.add(near);scene.add(far);
    const camera=new PerspectiveCamera({position:[0,0,10],target:[0,0,0]});
    let draws=0;
    const gl={FRAMEBUFFER:20,DEPTH_BUFFER_BIT:4,COLOR_BUFFER_BIT:2,TRIANGLES:4,
      UNSIGNED_SHORT:5123,UNSIGNED_INT:5125,FLOAT:5126,ARRAY_BUFFER:1,ELEMENT_ARRAY_BUFFER:2,
      STATIC_DRAW:3,POLYGON_OFFSET_FILL:20,TEXTURE2:33986,TEXTURE0:33984,TEXTURE_2D:3553,
      viewport(){},bindFramebuffer(){},clear(){},colorMask(){},activeTexture(){},bindTexture(){},
      enable(){},disable(){},polygonOffset(){},useProgram(){},uniformMatrix4fv(){},
      uniform3fv(){},uniform4fv(){},uniform1f(){},createVertexArray:()=>({}),createBuffer:()=>({}),
      bindVertexArray(){},bindBuffer(){},bufferData(){},enableVertexAttribArray(){},
      vertexAttribPointer(){},deleteVertexArray(){},deleteBuffer(){},drawElements(){draws++}
    };
    const r=new WebGLRenderer({width:96,height:96,clientWidth:96,clientHeight:96});
    r.gl=gl;r.program={};r.uniforms={};r.shadowProgram={};r.shadowUniforms={};
    r.shadowReady=true;r.shadowFramebuffer={};r.shadowTexture={};r.shadowSize=1024;
    r.render(scene,camera);
    assert.equal(draws,2);assert.equal(r.shadowDrawCalls,1);assert.equal(r.drawCalls,1);
    assert.equal(r.culledMeshes,1);assert.equal(r.shadowCulled,1);
  } finally {restoreWindow();}
});
