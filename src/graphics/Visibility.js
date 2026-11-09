import { Geometry } from '../geometry/Geometry.js';
import { InstancedMesh } from './InstancedMesh.js';

// A versioned cache of local-space bounding spheres. Dirty Geometry instances
// recompute bounds after markDirty(); old interleaved geometry is uncached.
const localBounds = new WeakMap();

/** Conservative bounds for geometry with a POSITION attribute. */
export function geometryBounds(geometry) {
  if (!(geometry instanceof Geometry) && !(geometry?.vertices instanceof Float32Array)) {
    throw new TypeError('Expected Geometry or legacy vertex data');
  }
  if (geometry instanceof Geometry) {
    const prior = localBounds.get(geometry);
    if (prior?.version === geometry.version) return prior.bounds;
  }
  const position = geometry instanceof Geometry ? geometry.getAttribute('POSITION').array : geometry.vertices;
  const stride = geometry instanceof Geometry ? 3 : 6;
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < position.length; i += stride) {
    for (let c = 0; c < 3; c++) {
      const value = position[i + c];
      if (!Number.isFinite(value)) return { center: [0, 0, 0], radius: Infinity };
      min[c] = Math.min(min[c], value);
      max[c] = Math.max(max[c], value);
    }
  }
  if (!Number.isFinite(min[0])) return { center: [0, 0, 0], radius: Infinity };
  const center = min.map((value, index) => (value + max[index]) * 0.5);
  let radiusSquared = 0;
  for (let i = 0; i < position.length; i += stride) {
    const dx = position[i] - center[0];
    const dy = position[i + 1] - center[1];
    const dz = position[i + 2] - center[2];
    radiusSquared = Math.max(radiusSquared, dx * dx + dy * dy + dz * dz);
  }
  const bounds = { center, radius: Math.sqrt(radiusSquared) };
  if (geometry instanceof Geometry) localBounds.set(geometry, { version: geometry.version, bounds });
  return bounds;
}

/** Conservative world-space sphere, including parent scales and shear. */
export function worldBoundingSphere(geometry, modelMatrix) {
  const { center, radius } = geometryBounds(geometry);
  const m = modelMatrix;
  const world = [
    m[0] * center[0] + m[4] * center[1] + m[8] * center[2] + m[12],
    m[1] * center[0] + m[5] * center[1] + m[9] * center[2] + m[13],
    m[2] * center[0] + m[6] * center[1] + m[10] * center[2] + m[14]
  ];
  // The spectral norm is bounded by sqrt(induced 1-norm * infinity-norm).
  // Unlike a Frobenius bound, this stays tight for an identity transform.
  const colSum = Math.max(
    Math.abs(m[0]) + Math.abs(m[1]) + Math.abs(m[2]),
    Math.abs(m[4]) + Math.abs(m[5]) + Math.abs(m[6]),
    Math.abs(m[8]) + Math.abs(m[9]) + Math.abs(m[10]));
  const rowSum = Math.max(
    Math.abs(m[0]) + Math.abs(m[4]) + Math.abs(m[8]),
    Math.abs(m[1]) + Math.abs(m[5]) + Math.abs(m[9]),
    Math.abs(m[2]) + Math.abs(m[6]) + Math.abs(m[10]));
  const scale = Math.sqrt(colSum * rowSum);
  return { center: world, radius: radius * scale };
}

/** Extract normalized frustum planes from a column-major view-projection matrix. */
export function frustumPlanes(matrix, depthMode = 'webgpu') {
  if (!['webgpu', 'webgl'].includes(depthMode)) throw new TypeError('Unknown depth convention');
  if (!matrix || matrix.length !== 16) throw new TypeError('Expected 4x4 view-projection matrix');
  const row = (n) => [matrix[n], matrix[4 + n], matrix[8 + n], matrix[12 + n]];
  const a = row(0), b = row(1), c = row(2), w = row(3);
  const sum = (p, q) => p.map((n, i) => n + q[i]);
  const difference = (p, q) => p.map((n, i) => n - q[i]);
  return [sum(w, a), difference(w, a), sum(w, b), difference(w, b),
    depthMode === 'webgpu' ? c : sum(w, c), difference(w, c)].map((plane) => {
    const magnitude = Math.hypot(plane[0], plane[1], plane[2]);
    return magnitude > 1e-12 && Number.isFinite(magnitude)
      ? plane.map((n) => n / magnitude)
      : [0, 0, 0, Infinity]; // Degenerate plane: fail open, never lose meshes.
  });
}

export function sphereInFrustum(sphere, planes) {
  if (!Number.isFinite(sphere.radius)) return true;
  return planes.every(([x, y, z, d]) =>
    x * sphere.center[0] + y * sphere.center[1] + z * sphere.center[2] + d >= -sphere.radius);
}

/** Instanced meshes are retained conservatively until per-instance bounds arrive. */
export function cullRenderables(renderables, matrix, depthMode = 'webgpu', enabled = true) {
  if (!enabled) return { visible: renderables, culled: 0 };
  const planes = frustumPlanes(matrix, depthMode);
  const visible = renderables.filter((item) => item.mesh instanceof InstancedMesh ||
    sphereInFrustum(worldBoundingSphere(item.geometry, item.modelMatrix), planes));
  return { visible, culled: renderables.length - visible.length };
}
