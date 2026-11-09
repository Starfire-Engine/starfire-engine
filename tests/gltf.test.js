import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { GLTFLoader, parseGLB, decodeAccessor, PBRMaterial } from '../src/index.js';

const fixture = new URL('../assets/models/starfire-relay.glb', import.meta.url);
const createBitmap = () => ({ width: 128, height: 128, closed: false, close() { this.closed = true; } });
const loader = (args = {}) => new GLTFLoader({ imageDecoder: async () => createBitmap(), ...args });
const makeAccessorDocument = ({ positions, indices = [0,1,2], uv = null } = {}) => {
  const floats = positions ?? [0,0,0, 1,0,0, 0,1,0];
  const verts = new Float32Array(floats);
  const idx = new Uint16Array(indices);
  let buffers = [new Uint8Array(verts.buffer), new Uint8Array(idx.buffer)];
  let views = [{buffer:0,byteLength:verts.byteLength},{buffer:1,byteLength:idx.byteLength}];
  let accessors = [
    {bufferView:0,componentType:5126,count:verts.length/3,type:'VEC3'},
    {bufferView:1,componentType:5123,count:idx.length,type:'SCALAR'}
  ];
  const attrs = { POSITION:0 };
  if (uv) {
    const tex = new Float32Array(uv);
    buffers.push(new Uint8Array(tex.buffer));views.push({buffer:2,byteLength:tex.byteLength});
    accessors.push({bufferView:2,componentType:5126,count:tex.length/2,type:'VEC2'});
    attrs.TEXCOORD_0=2;
  }
  const doc={asset:{version:'2.0'},buffers:[],bufferViews:views,accessors,
    meshes:[{primitives:[{attributes:attrs,indices:1}]}],nodes:[{mesh:0}],scenes:[{nodes:[0]}],scene:0};
  // Use data URIs to test the public parse() path without filesystem fetch.
  doc.buffers = buffers.map(bytes=>({byteLength:bytes.length,uri:'data:application/octet-stream;base64,'+Buffer.from(bytes).toString('base64')}));
  return doc;
};

test('original Starfire GLB fixture has valid header and expected embedded images', async () => {
  const blob = await readFile(fixture);
  const { json, binaryChunk } = parseGLB(blob);
  assert.equal(json.asset.version, '2.0');
  assert.equal(json.images.length, 2);
  assert.equal(json.nodes.length, 8);
  assert.ok(binaryChunk.byteLength > 0);
});

test('GLB loader creates nested scene, PBR materials and shared GLB textures', async () => {
  const bytes=await readFile(fixture);
  const result=await loader().parse(bytes);
  assert.equal(result.roots.length, 1);
  assert.equal(result.scene.entities.size, 8);
  assert.equal(result.scene.query('mesh').length, 7);
  assert.equal(result.roots[0].name, 'Starfire Relay');
  assert.deepEqual(result.roots[0].transform.position, [0,1.6,4.8]);
  assert.equal(result.roots[0].children.size, 7);
  assert.equal(result.textures.length, 2);
  const metal = result.scene.find('Core housing').get('mesh').material;
  assert.ok(metal instanceof PBRMaterial);
  assert.equal(metal.metallic, .8);
  const patterned = result.scene.find('Signal topper').get('mesh').material;
  assert.equal(patterned.baseColorTexture.colorSpace, 'srgb');
  assert.equal(patterned.metallicRoughnessTexture.colorSpace, 'linear');
  const matrixNode = result.scene.find('Rear support matrix');
  assert.ok(Math.abs(matrixNode.worldMatrix()[12]) < .01);
  assert.ok(Math.abs(matrixNode.worldMatrix()[13] - .65) < .01);
  assert.ok(Math.abs(matrixNode.worldMatrix()[14] - 3.85) < .01);
  const copies = result.textures.map(t=>t.image);
  result.dispose();
  assert.ok(copies.every(bitmap=>bitmap.closed));
});

test('GLB parser rejects corrupted headers and invalid chunk sizes', async () => {
  const base = new Uint8Array(await readFile(fixture));
  for (const offset of [0,4,8,12,16]) {
    const bytes = base.slice();
    const v = new DataView(bytes.buffer);
    v.setUint32(offset, 0xffffffff, true);
    assert.throws(()=>parseGLB(bytes), /GLB|Invalid|version/);
  }
  assert.throws(()=>parseGLB(new Uint8Array(9)), /Invalid GLB size/);
});

test('accessor decoder reads strided normalized UVs without assuming tight packing', () => {
  const raw=new Uint8Array([0,255,9,9, 128,64,8,8, 255,0,7,7]);
  const doc={bufferViews:[{buffer:0,byteOffset:0,byteLength:12,byteStride:4}],
    accessors:[{bufferView:0,componentType:5121,normalized:true,count:3,type:'VEC2'}]};
  const result=decodeAccessor(doc,[raw],0);
  assert.deepEqual(Array.from(result.slice(0,2)),[0,1]);
  assert.ok(Math.abs(result[2]-128/255)<1e-6);
  assert.ok(Math.abs(result[3]-64/255)<1e-6);
});

test('accessor decoder accepts uint32 indices and rejects malformed ranges', () => {
  const values = new Uint32Array([0,65536,70000]);
  const doc={bufferViews:[{buffer:0,byteLength:values.byteLength}],
    accessors:[{bufferView:0,componentType:5125,count:3,type:'SCALAR'}]};
  assert.deepEqual(Array.from(decodeAccessor(doc,[new Uint8Array(values.buffer)],0,{asIndices:true})),[0,65536,70000]);
  doc.bufferViews[0].byteLength=8;
  assert.throws(()=>decodeAccessor(doc,[new Uint8Array(values.buffer)],0,{asIndices:true}), /exceeds/);
  doc.bufferViews[0].byteLength=12;
  doc.accessors[0].sparse={count:1};
  assert.throws(()=>decodeAccessor(doc,[new Uint8Array(values.buffer)],0),/Sparse/);
});

test('loader generates missing normals and supports unindexed triangles', async () => {
  const doc=makeAccessorDocument();
  delete doc.meshes[0].primitives[0].indices;
  const result=await loader().parse(doc);
  const geometry=result.scene.query('mesh')[0].get('mesh').geometry;
  assert.deepEqual([...geometry.getAttribute('NORMAL').array],[0,0,1,0,0,1,0,0,1]);
  assert.deepEqual([...geometry.indices],[0,1,2]);
});

test('loader supports multiple primitives and preserves shared geometry across node instances', async () => {
  const doc=makeAccessorDocument();
  const primitive=doc.meshes[0].primitives[0];
  doc.meshes[0].primitives=[primitive,{...primitive}];
  doc.nodes=[{mesh:0,translation:[0,0,1]},{mesh:0,translation:[0,0,2]}];
  doc.scenes[0].nodes=[0,1];
  const result=await loader().parse(doc);
  assert.equal(result.scene.query('mesh').length,4);
  const children=[...result.roots[0].children];
  assert.equal(children.length,2);
  const others=[...result.roots[1].children];
  assert.equal(others[0].get('mesh').geometry,children[0].get('mesh').geometry);
});

test('explicit glTF node matrices compose correctly with ancestor transforms', async () => {
  const doc=makeAccessorDocument();
  doc.nodes=[{translation:[1,2,3],children:[1]},{mesh:0,matrix:[1,0,0,0,0,1,0,0,0,0,1,0,2,3,4,1]}];
  const result=await loader().parse(doc);
  assert.deepEqual([...result.scene.find('glTF Node 1').worldMatrix()].slice(12,15),[3,5,7]);
  assert.throws(()=>result.scene.find('glTF Node 1').transform.setMatrix([0]),/16 finite/);
});

test('loader fetches external .gltf and .bin resolved against model URL', async () => {
  const doc=makeAccessorDocument();
  const bin=Buffer.from(doc.buffers[0].uri.split(',')[1],'base64');
  doc.buffers[0].uri='positions.bin';
  const responses={
    'https://example.test/assets/model.gltf':new TextEncoder().encode(JSON.stringify(doc)),
    'https://example.test/assets/positions.bin':bin
  };
  const fetcher=async url=>{
    assert.ok(responses[url],`Unexpected URL ${url}`);
    return {ok:true, headers:{get:()=>null}, arrayBuffer:async()=>Uint8Array.from(responses[url]).buffer};
  };
  const result=await loader({fetcher}).load('https://example.test/assets/model.gltf');
  assert.equal(result.scene.query('mesh').length,1);
});

test('loader explicitly rejects extensions, alpha blend, invalid nodes and sparse data', async () => {
  let doc=makeAccessorDocument();doc.extensionsRequired=['KHR_draco_mesh_compression'];
  await assert.rejects(loader().parse(doc),/Unsupported required/);
  doc=makeAccessorDocument();doc.materials=[{alphaMode:'BLEND'}];doc.meshes[0].primitives[0].material=0;
  await assert.rejects(loader().parse(doc),/unsupported alpha/);
  doc=makeAccessorDocument();doc.nodes=[{children:[1]},{children:[0]}];
  await assert.rejects(loader().parse(doc),/Cycle/);
  doc=makeAccessorDocument();doc.accessors[0].sparse={count:1};
  await assert.rejects(loader().parse(doc),/Sparse accessors/);
});

test('loader rejects unsupported texture coordinate sets and material samplers', async () => {
  const doc=makeAccessorDocument({uv:[0,0,1,0,0,1]});
  doc.images=[{uri:'data:image/png;base64,'+Buffer.from([137,80,78,71]).toString('base64')}];
  doc.textures=[{source:0}];
  doc.materials=[{pbrMetallicRoughness:{baseColorTexture:{index:0,texCoord:1}}}];
  doc.meshes[0].primitives[0].material=0;
  await assert.rejects(loader().parse(doc),/TEXCOORD_0/);
});

test('loader closes decoded images when a later mesh primitive fails to load', async () => {
  const doc=makeAccessorDocument({uv:[0,0,1,0,0,1]});
  doc.images=[{uri:'data:image/png;base64,'+Buffer.from([137,80,78,71,13,10,26,10]).toString('base64')}];
  doc.textures=[{source:0}];
  doc.materials=[
    {pbrMetallicRoughness:{baseColorTexture:{index:0}}},
    {alphaMode:'BLEND'}
  ];
  const primitive=doc.meshes[0].primitives[0];
  doc.meshes[0].primitives=[{...primitive,material:0},{...primitive,material:1}];
  const bitmap=createBitmap();
  await assert.rejects(loader({imageDecoder:async()=>bitmap}).parse(doc),/unsupported alpha/);
  assert.equal(bitmap.closed,true);
});

test('loader rejects two glTF materials with different samplers in one PBR material', async () => {
  const doc=makeAccessorDocument({uv:[0,0,1,0,0,1]});
  const img={uri:'data:image/png;base64,'+Buffer.from([137,80,78,71,13,10,26,10]).toString('base64')};
  doc.images=[img,img];
  doc.samplers=[{wrapS:33071},{wrapS:10497}];
  doc.textures=[{source:0,sampler:0},{source:1,sampler:1}];
  doc.materials=[{pbrMetallicRoughness:{baseColorTexture:{index:0},metallicRoughnessTexture:{index:1}}}];
  doc.meshes[0].primitives[0].material=0;
  await assert.rejects(loader().parse(doc),/Different samplers/);
});

test('loader supports percent-encoded raw binary buffer data URIs', async () => {
  const doc=makeAccessorDocument();
  const original=Buffer.from(doc.buffers[1].uri.split(',')[1],'base64');
  doc.buffers[1].uri='data:application/octet-stream,'+[...original].map(x=>'%'+x.toString(16).padStart(2,'0')).join('');
  const result=await loader().parse(doc);
  assert.equal(result.scene.query('mesh').length,1);
});

test('static server serves original GLB demo with correct MIME', async () => {
  const {createStaticServer}=await import('../scripts/static-server.mjs');
  const {fileURLToPath}=await import('node:url');
  const {resolve}=await import('node:path');
  const root=resolve(fileURLToPath(new URL('../', import.meta.url)));
  const server=createStaticServer({root});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  try {
    const url=`http://127.0.0.1:${server.address().port}/assets/models/starfire-relay.glb`;
    const response=await fetch(url);
    assert.equal(response.status,200);
    assert.match(response.headers.get('content-type'),/model\/gltf-binary/);
    const loaded=await loader().load(url);
    assert.equal(loaded.scene.query('mesh').length,7);
    loaded.dispose();
  } finally {
    await new Promise((resolve,reject)=>server.close(error=>error?reject(error):resolve()));
  }
});
