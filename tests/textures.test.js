import test from 'node:test';
import assert from 'node:assert/strict';
import { Texture2D } from '../src/graphics/Texture2D.js';
import { TextureSampler } from '../src/graphics/TextureSampler.js';
import { TextureManager } from '../src/graphics/TextureManager.js';
import { TextureResourceCache } from '../src/graphics/TextureResourceCache.js';
import { Material } from '../src/graphics/Material.js';
import { Mesh } from '../src/graphics/Mesh.js';
import { WebGPURenderer } from '../src/graphics/WebGPURenderer.js';
import { WebGLRenderer } from '../src/graphics/WebGLRenderer.js';
import { shaderWGSL, fragmentGLSL, vertexGLSL } from '../src/graphics/shaders.js';
import { createPlane } from '../src/geometry/primitives.js';

const rgba = (w, h, value = 127) => new Uint8Array(w * h * 4).fill(value);

test('texture constructors validate data and keep an independent CPU copy', () => {
  const source = rgba(2, 3);
  const texture = Texture2D.fromRGBA(2, 3, source);
  source[0] = 0;
  assert.equal(texture.data[0], 127);
  assert.equal(texture.colorSpace, 'srgb');
  assert.throws(() => { texture.width = 10; }, TypeError);
  assert.equal(texture.version, 0);
  assert.equal(texture.markDirty().version, 1);
  assert.throws(() => Texture2D.fromRGBA(0, 1, rgba(1, 1)), RangeError);
  assert.throws(() => Texture2D.fromRGBA(2, 3, rgba(1, 1)), TypeError);
  assert.throws(() => Texture2D.fromRGBA(1, 1, rgba(1, 1), { colorSpace: 'unknown' }), RangeError);
  assert.throws(() => new Texture2D({ width: 1, height: 1, data: rgba(1, 1), image: {} }), TypeError);
  assert.throws(() => Texture2D.fromImage({ width: 0, height: 1 }), RangeError);
  assert.equal(Texture2D.fromImage({ width: 20, height: 10 }, { colorSpace: 'linear' }).colorSpace, 'linear');
});

test('texture loading handles successful decode, invalid images, and HTTP errors', async () => {
  let blobCalled = 0;
  const loader = (result) => Texture2D.load('/assets/demo.png', {
    fetcher: async () => ({ ok: true, blob: async () => { blobCalled++; return {}; } }),
    decoder: async () => result
  });
  const good = await loader({ width: 8, height: 4 });
  assert.equal(good.width, 8);
  assert.equal(blobCalled, 1);
  let closed = false;
  await assert.rejects(loader({ width: 0, height: 4, close() { closed = true; } }), RangeError);
  assert.equal(closed, true);
  await assert.rejects(Texture2D.load('/missing.png', {
    fetcher: async () => ({ ok: false, status: 404 }), decoder: () => {}
  }), /404/);
});

test('texture manager shares pending and complete requests, separates color spaces and retries failures', async () => {
  let loads = 0;
  let fail = false;
  const manager = new TextureManager({ loader: async (_url, options) => {
    loads++;
    if (fail) throw new Error('network error');
    return Texture2D.fromRGBA(1, 1, rgba(1, 1), options);
  }});
  const a = manager.load('/test.png');
  const b = manager.load('/test.png');
  assert.strictEqual(a, b);
  assert.strictEqual(await a, await manager.load('/test.png'));
  assert.equal(loads, 1);
  assert.notStrictEqual(await manager.load('/test.png', { colorSpace: 'linear' }), await a);
  assert.equal(loads, 2);
  assert.equal(manager.size, 2);
  manager.forget('/test.png');
  fail = true;
  await assert.rejects(manager.load('/test.png'), /network error/);
  await Promise.resolve();
  assert.equal(manager.size, 1);
  fail = false;
  await manager.load('/test.png');
  assert.equal(loads, 4);
  manager.clear();
  assert.equal(manager.size, 0);
});

test('materials validate texture and sampler inputs while preserving plain color materials', () => {
  const texture = Texture2D.fromRGBA(1, 1, rgba(1, 1));
  const sampler = new TextureSampler({ wrapU: 'clamp-to-edge', minFilter: 'nearest' });
  const mat = new Material({ color: [1, .5, .25, 1], baseColorTexture: texture, sampler });
  assert.strictEqual(new Mesh(createPlane(), mat).material, mat);
  assert.deepEqual(mat.color, [1, .5, .25, 1]);
  const legacy = { color: [1, 1, 1, 1] };
  assert.strictEqual(new Mesh(createPlane(), legacy).material, legacy);
  assert.throws(() => new Material({ baseColorTexture: {} }), TypeError);
  assert.throws(() => new Material({ color: [1, 2, 3] }), TypeError);
  assert.throws(() => new TextureSampler({ minFilter: 'anisotropic' }), RangeError);
  assert.throws(() => new TextureSampler({ wrapV: 'invalid' }), RangeError);
  assert.throws(() => new Mesh(createPlane(), { color: [1, 2, 3, 4], sampler: {} }), TypeError);
  assert.equal(Object.isFrozen(sampler), true);
});

test('texture resource cache honors identity, dirty versions and cleanup', () => {
  const freed = [];
  let next = 0;
  const cache = new TextureResourceCache(r => freed.push(r));
  const a = Texture2D.fromRGBA(1, 1, rgba(1, 1));
  const b = Texture2D.fromRGBA(1, 1, rgba(1, 1));
  const get = t => cache.get(t, () => ({ id: ++next }));
  const a1 = get(a);
  assert.strictEqual(get(a), a1);
  get(b);
  a.markDirty();
  const a2 = get(a);
  assert.notStrictEqual(a1, a2);
  assert.deepEqual(freed, [a1]);
  cache.sweep(new Set([a]));
  assert.equal(freed.length, 2);
  cache.clear();
  assert.deepEqual(freed.at(-1), a2);
  assert.equal(cache.size, 0);
});

test('shaders sample UV textures on WebGPU and WebGL2', () => {
  assert.match(vertexGLSL, /vUV = aUV/);
  assert.match(fragmentGLSL, /texture\(uBaseColorTexture, vUV\)/);
  assert.match(shaderWGSL, /@group\(1\) @binding\(0\) var baseColorTexture/);
  assert.match(shaderWGSL, /textureSample\(baseColorTexture, baseColorSampler, input.uv\)/);
});

test('WebGPU RGBA uploads pad rows, use sRGB format, and replace dirty textures', () => {
  const oldUsage = globalThis.GPUTextureUsage;
  globalThis.GPUTextureUsage = { TEXTURE_BINDING: 1, COPY_DST: 2, RENDER_ATTACHMENT: 4 };
  try {
    const r = new WebGPURenderer({});
    const resources = [], uploads = [];
    r.device = {
      createTexture(options) {
        const out = { options, destroyed: false, createView() {return {id:resources.length};}, destroy(){this.destroyed=true;} };
        resources.push(out);
        return out;
      },
      queue: { writeTexture(destination, bytes, layout, dimension) {
        uploads.push({destination, bytes: Uint8Array.from(bytes), layout, dimension});
      }}
    };
    const texture = Texture2D.fromRGBA(3, 2, Uint8Array.from({length:24}, (_,i)=>i));
    assert.strictEqual(r.getTexture(texture), r.getTexture(texture));
    assert.equal(resources.length, 1);
    assert.equal(resources[0].options.format, 'rgba8unorm-srgb');
    assert.equal(uploads[0].layout.bytesPerRow, 256);
    assert.equal(uploads[0].bytes.length, 512);
    assert.deepEqual([...uploads[0].bytes.slice(256,268)], [...texture.data.slice(12,24)]);
    texture.markDirty();
    r.getTexture(texture);
    assert.equal(resources.length, 2);
    assert.ok(resources[0].destroyed);
    r.textureCache.sweep(new Set());
    assert.ok(resources[1].destroyed);
  } finally { if (oldUsage === undefined) delete globalThis.GPUTextureUsage; else globalThis.GPUTextureUsage = oldUsage; }
});

test('WebGPU external image copy creates linear texture and binds sampler once per variant', () => {
  const oldUsage = globalThis.GPUTextureUsage;
  globalThis.GPUTextureUsage = { TEXTURE_BINDING: 1, COPY_DST: 2, RENDER_ATTACHMENT: 4 };
  try {
    const r = new WebGPURenderer({});
    const copied = [], samplerOptions = [], groups = [];
    r.textureBindGroupLayout = {id:1};
    r.device = {
      createTexture(options) {return { options, createView(){return {};},destroy(){} };},
      createSampler(options) {samplerOptions.push(options);return {};},
      createBindGroup(options) {groups.push(options);return {};},
      queue: { copyExternalImageToTexture(...args) { copied.push(args); } }
    };
    const tex = Texture2D.fromImage({width:32,height:16},{colorSpace:'linear'});
    const material = new Material({baseColorTexture:tex,sampler:new TextureSampler({wrapV:'mirror-repeat'})});
    r.getMaterialBindGroup(material);
    r.getMaterialBindGroup(material);
    assert.equal(copied.length, 1);
    assert.equal(copied[0][1].texture.options.format, 'rgba8unorm');
    assert.equal(copied[0][0].flipY, false);
    assert.equal(groups.length, 1);
    assert.equal(samplerOptions[0].addressModeV, 'mirror-repeat');
    tex.markDirty();
    r.getMaterialBindGroup(material);
    assert.equal(groups.length, 2);
  } finally { if (oldUsage === undefined) delete globalThis.GPUTextureUsage; else globalThis.GPUTextureUsage = oldUsage; }
});

test('WebGL2 uploads RGBA and image sources with sRGB/linear formats, cache and samplers', () => {
  const r = new WebGLRenderer({});
  let id = 0;
  const calls = [], deleted = [], states=[];
  const gl = {
    TEXTURE_2D:3553,TEXTURE_MIN_FILTER:10241,TEXTURE_MAG_FILTER:10240,
    TEXTURE_WRAP_S:10242,TEXTURE_WRAP_T:10243,UNPACK_ALIGNMENT:3317,
    LINEAR:9729, NEAREST:9728, REPEAT:10497, CLAMP_TO_EDGE:33071, MIRRORED_REPEAT:33648,
    SRGB8_ALPHA8:35907,RGBA8:32856,RGBA:6408,UNSIGNED_BYTE:5121,
    createTexture(){return {id:++id}},deleteTexture(x){deleted.push(x)},
    bindTexture(){},pixelStorei(){},texParameteri(){},
    texImage2D(...x){calls.push(x)},
    createSampler(){return {id:++id}}, samplerParameteri(...a){states.push(a)},deleteSampler(x){deleted.push(x)}
  };
  r.gl = gl;
  const a = Texture2D.fromRGBA(1, 1, rgba(1, 1));
  const b = Texture2D.fromImage({width:4,height:2},{colorSpace:'linear'});
  r.getTexture(a);
  r.getTexture(a);
  r.getTexture(b);
  assert.equal(calls.length, 2);
  assert.equal(calls[0][2], gl.SRGB8_ALPHA8);
  assert.equal(calls[1][2], gl.RGBA8);
  assert.equal(calls[1].length, 6);
  const sampler = new TextureSampler({wrapU:'mirror-repeat',magFilter:'nearest'});
  assert.strictEqual(r.getSampler(sampler),r.getSampler(sampler));
  assert.equal(states.length, 4);
  assert.ok(states.some(x=>x[2]===gl.MIRRORED_REPEAT));
  a.markDirty();r.getTexture(a);
  assert.equal(calls.length, 3);
  assert.equal(deleted.length, 1);
  r.textureCache.sweep(new Set());
  assert.equal(deleted.length, 3);
});

import { Scene } from '../src/core/Scene.js';
import { Entity } from '../src/core/Entity.js';
import { Mat4 } from '../src/math/Mat4.js';

const camera = { position: [0, 0, 5], matrix() { return Mat4.identity(); } };

// End-to-end render-recording checks use fake GPU commands; they do not replace
// a real-browser shader compilation and texture-orientation test.
test('WebGPU renders textured and untextured meshes with separate bind groups', () => {
  const oldWindow = globalThis.window, oldBuff = globalThis.GPUBufferUsage, oldTex = globalThis.GPUTextureUsage;
  globalThis.window = { devicePixelRatio: 1 };
  globalThis.GPUBufferUsage = { VERTEX: 1, INDEX: 2, COPY_DST: 4 };
  globalThis.GPUTextureUsage = { TEXTURE_BINDING: 1, COPY_DST: 2, RENDER_ATTACHMENT: 4 };
  try {
    const r = new WebGPURenderer({ width: 80, height: 60, clientWidth: 80, clientHeight: 60 });
    const bound = [], uploaded = [], deleted = [];
    const pass = {
      setPipeline(){}, setBindGroup(index, group){bound.push({index,group})},
      setVertexBuffer(){}, setIndexBuffer(){}, drawIndexed(){}, end(){}
    };
    r.device = {
      createBuffer(){return {destroy(){}}},
      createTexture(){return {createView(){return {}},destroy(){deleted.push('texture')}}},
      createSampler(){return {}},
      createBindGroup(){return {id:bound.length}},
      createCommandEncoder(){return {beginRenderPass(){return pass},finish(){return {}}}},
      queue:{writeBuffer(){},writeTexture(...args){uploaded.push(args)},submit(){}}
    };
    r.pipeline = {};
    r.context = {getCurrentTexture(){return {createView(){return {}}}}};
    r.depthTexture = {createView(){return {}}};
    r.cameraBuffer = {};r.objectBuffer = {};
    r.bindGroup = {};
    r.textureBindGroupLayout = {};
    const tex = Texture2D.fromRGBA(1, 1, rgba(1, 1));
    const scene = new Scene();
    scene.add(new Entity('textured').add('mesh',new Mesh(createPlane(),new Material({baseColorTexture:tex}))));
    scene.add(new Entity('plain').add('mesh',new Mesh(createPlane(),{color:[1,1,1,1]})));
    r.render(scene,camera);
    assert.deepEqual(bound.map(b=>b.index),[0,1,0,1]);
    assert.equal(uploaded.length, 2); // textured + 1-pixel white fallback
    assert.equal(r.textureCache.size, 2);
    scene.remove(scene.find('textured'));
    r.render(scene,camera);
    assert.equal(r.textureCache.size, 1);
    assert.equal(deleted.length, 1);
  } finally {
    if (oldWindow === undefined) delete globalThis.window; else globalThis.window=oldWindow;
    if (oldBuff === undefined) delete globalThis.GPUBufferUsage; else globalThis.GPUBufferUsage=oldBuff;
    if (oldTex === undefined) delete globalThis.GPUTextureUsage; else globalThis.GPUTextureUsage=oldTex;
  }
});

test('WebGL renders textured and legacy materials, then releases removed textures', () => {
  const oldWindow = globalThis.window;
  globalThis.window = { devicePixelRatio: 1 };
  try {
    const r = new WebGLRenderer({ width: 80, height: 60, clientWidth: 80, clientHeight: 60 });
    let drawn = 0, boundTextures = 0, deletedTextures = 0;
    const gl = {
      TEXTURE_2D:3553,TEXTURE0:33984, TEXTURE_MIN_FILTER:10241,TEXTURE_MAG_FILTER:10240,
      TEXTURE_WRAP_S:10242,TEXTURE_WRAP_T:10243,UNPACK_ALIGNMENT:3317,
      LINEAR:9729,NEAREST:9728,REPEAT:10497,CLAMP_TO_EDGE:33071,MIRRORED_REPEAT:33648,
      SRGB8_ALPHA8:35907,RGBA8:32856,RGBA:6408,UNSIGNED_BYTE:5121,
      ARRAY_BUFFER:1,ELEMENT_ARRAY_BUFFER:2,FLOAT:5126,STATIC_DRAW:3,
      UNSIGNED_SHORT:5123,UNSIGNED_INT:5125,TRIANGLES:4,COLOR_BUFFER_BIT:1,DEPTH_BUFFER_BIT:2,
      createTexture(){return {}},deleteTexture(){deletedTextures++},bindTexture(_type,tex){if(tex)boundTextures++},
      pixelStorei(){},texParameteri(){},texImage2D(){},activeTexture(){},
      createSampler(){return {}},samplerParameteri(){},bindSampler(){},deleteSampler(){},
      createVertexArray(){return {}}, createBuffer(){return {}},
      bindVertexArray(){},bindBuffer(){},bufferData(){},enableVertexAttribArray(){},vertexAttribPointer(){},
      deleteVertexArray(){},deleteBuffer(){},viewport(){},clear(){},useProgram(){},
      uniformMatrix4fv(){},uniform3fv(){},uniform4fv(){},drawElements(){drawn++}
    };
    r.gl=gl;
    r.program={};
    r.uniforms={};
    r.texturingReady=true;
    const tex = Texture2D.fromRGBA(1,1,rgba(1,1));
    const scene=new Scene();
    scene.add(new Entity('textured').add('mesh',new Mesh(createPlane(),new Material({baseColorTexture:tex}))));
    scene.add(new Entity('legacy').add('mesh',new Mesh(createPlane(),{color:[.7,.7,.7,1]})));
    r.render(scene,camera);
    assert.equal(drawn,2);
    assert.equal(r.textureCache.size,2);
    assert.ok(boundTextures>=2);
    scene.remove(scene.find('textured'));
    r.render(scene,camera);
    assert.equal(deletedTextures,1);
    assert.equal(r.textureCache.size,1);
  } finally { if(oldWindow===undefined)delete globalThis.window; else globalThis.window=oldWindow; }
});
