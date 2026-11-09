import { ShadowSettings, resolveShadowSettings } from './ShadowSettings.js';
import { EnvironmentLighting, resolveEnvironment } from './EnvironmentLighting.js';

/**
 * A single directional key light and constant ambient fill. This is a v0.2
 * preview, not an image-based lighting system or a scene light collection.
 * Direction points FROM the surface TOWARD the light (world-space).
 */
function rgb(value, name) {
  if (!Array.isArray(value) || value.length !== 3 ||
      !value.every((n) => Number.isFinite(n) && n >= 0)) {
    throw new TypeError(`${name} must be three finite non-negative numbers`);
  }
  return [...value];
}
function finiteNonNegative(value, name) {
  if (!Number.isFinite(value) || value < 0) throw new RangeError(`${name} must be finite and non-negative`);
  return value;
}
export class Lighting {
  constructor({ direction = [0.65, 0.95, 0.42], color = [1, 1, 1], intensity = 3,
    ambientColor = [1, 1, 1], ambientIntensity = 0.18, exposure = 1,
    shadows = new ShadowSettings(), environment = new EnvironmentLighting() } = {}) {
    if (!Array.isArray(direction) || direction.length !== 3 || !direction.every(Number.isFinite) ||
        Math.hypot(...direction) < 1e-8) {
      throw new RangeError('Lighting.direction must be a nonzero finite vec3');
    }
    this.direction = [...direction];
    this.color = rgb(color, 'Lighting.color');
    this.intensity = finiteNonNegative(intensity, 'Lighting.intensity');
    this.ambientColor = rgb(ambientColor, 'Lighting.ambientColor');
    this.ambientIntensity = finiteNonNegative(ambientIntensity, 'Lighting.ambientIntensity');
    if (!(Number.isFinite(exposure) && exposure > 0)) throw new RangeError('Lighting.exposure must be positive and finite');
    this.exposure = exposure;
    if (!(shadows instanceof ShadowSettings)) throw new TypeError('Lighting.shadows requires ShadowSettings');
    if (!(environment instanceof EnvironmentLighting)) throw new TypeError('Lighting.environment requires EnvironmentLighting');
    this.shadows = shadows;
    this.environment = environment;
  }
}

export function resolveLighting(scene) {
  const lighting = scene?.lighting ?? Lighting.DEFAULT;
  if (!(lighting instanceof Lighting)) throw new TypeError('scene.lighting must be a Lighting instance');
  // Revalidate because callers may animate the mutable lighting parameters.
  const d = lighting.direction;
  if (!Array.isArray(d) || d.length !== 3 || !d.every(Number.isFinite) || Math.hypot(...d) < 1e-8)
    throw new RangeError('Lighting.direction must be a nonzero finite vec3');
  const color = rgb(lighting.color, 'Lighting.color');
  const ambientColor = rgb(lighting.ambientColor, 'Lighting.ambientColor');
  const intensity = finiteNonNegative(lighting.intensity, 'Lighting.intensity');
  const ambientIntensity = finiteNonNegative(lighting.ambientIntensity, 'Lighting.ambientIntensity');
  const exposure = lighting.exposure;
  if (!(Number.isFinite(exposure) && exposure > 0)) throw new RangeError('Lighting.exposure must be positive and finite');
  const length = Math.hypot(...d);
  return { direction: d.map((n) => n / length), color, intensity, ambientColor, ambientIntensity,
    exposure, shadows: resolveShadowSettings(lighting.shadows), environment: resolveEnvironment(lighting.environment) };
}
Lighting.DEFAULT = Object.freeze(new Lighting());
