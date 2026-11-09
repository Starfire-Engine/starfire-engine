function color(value, name) {
  if (!Array.isArray(value) || value.length !== 3 ||
      !value.every(n => Number.isFinite(n) && n >= 0)) {
    throw new TypeError(`${name} must be a non-negative finite RGB vec3`);
  }
  return [...value];
}
/** Procedural sky/horizon/ground ambient reflection approximation; not HDR cubemap IBL. */
export class EnvironmentLighting {
  constructor({ skyColor = [0.23, 0.39, 0.68], horizonColor = [0.58, 0.64, 0.77],
    groundColor = [0.055, 0.075, 0.11], intensity = 0 } = {}) {
    this.skyColor = color(skyColor, 'environment.skyColor');
    this.horizonColor = color(horizonColor, 'environment.horizonColor');
    this.groundColor = color(groundColor, 'environment.groundColor');
    this.intensity = intensity;
    resolveEnvironment(this);
  }
}
export function resolveEnvironment(value) {
  if (!(value instanceof EnvironmentLighting)) throw new TypeError('environment must be EnvironmentLighting');
  const skyColor = color(value.skyColor, 'environment.skyColor');
  const horizonColor = color(value.horizonColor, 'environment.horizonColor');
  const groundColor = color(value.groundColor, 'environment.groundColor');
  if (!Number.isFinite(value.intensity) || value.intensity < 0 || value.intensity > 20) {
    throw new RangeError('environment.intensity must be between 0 and 20');
  }
  return { skyColor, horizonColor, groundColor, intensity: value.intensity };
}
