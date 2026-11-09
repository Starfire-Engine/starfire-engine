import { Geometry } from './Geometry.js';

/** Interleaved position (xyz) and normal (xyz), with triangle indices. */
export function createBox(width = 1, height = 1, depth = 1) {
  if (![width, height, depth].every((n) => Number.isFinite(n) && n > 0)) {
    throw new RangeError('Box dimensions must be positive finite numbers');
  }
  const x = width / 2; const y = height / 2; const z = depth / 2;
  const faces = [
    { n: [0, 0, 1], p: [[-x,-y,z],[x,-y,z],[x,y,z],[-x,y,z]] },
    { n: [0, 0,-1], p: [[x,-y,-z],[-x,-y,-z],[-x,y,-z],[x,y,-z]] },
    { n: [1, 0, 0], p: [[x,-y,z],[x,-y,-z],[x,y,-z],[x,y,z]] },
    { n: [-1,0, 0], p: [[-x,-y,-z],[-x,-y,z],[-x,y,z],[-x,y,-z]] },
    { n: [0, 1, 0], p: [[-x,y,z],[x,y,z],[x,y,-z],[-x,y,-z]] },
    { n: [0,-1, 0], p: [[-x,-y,-z],[x,-y,-z],[x,-y,z],[-x,-y,z]] }
  ];
  const vertices = [];
  const indices = [];
  faces.forEach((face, f) => {
    face.p.forEach((position) => vertices.push(...position, ...face.n));
    const i = f * 4;
    indices.push(i, i + 1, i + 2, i, i + 2, i + 3);
  });
  return { vertices: new Float32Array(vertices), indices: new Uint16Array(indices) };
}

/** Y-up plane with normals and UVs. Uses the new attribute geometry API. */
export function createPlane(width = 1, depth = 1) {
  if (![width, depth].every((n) => Number.isFinite(n) && n > 0)) throw new RangeError('Invalid plane dimensions');
  return new Geometry({
    attributes: {
      POSITION: new Float32Array([-width/2, 0, -depth/2, width/2, 0, -depth/2, -width/2, 0, depth/2, width/2, 0, depth/2]),
      NORMAL: new Float32Array([0,1,0, 0,1,0, 0,1,0, 0,1,0]),
      TEXCOORD_0: new Float32Array([0,0, 1,0, 0,1, 1,1])
    },
    indices: new Uint16Array([0,2,1, 1,2,3])
  });
}

/** UV sphere, supporting larger meshes via automatic 32-bit indices. */
export function createSphere(radius = 1, segments = 24, rings = 16) {
  if (!(Number.isFinite(radius) && radius > 0) || !Number.isInteger(segments) || segments < 3 ||
      !Number.isInteger(rings) || rings < 2 || segments > 1024 || rings > 1024) {
    throw new RangeError('Invalid sphere dimensions or tessellation');
  }
  const positions = [], normals = [], uvs = [], indexValues = [];
  for (let y = 0; y <= rings; y++) {
    const v = y / rings, theta = v * Math.PI;
    for (let x = 0; x <= segments; x++) {
      const u = x / segments, phi = u * Math.PI * 2;
      const normal = [Math.sin(theta)*Math.cos(phi), Math.cos(theta), Math.sin(theta)*Math.sin(phi)];
      positions.push(...normal.map(n => n * radius));
      normals.push(...normal);
      uvs.push(u, v);
    }
  }
  for (let y = 0; y < rings; y++) for (let x = 0; x < segments; x++) {
    const a = y * (segments + 1) + x, b = a + segments + 1;
    indexValues.push(a, a+1, b, a+1, b+1, b);
  }
  const Type = positions.length / 3 > 65536 ? Uint32Array : Uint16Array;
  return new Geometry({
    attributes: { POSITION: new Float32Array(positions), NORMAL: new Float32Array(normals), TEXCOORD_0: new Float32Array(uvs) },
    indices: new Type(indexValues)
  });
}
