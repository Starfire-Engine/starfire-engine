import test from 'node:test';
import assert from 'node:assert/strict';
import { PBRMaterial, resolveMaterial } from '../src/graphics/PBRMaterial.js';
import { Lighting, resolveLighting } from '../src/graphics/Lighting.js';
import { Material } from '../src/graphics/Material.js';
import { Texture2D } from '../src/graphics/Texture2D.js';
import { Scene } from '../src/core/Scene.js';
import { Entity } from '../src/core/Entity.js';
import { Mesh } from '../src/graphics/Mesh.js';
import { createSphere } from '../src/geometry/primitives.js';
import { Mat4 } from '../src/math/Mat4.js';
import { WebGPURenderer } from '../src/graphics/WebGPURenderer.js';
import { WebGLRenderer } from '../src/graphics/WebGLRenderer.js';
import { shaderWGSL, fragmentGLSL } from '../src/graphics/shaders.js';

const rgba = () => new Uint8Array([255, 255, 255, 255]);
const texture = (colorSpace) => Texture2D.fromRGBA(1, 1, rgba(), {colorSpace});

test('PBRMaterial enforces metallic-roughness ranges and linear packed texture', () => {
  const base = texture('srgb'), packed = texture('linear');
  const m = new PBRMaterial({ color: [0.8,0.5,0.2,1], metallic:1, roughness:0,
    baseColorTexture:base, metallicRoughnessTexture:packed, emissive:[0,0.1,0] });
  assert.equal(m.metallic,1);assert.equal(m.roughness,0);
  assert.equal(m.metallicRoughnessTexture,packed);
  assert.deepEqual(m.emissive,[0,0.1,0]);
  assert.throws(()=>new PBRMaterial({roughness:1.01}),/roughness/);
  assert.throws(()=>new PBRMaterial({metallic:-0.1}),/metallic/);
  assert.throws(()=>new PBRMaterial({metallic:NaN}),/metallic/);
  assert.throws(()=>new PBRMaterial({metallicRoughnessTexture:base}),/linear/);
  assert.throws(()=>new PBRMaterial({baseColorTexture:packed}),/sRGB/);
  assert.throws(()=>new PBRMaterial({metallicRoughnessTexture:{}}),/Texture2D/);
  assert.throws(()=>new PBRMaterial({emissive:[1,-1,2]}),/emissive/);
});

test('legacy Material and plain color objects stay non-PBR', () => {
  const original=new Material({color:[1,0,0,1]});
  const plain={color:[0,1,0,1]};
  assert.equal(resolveMaterial(original).isPBR,false);
  assert.equal(resolveMaterial(plain).isPBR,false);
  const pbr=new PBRMaterial({metallic:0.7,roughness:0.3});
  assert.equal(resolveMaterial(pbr).isPBR,true);
  assert.equal(resolveMaterial(pbr).metallic,0.7);
  assert.equal(new Mesh(createSphere(),pbr).material,pbr);
  pbr.metallic=4;
  assert.throws(()=>resolveMaterial(pbr),/metallic/);
});

test('Lighting validates direction, intensity, exposure and color', () => {
  assert.throws(()=>new Lighting({direction:[0,0,0]}),/direction/);
  assert.throws(()=>new Lighting({direction:[0,1,NaN]}),/direction/);
  assert.throws(()=>new Lighting({color:[1,-1,1]}),/color/);
  assert.throws(()=>new Lighting({intensity:-1}),/intensity/);
  assert.throws(()=>new Lighting({ambientIntensity:Infinity}),/ambientIntensity/);
  assert.throws(()=>new Lighting({exposure:0}),/exposure/);
  const scene=new Scene();
  assert.ok(scene.lighting instanceof Lighting);
  scene.lighting.direction=[3,4,0];
  assert.deepEqual(resolveLighting(scene).direction,[.6,.8,0]);
  scene.lighting.exposure=-5;
  assert.throws(()=>resolveLighting(scene),/exposure/);
});

test('WGSL and GLSL shaders implement GGX, Schlick, metal-rough textures, and tone mapping', () => {
  for (const shader of [shaderWGSL,fragmentGLSL]) {
    assert.match(shader,/ggxDistribution/);
    assert.match(shader,/geometrySchlickGGX/);
    assert.match(shader,/fresnelSchlick/);
    assert.match(shader,/toneMapACES/);
    assert.match(shader,/linearToSRGB/);
    assert.match(shader,/metallicRoughnessTexture/i);
    assert.match(shader,/roughness.*mr\.g/);
    assert.match(shader,/metallic.*mr\.b/);
  }
  assert.doesNotMatch(shaderWGSL,/transpose\s*\(\s*inverse\s*\(/);
  assert.match(shaderWGSL,/@group\(1\) @binding\(3\)/);
});

test('WebGPU material bind group contains both texture views and releases dirty packed texture', () => {
  const oldUsage=globalThis.GPUTextureUsage;
  globalThis.GPUTextureUsage={TEXTURE_BINDING:1,COPY_DST:2,RENDER_ATTACHMENT:4};
  try {
    const r=new WebGPURenderer({});
    const groups=[],destroyed=[];
    r.textureBindGroupLayout={};
    r.device={createTexture(o){return {format:o.format,createView(){return {format:o.format}},destroy(){destroyed.push(o.format)}}},
      createSampler(){return {}},createBindGroup(o){groups.push(o);return {id:groups.length}},
      queue:{writeTexture(){}}};
    const packed=texture('linear');
    const material=new PBRMaterial({metallic:0.5,metallicRoughnessTexture:packed});
    const a=r.getMaterialBindGroup(material);
    assert.strictEqual(a,r.getMaterialBindGroup(material));
    assert.equal(groups.length,1);
    assert.deepEqual(groups[0].entries.map(x=>x.binding),[0,1,2,3]);
    assert.equal(groups[0].entries[2].resource.format,'rgba8unorm');
    packed.markDirty();
    const b=r.getMaterialBindGroup(material);
    assert.notStrictEqual(a,b);
    assert.equal(groups.length,2);
    assert.equal(destroyed.length,1);
    r.textureCache.clear();
    assert.equal(r.textureCache.size,0);
  } finally {
    if (oldUsage===undefined) delete globalThis.GPUTextureUsage;
    else globalThis.GPUTextureUsage=oldUsage;
  }
});

test('WebGPU render packs camera lighting and per-object metallic-roughness uniforms', () => {
  const oldWindow=globalThis.window,oldBuff=globalThis.GPUBufferUsage,oldTex=globalThis.GPUTextureUsage;
  globalThis.window={devicePixelRatio:1};
  globalThis.GPUBufferUsage={VERTEX:1,INDEX:2,COPY_DST:4};
  globalThis.GPUTextureUsage={TEXTURE_BINDING:1,COPY_DST:2,RENDER_ATTACHMENT:4};
  try {
    const canvas={width:80,height:60,clientWidth:80,clientHeight:60};
    const r=new WebGPURenderer(canvas), writes=[];
    const pass={setPipeline(){},setBindGroup(){},setVertexBuffer(){},setIndexBuffer(){},drawIndexed(){},end(){}};
    r.device={createBuffer(o){return {o,destroy(){}}},createTexture(){return {createView(){return {}},destroy(){}}},
      createSampler(){return {}},createBindGroup(){return {}},
      queue:{writeBuffer(buffer,offset,data){writes.push({buffer,data:new Float32Array(data)});},writeTexture(){},submit(){}},
      createCommandEncoder(){return {beginRenderPass(){return pass},finish(){return {}}}}};
    r.context={getCurrentTexture(){return {createView(){return {}}}}};
    r.depthTexture={createView(){return {}}};
    r.cameraBuffer={type:'camera'};r.objectBuffer={type:'object'};
    r.pipeline={};r.bindGroup={};r.textureBindGroupLayout={};
    const scene=new Scene();
    scene.lighting=new Lighting({direction:[0,2,0],color:[0.5,1,0.5],intensity:4,
      ambientColor:[1,0.8,0.5],ambientIntensity:0.3,exposure:1.2});
    scene.add(new Entity().add('mesh',new Mesh(createSphere(),new PBRMaterial({metallic:.75,roughness:.25,emissive:[.1,.2,.3]}))));
    r.render(scene,{position:[0,0,5],matrix(){return Mat4.identity()}});
    const camera=writes.find(w=>w.buffer.type==='camera').data;
    const object=writes.find(w=>w.buffer.type==='object').data;
    assert.equal(camera.length,72);
    assert.deepEqual([...camera.slice(16,19)],[0,1,0]);
    assert.deepEqual([...camera.slice(24,28)],[.5,1,.5,4]);
    assert.ok(Math.abs(camera[32]-1.2)<1e-6);
    assert.deepEqual([...object.slice(20,23)],[.75,.25,1]);
    assert.ok(Math.abs(object[24]-.1)<1e-6);
  } finally {
    if(oldWindow===undefined) delete globalThis.window; else globalThis.window=oldWindow;
    if(oldBuff===undefined) delete globalThis.GPUBufferUsage; else globalThis.GPUBufferUsage=oldBuff;
    if(oldTex===undefined) delete globalThis.GPUTextureUsage; else globalThis.GPUTextureUsage=oldTex;
  }
});

test('WebGL2 PBR render binds second linear texture and updates lighting uniforms',()=>{
  const oldWindow=globalThis.window;
  globalThis.window={devicePixelRatio:1};
  try {
    const r=new WebGLRenderer({width:100,height:100,clientWidth:100,clientHeight:100});
    const uniform4=[],uniform3=[],uniform1=[],units=[],samplerUnits=[];
    let drawn=0;
    const gl={
      TEXTURE0:33984,TEXTURE1:33985,TEXTURE_2D:3553,TEXTURE_MIN_FILTER:10241,TEXTURE_MAG_FILTER:10240,
      TEXTURE_WRAP_S:10242,TEXTURE_WRAP_T:10243,UNPACK_ALIGNMENT:3317,
      LINEAR:9729,NEAREST:9728,REPEAT:10497,CLAMP_TO_EDGE:33071,MIRRORED_REPEAT:33648,
      SRGB8_ALPHA8:35907,RGBA8:32856,RGBA:6408,UNSIGNED_BYTE:5121,
      ARRAY_BUFFER:1,ELEMENT_ARRAY_BUFFER:2,FLOAT:5126,STATIC_DRAW:3,
      UNSIGNED_SHORT:5123,UNSIGNED_INT:5125,TRIANGLES:4,COLOR_BUFFER_BIT:1,DEPTH_BUFFER_BIT:2,
      createTexture(){return {}},deleteTexture(){},bindTexture(){},pixelStorei(){},texParameteri(){},texImage2D(){},
      activeTexture(u){units.push(u)},createSampler(){return {}},samplerParameteri(){},bindSampler(unit){samplerUnits.push(unit)},deleteSampler(){},
      createVertexArray(){return {}},createBuffer(){return {}},bindVertexArray(){},bindBuffer(){},bufferData(){},
      enableVertexAttribArray(){},vertexAttribPointer(){},deleteVertexArray(){},deleteBuffer(){},
      viewport(){},clear(){},useProgram(){},uniformMatrix4fv(){},uniform4fv(k,v){uniform4.push([k,Array.from(v)])},
      uniform3fv(k,v){uniform3.push([k,Array.from(v)])},uniform1f(k,v){uniform1.push([k,v])},drawElements(){drawn++}
    };
    r.gl=gl;r.program={};r.texturingReady=true;r.pbrReady=true;
    r.uniforms={viewProjection:1,eye:2,model:3,color:4,pbrParams:5,emissive:6,lightDirection:7,keyLight:8,ambientLight:9,exposure:10};
    const scene=new Scene();
    scene.add(new Entity().add('mesh',new Mesh(createSphere(),new PBRMaterial({metallic:.5,roughness:.3}))));
    r.render(scene,{position:[0,0,5],matrix(){return Mat4.identity()}});
    assert.equal(drawn,1);
    assert.ok(units.includes(gl.TEXTURE1));
    assert.ok(samplerUnits.includes(1));
    assert.deepEqual(uniform4.find(x=>x[0]===5)[1],[.5,.3,1,0]);
    assert.equal(uniform1.find(x=>x[0]===10)[1],1);
    assert.deepEqual(uniform3.find(x=>x[0]===7)[1],resolveLighting(scene).direction);
  } finally {
    if(oldWindow===undefined) delete globalThis.window;
    else globalThis.window=oldWindow;
  }
});
