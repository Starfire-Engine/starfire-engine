import { Mat4 } from '../math/Mat4.js';

function number(value, name, min, max = Infinity) {
  if (!Number.isFinite(value) || value < min || value > max) {
    throw new RangeError(`${name} must be finite and between ${min} and ${max}`);
  }
  return value;
}
function vec3(value, name) {
  if (!Array.isArray(value) || value.length !== 3 || !value.every(Number.isFinite)) {
    throw new TypeError(`${name} must be a finite vec3`);
  }
  return [...value];
}

/** A fixed-size orthographic directional light shadow volume, in world units. */
export class ShadowSettings {
  constructor({ enabled = false, mapSize = 1024, radius = 14, distance = 40,
    near = 0.5, far = 100, bias = 0.002, strength = 0.88, center = [0, 0, 0] } = {}) {
    this.enabled = enabled;
    this.mapSize = mapSize;
    this.radius = radius;
    this.distance = distance;
    this.near = near;
    this.far = far;
    this.bias = bias;
    this.strength = strength;
    this.center = [...center];
    resolveShadowSettings(this);
  }
}

export function resolveShadowSettings(settings) {
  if (!(settings instanceof ShadowSettings)) throw new TypeError('shadows must be ShadowSettings');
  if (typeof settings.enabled !== 'boolean') throw new TypeError('shadows.enabled must be boolean');
  if (![256, 512, 1024, 2048].includes(settings.mapSize)) {
    throw new RangeError('shadows.mapSize must be 256, 512, 1024 or 2048');
  }
  const radius = number(settings.radius, 'shadows.radius', 0.1);
  const distance = number(settings.distance, 'shadows.distance', 0.1);
  const near = number(settings.near, 'shadows.near', 0.001);
  const far = number(settings.far, 'shadows.far', near + 0.001);
  const bias = number(settings.bias, 'shadows.bias', 0, 0.05);
  const strength = number(settings.strength, 'shadows.strength', 0, 1);
  const center = vec3(settings.center, 'shadows.center');
  return { enabled: settings.enabled, mapSize: settings.mapSize, radius, distance, near, far, bias, strength, center };
}

/** World-to-light clip matrix: WebGPU 0..1 depth or WebGL -1..1 depth. */
export function shadowViewProjection(lightDirection, settings, depthMode = 'webgpu') {
  const s = settings instanceof ShadowSettings ? resolveShadowSettings(settings) : settings;
  if (!Array.isArray(lightDirection) || lightDirection.length !== 3 ||
      !lightDirection.every(Number.isFinite) || Math.hypot(...lightDirection) < 1e-8) {
    throw new RangeError('Shadow light direction must be nonzero and finite');
  }
  const length = Math.hypot(...lightDirection);
  const d = lightDirection.map(n => n / length);
  const eye = s.center.map((n, i) => n + d[i] * s.distance);
  // Keep the view basis stable when the light is nearly vertical.
  const up = Math.abs(d[1]) > 0.985 ? [0, 0, 1] : [0, 1, 0];
  const view = Mat4.lookAt(eye, s.center, up);
  const projection = Mat4.orthographic(-s.radius, s.radius, -s.radius, s.radius, s.near, s.far, depthMode);
  return Mat4.multiply(projection, view);
}
