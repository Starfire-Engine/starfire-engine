import test from 'node:test';
import assert from 'node:assert/strict';
import { Mat4 } from '../src/math/Mat4.js';
import { ShadowSettings, resolveShadowSettings, shadowViewProjection } from '../src/graphics/ShadowSettings.js';
import { EnvironmentLighting, resolveEnvironment } from '../src/graphics/EnvironmentLighting.js';
import { Lighting, resolveLighting } from '../src/graphics/Lighting.js';
import { Scene } from '../src/core/Scene.js';
import { Entity } from '../src/core/Entity.js';
import { Mesh } from '../src/graphics/Mesh.js';
import { createBox } from '../src/geometry/primitives.js';
import { WebGPURenderer } from '../src/graphics/WebGPURenderer.js';
import { WebGLRenderer } from '../src/graphics/WebGLRenderer.js';
import { shaderWGSL, fragmentGLSL, shadowVertexGLSL, shadowFragmentGLSL } from '../src/graphics/shaders.js';

const close = (a,b) => assert.ok(Math.abs(a-b) < 1e-5, `${a} ≠ ${b}`);
const swap = (key, value) => {const old=globalThis[key]; globalThis[key]=value;
  return ()=>{if(old===undefined)delete globalThis[key];else globalThis[key]=old;};};

const shadowScene = () => {
  const scene = new Scene();
  scene.lighting = new Lighting({ shadows: new ShadowSettings({enabled:true,mapSize:256}),
    environment: new EnvironmentLighting({intensity:1.25}) });
  scene.add(new Entity().add('mesh', new Mesh(createBox())));
  return scene;
};

test('orthographic WebGPU/WebGL depth conventions map near and far planes correctly', () => {
  for (const [mode, expectedNear] of [['webgpu',0],['webgl',-1]]) {
    const matrix=Mat4.orthographic(-3,3,-2,2,.5,50,mode);
    close(Mat4.transformPoint(matrix,[0,0,-.5])[2],expectedNear);
    close(Mat4.transformPoint(matrix,[0,0,-50])[2],1);
    close(Mat4.transformPoint(matrix,[3,2,-2])[0],1);
    close(Mat4.transformPoint(matrix,[3,2,-2])[1],1);
  }
  assert.throws(()=>Mat4.orthographic(1,1,-1,1,.1,10),RangeError);
  assert.throws(()=>Mat4.orthographic(-1,1,-1,1,10,1),RangeError);
  assert.throws(()=>Mat4.orthographic(-1,1,-1,1,.1,10,'unknown'),TypeError);
});

test('ShadowSettings validates map resolution, light direction and mutable state',()=>{
  assert.throws(()=>new ShadowSettings({mapSize:128}),/mapSize/);
  assert.throws(()=>new ShadowSettings({radius:0}),/radius/);
  assert.throws(()=>new ShadowSettings({bias:-1}),/bias/);
  assert.throws(()=>new ShadowSettings({strength:1.5}),/strength/);
  assert.throws(()=>new ShadowSettings({near:5,far:3}),/far/);
  assert.throws(()=>new ShadowSettings({center:[1,2,NaN]}),/center/);
  const s=new ShadowSettings({enabled:true,mapSize:512,center:[0,0,0]});
  const gpu=shadowViewProjection([.5,1,.2],s,'webgpu');
  const gl=shadowViewProjection([.5,1,.2],s,'webgl');
  assert.equal(gpu.length,16);
  assert.equal(gl.length,16);
  assert.notDeepEqual([...gpu],[...gl]);
  assert.throws(()=>shadowViewProjection([0,0,0],s),/direction/);
  s.mapSize=900;
  assert.throws(()=>resolveShadowSettings(s),/mapSize/);
});

test('near-vertical shadow light direction uses stable lookAt basis',()=>{
  for(const direction of [[0,1,0],[0,-1,0],[0,1e3,1]]){
    const matrix=shadowViewProjection(direction,new ShadowSettings());
    assert.ok([...matrix].every(Number.isFinite));
  }
});

test('environment lighting colors and intensity validate, including post-construction mutations',()=>{
  const env=new EnvironmentLighting({skyColor:[.2,.4,.9],intensity:2});
  assert.deepEqual(resolveEnvironment(env).skyColor,[.2,.4,.9]);
  assert.throws(()=>new EnvironmentLighting({intensity:-1}),/intensity/);
  assert.throws(()=>new EnvironmentLighting({groundColor:[0,NaN,1]}),/groundColor/);
  assert.throws(()=>new Lighting({environment:{}}),/environment/);
  env.intensity=Infinity;
  assert.throws(()=>resolveEnvironment(env),/intensity/);
});

test('Lighting retains disabled shadows/env defaults and validates nested mutable params',()=>{
  const scene=new Scene();
  const original=resolveLighting(scene);
  assert.equal(original.shadows.enabled,false);
  assert.equal(original.environment.intensity,0);
  scene.lighting.shadows.enabled=true;
  scene.lighting.environment.intensity=2;
  assert.equal(resolveLighting(scene).environment.intensity,2);
  scene.lighting.shadows.bias=-1;
  assert.throws(()=>resolveLighting(scene),/bias/);
});

test('both shaders expose shadow PCF and procedural ambient reflection path',()=>{
  assert.match(shaderWGSL, /textureSampleCompareLevel/);
  assert.match(shaderWGSL, /@group\(2\) @binding\(0\)/);
  assert.match(shaderWGSL, /@vertex\s+fn shadowVertex/);
  assert.match(fragmentGLSL, /sampler2DShadow uShadowMap/);
  assert.match(fragmentGLSL, /shadowVisibility/);
  assert.match(fragmentGLSL, /environmentRadiance/);
  assert.match(shaderWGSL, /environmentRadiance/);
  assert.match(shadowVertexGLSL,/uShadowViewProjection/);
  assert.match(shadowFragmentGLSL,/void main/);
});

test('WebGPU shadow texture reuses resources until size changes, then destroys the old map',()=>{
  const restore=swap('GPUTextureUsage',{RENDER_ATTACHMENT:4,TEXTURE_BINDING:8});
  try {
    const r=new WebGPURenderer({});let created=0, destroyed=0, groups=0;
    r.shadowBindGroupLayout={};r.shadowSampler={};
    r.device={createTexture({size}){created++;return {size,createView(){return {size}},destroy(){destroyed++}}},
      createBindGroup(){groups++;return {group:groups}}};
    r.ensureShadowResources(256);
    const first=r.shadowBindGroup;
    r.ensureShadowResources(256);
    assert.equal(created,1);
    r.ensureShadowResources(512);
    assert.equal(created,2);
    assert.equal(destroyed,1);
    assert.notStrictEqual(first,r.shadowBindGroup);
    assert.equal(r.shadowSize,512);
    r.device.createBindGroup=()=>{throw new Error('bind failure')};
    assert.throws(()=>r.ensureShadowResources(1024),/bind failure/);
    assert.equal(destroyed,2);
    assert.equal(r.shadowSize,512);
    r.shadowTexture.destroy();
    assert.equal(destroyed,3);
  } finally {restore();}
});

test('WebGPU uses depth pass before main pass and packs shadow + environment uniforms',()=>{
  const restoreWindow=swap('window',{devicePixelRatio:1});
  const restoreBuff=swap('GPUBufferUsage',{VERTEX:1,INDEX:2,COPY_DST:4});
  const restoreTex=swap('GPUTextureUsage',{RENDER_ATTACHMENT:4,TEXTURE_BINDING:8});
  try {
    const r=new WebGPURenderer({width:90,height:90,clientWidth:90,clientHeight:90});
    const passes=[],writes=[];
    const makePass=(p)=>({setPipeline(){},setBindGroup(){},setVertexBuffer(){},setIndexBuffer(){},
      drawIndexed(){p.draws++},end(){}});
    r.device={createTexture:({size})=>({size,createView(){return {}},destroy(){}}),
      createBuffer:()=>({destroy(){}}),createBindGroup:()=>({}),
      queue:{writeBuffer(buf,off,data){writes.push({buf,data:new Float32Array(data)})},submit(){}},
      createCommandEncoder(){return {beginRenderPass(options){const p={options,draws:0};passes.push(p);return makePass(p)},finish(){return {}}}}};
    r.context={getCurrentTexture:()=>({createView:()=>({})})};
    r.depthTexture={createView:()=>({})};
    r.shadowPipeline={};r.pipeline={};r.shadowSampler={};r.shadowBindGroupLayout={};
    r.bindGroup={};r.cameraBuffer={kind:'camera'};r.objectBuffer={kind:'object'};
    const scene=shadowScene();
    r.render(scene,{position:[2,5,7],matrix:()=>Mat4.identity()});
    assert.equal(passes.length,2);
    assert.equal(passes[0].options.colorAttachments.length,0);
    assert.equal(passes[0].draws,1);
    assert.equal(passes[1].draws,1);
    assert.equal(r.shadowDrawCalls,1);
    assert.equal(r.drawCalls,1);
    const camera=writes.find(w=>w.buf.kind==='camera').data;
    assert.equal(camera.length,72);
    assert.equal(camera[52],1);
    close(camera[53],.002);
    close(camera[55],1/256);
    close(camera[68],1.25);
    // Scene can turn shadows off without changing the renderer.
    scene.lighting.shadows.enabled=false;
    r.render(scene,{position:[2,5,7],matrix:()=>Mat4.identity()});
    assert.equal(passes.length,3);
    assert.equal(r.shadowDrawCalls,0);
    assert.equal(writes.filter(w=>w.buf.kind==='camera').at(-1).data[52],0);
  } finally {restoreWindow();restoreBuff();restoreTex();}
});

test('WebGL shadow framebuffer reallocation and incomplete framebuffer failure cleanup',()=>{
  const r=new WebGLRenderer({});
  let created=0,destroyedTex=0,destroyedFbo=0;
  const gl={TEXTURE_2D:1,FRAMEBUFFER:2,DEPTH_ATTACHMENT:3,DEPTH_COMPONENT24:4,DEPTH_COMPONENT:5,
    UNSIGNED_INT:6,TEXTURE_MIN_FILTER:7,TEXTURE_MAG_FILTER:8,TEXTURE_WRAP_S:9,TEXTURE_WRAP_T:10,
    TEXTURE_COMPARE_MODE:11,TEXTURE_COMPARE_FUNC:12,COMPARE_REF_TO_TEXTURE:13,LEQUAL:14,
    NEAREST:15,CLAMP_TO_EDGE:16,NONE:0,FRAMEBUFFER_COMPLETE:23,
    createTexture(){return {id:++created}},createFramebuffer(){return {id:++created}},
    deleteTexture(){destroyedTex++},deleteFramebuffer(){destroyedFbo++},
    bindTexture(){},texImage2D(){},texParameteri(){},bindFramebuffer(){},framebufferTexture2D(){},
    drawBuffers(){},readBuffer(){},checkFramebufferStatus(){return gl.FRAMEBUFFER_COMPLETE}};
  r.gl=gl;r.ensureShadowResources(256);r.ensureShadowResources(256);
  assert.equal(created,2);
  r.ensureShadowResources(512);
  assert.equal(created,4);assert.equal(destroyedTex,1);assert.equal(destroyedFbo,1);
  gl.checkFramebufferStatus=()=>-1;
  assert.throws(()=>r.ensureShadowResources(1024),/incomplete/);
  assert.equal(r.shadowSize,512);
  assert.equal(destroyedTex,2);assert.equal(destroyedFbo,2);
});

test('WebGL shadow renderer submits a depth pass and restores the framebuffer before color pass',()=>{
  const restore=swap('window',{devicePixelRatio:1});
  try {
    const r=new WebGLRenderer({width:80,height:80,clientWidth:80,clientHeight:80});
    const steps=[];const gl={
      FRAMEBUFFER:9,DEPTH_BUFFER_BIT:4,COLOR_BUFFER_BIT:2,TRIANGLES:4,UNSIGNED_SHORT:5123,
      UNSIGNED_INT:5125,FLOAT:5126,ARRAY_BUFFER:1,ELEMENT_ARRAY_BUFFER:2,STATIC_DRAW:3,
      POLYGON_OFFSET_FILL:20,
      viewport(){},bindFramebuffer(t,fb){steps.push(fb?'shadow-fbo':'canvas-fbo')},
      clear(mask){steps.push(mask===4?'shadow-clear':'main-clear')},colorMask(){},activeTexture(){},bindTexture(){},TEXTURE2:33986,TEXTURE0:33984,TEXTURE_2D:3553,
      enable(){},disable(){},polygonOffset(){},useProgram(p){steps.push(p.name)},
      uniformMatrix4fv(){},uniform3fv(){},uniform4fv(){},uniform1f(){},
      createVertexArray(){return {}},createBuffer(){return {}},bindVertexArray(){},bindBuffer(){},bufferData(){},
      enableVertexAttribArray(){},vertexAttribPointer(){},deleteVertexArray(){},deleteBuffer(){},
      drawElements(){steps.push('draw')}
    };
    r.gl=gl;r.program={name:'main-program'};r.shadowProgram={name:'shadow-program'};
    r.uniforms={};r.shadowUniforms={};r.shadowReady=true;
    r.shadowFramebuffer={};r.shadowTexture={};r.shadowSize=256;
    const scene=shadowScene();
    r.render(scene,{position:[0,5,5],matrix:()=>Mat4.identity()});
    assert.deepEqual(steps.filter(x=>x==='draw'),['draw','draw']);
    assert.ok(steps.indexOf('shadow-fbo') < steps.indexOf('shadow-clear'));
    assert.ok(steps.indexOf('canvas-fbo') < steps.indexOf('main-clear'));
    assert.equal(r.shadowDrawCalls,1);
  } finally {restore();}
});

test('WebGPU startup builds normal and instanced color/depth pipelines, comparison sampler and fallback map', async()=>{
  const oldNav=Object.getOwnPropertyDescriptor(globalThis,'navigator');
  const restoreWin=swap('window',{devicePixelRatio:1});
  const restoreBuff=swap('GPUBufferUsage',{UNIFORM:1,COPY_DST:2});
  const restoreTex=swap('GPUTextureUsage',{RENDER_ATTACHMENT:4,TEXTURE_BINDING:8});
  const restoreStage=swap('GPUShaderStage',{VERTEX:1,FRAGMENT:2});
  let buffers=[],pipelines=[],samplers=[],tex=[];
  try {
    const device={
      lost:new Promise(()=>{}),
      createBuffer(o){buffers.push(o);return {destroy(){}}},
      createBindGroupLayout:o=>o,createBindGroup:o=>o,createPipelineLayout:o=>o,
      createSampler(o){samplers.push(o);return {}},
      createShaderModule:()=>({getCompilationInfo:async()=>({messages:[]})}),
      createRenderPipeline(o){pipelines.push(o);return {}},
      createTexture(o){tex.push(o);return {createView(){return {}},destroy(){}}}
    };
    Object.defineProperty(globalThis,'navigator',{configurable:true,value:{gpu:{
      requestAdapter:async()=>({requestDevice:async()=>device}),
      getPreferredCanvasFormat:()=> 'bgra8unorm'
    }}});
    const context={configure(){}};
    const canvas={width:64,height:64,clientWidth:64,clientHeight:64,getContext:()=>context};
    const r=new WebGPURenderer(canvas);
    await r.initialize();
    assert.equal(buffers[0].size,288);
    assert.equal(pipelines.length,4);
    assert.equal(pipelines[2].vertex.entryPoint,'shadowVertex');
    assert.equal(pipelines[3].vertex.buffers.length,2);
    assert.equal(pipelines[0].layout.bindGroupLayouts.length,3);
    assert.ok(samplers.some(o=>o.compare==='less-equal'));
    assert.ok(tex.some(o=>o.format==='depth24plus' && o.size[0]===1));
    r.dispose();
  } finally {
    if(oldNav)Object.defineProperty(globalThis,'navigator',oldNav);
    else delete globalThis.navigator;
    restoreWin();restoreBuff();restoreTex();restoreStage();
  }
});

test('WebGL shadow pass restores framebuffer and color writes if drawing throws',()=>{
  const restore=swap('window',{devicePixelRatio:1});
  try{
    const r=new WebGLRenderer({width:80,height:80,clientWidth:80,clientHeight:80});
    let bound='canvas';const colors=[];
    const gl={FRAMEBUFFER:9,DEPTH_BUFFER_BIT:4,TRIANGLES:4,UNSIGNED_SHORT:5123,FLOAT:5126,
      ARRAY_BUFFER:1,ELEMENT_ARRAY_BUFFER:2,STATIC_DRAW:3,POLYGON_OFFSET_FILL:20,
      viewport(){},bindFramebuffer(_target,fb){bound=fb?'shadow':'canvas'},clear(){},colorMask(...args){colors.push(args)},
      enable(){},disable(){},polygonOffset(){},useProgram(){},uniformMatrix4fv(){},
      createVertexArray(){return {}},createBuffer(){return {}},bindVertexArray(){},bindBuffer(){},bufferData(){},
      enableVertexAttribArray(){},vertexAttribPointer(){},
      drawElements(){throw new Error('draw failed')}
    };
    r.gl=gl;r.program={};r.shadowProgram={};r.shadowUniforms={};r.shadowReady=true;
    r.shadowFramebuffer={};r.shadowTexture={};r.shadowSize=256;
    assert.throws(()=>r.render(shadowScene(),{position:[0,0,5],matrix:()=>Mat4.identity()}),/draw failed/);
    assert.equal(bound,'canvas');
    assert.deepEqual(colors.at(-1),[true,true,true,true]);
  }finally{restore();}
});
