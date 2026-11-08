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
