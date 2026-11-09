// PR 04: shared lighting and material model across WGSL and GLSL ES 3.
// Both shaders preserve the original non-PBR material path for API compatibility.
// The new path implements a direct-light Cook-Torrance GGX metallic/roughness BRDF.
// Constant ambient fill is a deliberate preview approximation, NOT full IBL.

export const vertexGLSL = `#version 300 es
layout(location = 0) in vec3 aPosition;
layout(location = 1) in vec3 aNormal;
layout(location = 2) in vec2 aUV;
uniform mat4 uViewProjection;
uniform mat4 uModel;
out vec3 vWorldPosition;
out vec3 vWorldNormal;
out vec2 vUV;
void main() {
  vec4 world = uModel * vec4(aPosition, 1.0);
  vWorldPosition = world.xyz;
  vUV = aUV;
  vWorldNormal = mat3(transpose(inverse(uModel))) * aNormal;
  gl_Position = uViewProjection * world;
}`;

export const fragmentGLSL = `#version 300 es
precision highp float;
precision highp sampler2DShadow;
#define PI 3.14159265358979323846
in vec3 vWorldPosition;
in vec3 vWorldNormal;
in vec2 vUV;
uniform sampler2D uBaseColorTexture;
uniform sampler2D uMetallicRoughnessTexture;
uniform vec4 uColor;
uniform vec4 uPBRParams; // x metallic, y roughness, z PBR enabled
uniform vec3 uEmissive;
uniform vec3 uEye;
uniform vec3 uLightDirection;
uniform vec4 uKeyLight; // rgb linear color, a intensity
uniform vec4 uAmbientLight; // rgb linear color, a intensity
uniform float uExposure;
uniform mat4 uShadowViewProjection;
uniform vec4 uShadowParams; // enabled, depth bias, strength, inverse resolution
uniform sampler2DShadow uShadowMap;
uniform vec4 uSkyColor;
uniform vec4 uHorizonColor;
uniform vec4 uGroundColor;
uniform float uEnvironmentIntensity;
out vec4 fragColor;

float ggxDistribution(float NoH, float roughness) {
  float a = roughness * roughness;
  float a2 = a * a;
  float d = NoH * NoH * (a2 - 1.0) + 1.0;
  return a2 / max(PI * d * d, 0.00001);
}
float geometrySchlickGGX(float NoV, float roughness) {
  float r = roughness + 1.0;
  float k = (r * r) / 8.0;
  return NoV / max(NoV * (1.0 - k) + k, 0.00001);
}
vec3 fresnelSchlick(float VoH, vec3 F0) {
  return F0 + (vec3(1.0) - F0) * pow(1.0 - VoH, 5.0);
}
vec3 toneMapACES(vec3 x) {
  return clamp((x * (2.51 * x + vec3(0.03))) /
    (x * (2.43 * x + vec3(0.59)) + vec3(0.14)), 0.0, 1.0);
}
vec3 linearToSRGB(vec3 c) {
  c = max(c, vec3(0.0));
  vec3 high = 1.055 * pow(c, vec3(1.0/2.4)) - vec3(0.055);
  vec3 low = 12.92 * c;
  return mix(high, low, vec3(lessThanEqual(c, vec3(0.0031308))));
}
vec3 environmentRadiance(float height) {
  float t = clamp(height, 0.0, 1.0);
  return height >= 0.0 ? mix(uHorizonColor.rgb, uSkyColor.rgb, t)
                       : mix(uHorizonColor.rgb, uGroundColor.rgb, -clamp(height, -1.0, 0.0));
}
float shadowVisibility(vec3 worldPosition) {
  if (uShadowParams.x < 0.5) return 1.0;
  vec4 clip = uShadowViewProjection * vec4(worldPosition, 1.0);
  vec3 ndc = clip.xyz / max(clip.w, 0.000001);
  vec2 uv = ndc.xy * 0.5 + 0.5; // WebGL FBO origin is bottom-left
  float depth = ndc.z * 0.5 + 0.5; // WebGL clip depth is -1..1
  if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0 || depth <= 0.0 || depth >= 1.0) return 1.0;
  float visibility = 0.0;
  for (int y = -1; y <= 1; ++y) {
    for (int x = -1; x <= 1; ++x) {
      visibility += texture(uShadowMap, vec3(uv + vec2(float(x), float(y)) * uShadowParams.w,
        depth - uShadowParams.y));
    }
  }
  return 1.0 - uShadowParams.z * (1.0 - visibility / 9.0);
}
void main() {
  vec3 n = normalize(vWorldNormal);
  vec3 l = normalize(uLightDirection);
  vec3 v = normalize(uEye - vWorldPosition);
  vec4 base = uColor * texture(uBaseColorTexture, vUV);
  float shadow = shadowVisibility(vWorldPosition);
  if (uPBRParams.z < 0.5) {
    // Preserve the PR 03 look for legacy Material and plain {color} objects.
    float diffuse = max(dot(n, l), 0.0);
    float spec = pow(max(dot(n, normalize(l + v)), 0.0), 36.0) * 0.20;
    vec3 lit = base.rgb * (0.29 + 0.71 * diffuse * shadow) + vec3(spec * shadow);
    fragColor = vec4(lit, base.a);
    return;
  }
  // glTF 2.0 metallic-roughness packing: green=roughness, blue=metallic.
  vec4 mr = texture(uMetallicRoughnessTexture, vUV);
  float metallic = clamp(uPBRParams.x * mr.b, 0.0, 1.0);
  float roughness = clamp(uPBRParams.y * mr.g, 0.045, 1.0);
  float NoL = max(dot(n, l), 0.0);
  float NoV = max(dot(n, v), 0.0001);
  vec3 h = normalize(l + v);
  float NoH = max(dot(n, h), 0.0);
  float VoH = max(dot(v, h), 0.0);
  vec3 F0 = mix(vec3(0.04), base.rgb, metallic);
  vec3 F = fresnelSchlick(VoH, F0);
  float D = ggxDistribution(NoH, roughness);
  float G = geometrySchlickGGX(NoV, roughness) * geometrySchlickGGX(NoL, roughness);
  vec3 specular = (D * G * F) / max(4.0 * NoV * NoL, 0.0001);
  vec3 diffuse = (vec3(1.0) - F) * (1.0 - metallic) * base.rgb / PI;
  vec3 direct = (diffuse + specular) * uKeyLight.rgb * uKeyLight.a * NoL * shadow;
  // Hemispheric constant fill is an approximation until the IBL milestone.
  vec3 ambient = uAmbientLight.rgb * uAmbientLight.a *
    (base.rgb * (1.0 - metallic) + F0 * 0.15 * (1.0 - 0.5 * roughness));
  vec3 reflection = reflect(-v, n);
  vec3 envDiffuse = environmentRadiance(n.y) * base.rgb * (1.0 - metallic);
  vec3 envSpecular = environmentRadiance(reflection.y) * fresnelSchlick(NoV, F0) *
    mix(1.0, 0.14, roughness);
  vec3 environment = (envDiffuse + envSpecular) * uEnvironmentIntensity;
  vec3 linearColor = (direct + ambient + environment + uEmissive) * uExposure;
  fragColor = vec4(linearToSRGB(toneMapACES(max(linearColor, vec3(0.0)))), base.a);
}`;

export const shaderWGSL = `
const PI: f32 = 3.141592653589793;
struct Camera {
  viewProjection: mat4x4<f32>,
  lightDirection: vec4<f32>,
  eye: vec4<f32>,
  keyLight: vec4<f32>,
  ambientLight: vec4<f32>,
  settings: vec4<f32>, // exposure in x
  shadowViewProjection: mat4x4<f32>,
  shadowParams: vec4<f32>, // enabled, depth bias, strength, inverse resolution
  skyColor: vec4<f32>,
  horizonColor: vec4<f32>,
  groundColor: vec4<f32>,
  environmentParams: vec4<f32>, // intensity in x
};
struct ObjectUniforms {
  model: mat4x4<f32>,
  color: vec4<f32>,
  pbrParams: vec4<f32>,
  emissive: vec4<f32>,
};
@group(0) @binding(0) var<uniform> camera: Camera;
@group(0) @binding(1) var<uniform> object: ObjectUniforms;
@group(1) @binding(0) var baseColorTexture: texture_2d<f32>;
@group(1) @binding(1) var baseColorSampler: sampler;
@group(1) @binding(2) var metallicRoughnessTexture: texture_2d<f32>;
@group(1) @binding(3) var metallicRoughnessSampler: sampler;
@group(2) @binding(0) var shadowMap: texture_depth_2d;
@group(2) @binding(1) var shadowSampler: sampler_comparison;
struct VertexInput {
  @location(0) position: vec3<f32>,
  @location(1) normal: vec3<f32>,
  @location(2) uv: vec2<f32>,
};
struct VertexOutput {
  @builtin(position) clipPosition: vec4<f32>,
  @location(0) worldPosition: vec3<f32>,
  @location(1) worldNormal: vec3<f32>,
  @location(2) uv: vec2<f32>,
};
@vertex
fn vertexMain(input: VertexInput) -> VertexOutput {
  var out: VertexOutput;
  let world = object.model * vec4<f32>(input.position, 1.0);
  out.clipPosition = camera.viewProjection * world;
  out.worldPosition = world.xyz;
  out.uv = input.uv;
  // Normal cofactors avoid unsupported WGSL inverse() (for non-singular scales).
  let c0 = object.model[0].xyz;
  let c1 = object.model[1].xyz;
  let c2 = object.model[2].xyz;
  let cofactors = mat3x3<f32>(cross(c1, c2), cross(c2, c0), cross(c0, c1));
  let orientation = select(-1.0, 1.0, dot(c0, cross(c1, c2)) >= 0.0);
  out.worldNormal = (cofactors * input.normal) * orientation;
  return out;
}
// Depth-only entrypoint shares the scene/object buffer bindings with the PBR pass.
@vertex
fn shadowVertex(input: VertexInput) -> @builtin(position) vec4<f32> {
  return camera.shadowViewProjection * object.model * vec4<f32>(input.position, 1.0);
}
fn environmentRadiance(height: f32) -> vec3<f32> {
  if (height >= 0.0) {
    return mix(camera.horizonColor.rgb, camera.skyColor.rgb, clamp(height, 0.0, 1.0));
  }
  return mix(camera.horizonColor.rgb, camera.groundColor.rgb, clamp(-height, 0.0, 1.0));
}
fn shadowVisibility(worldPosition: vec3<f32>) -> f32 {
  if (camera.shadowParams.x < 0.5) { return 1.0; }
  let clip = camera.shadowViewProjection * vec4<f32>(worldPosition, 1.0);
  let ndc = clip.xyz / max(clip.w, 0.000001);
  let uv = vec2<f32>(ndc.x * 0.5 + 0.5, 0.5 - ndc.y * 0.5); // WebGPU top-left texture origin
  if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0 || ndc.z <= 0.0 || ndc.z >= 1.0) {
    return 1.0;
  }
  var visibility = 0.0;
  for (var y: i32 = -1; y <= 1; y = y + 1) {
    for (var x: i32 = -1; x <= 1; x = x + 1) {
      let offset = vec2<f32>(f32(x), f32(y)) * camera.shadowParams.w;
      visibility += textureSampleCompareLevel(shadowMap, shadowSampler, uv + offset,
        ndc.z - camera.shadowParams.y);
    }
  }
  return 1.0 - camera.shadowParams.z * (1.0 - visibility / 9.0);
}
fn ggxDistribution(NoH: f32, roughness: f32) -> f32 {
  let a = roughness * roughness;
  let a2 = a * a;
  let d = NoH * NoH * (a2 - 1.0) + 1.0;
  return a2 / max(PI * d * d, 0.00001);
}
fn geometrySchlickGGX(NoV: f32, roughness: f32) -> f32 {
  let r = roughness + 1.0;
  let k = (r * r) / 8.0;
  return NoV / max(NoV * (1.0 - k) + k, 0.00001);
}
fn fresnelSchlick(VoH: f32, F0: vec3<f32>) -> vec3<f32> {
  return F0 + (vec3<f32>(1.0) - F0) * pow(1.0 - VoH, 5.0);
}
fn toneMapACES(x: vec3<f32>) -> vec3<f32> {
  return clamp((x * (2.51 * x + vec3<f32>(0.03))) /
    (x * (2.43 * x + vec3<f32>(0.59)) + vec3<f32>(0.14)), vec3<f32>(0.0), vec3<f32>(1.0));
}
fn linearToSRGB(input: vec3<f32>) -> vec3<f32> {
  let c = max(input, vec3<f32>(0.0));
  let high = 1.055 * pow(c, vec3<f32>(1.0 / 2.4)) - vec3<f32>(0.055);
  let low = 12.92 * c;
  return select(high, low, c <= vec3<f32>(0.0031308));
}
@fragment
fn fragmentMain(input: VertexOutput) -> @location(0) vec4<f32> {
  let n = normalize(input.worldNormal);
  let l = normalize(camera.lightDirection.xyz);
  let v = normalize(camera.eye.xyz - input.worldPosition);
  let base = object.color * textureSample(baseColorTexture, baseColorSampler, input.uv);
  let shadow = shadowVisibility(input.worldPosition);
  if (object.pbrParams.z < 0.5) {
    let diffuse = max(dot(n, l), 0.0);
    let spec = pow(max(dot(n, normalize(l + v)), 0.0), 36.0) * 0.20;
    let lit = base.rgb * (0.29 + 0.71 * diffuse * shadow) + vec3<f32>(spec * shadow);
    return vec4<f32>(lit, base.a);
  }
  let mr = textureSample(metallicRoughnessTexture, metallicRoughnessSampler, input.uv);
  let metallic = clamp(object.pbrParams.x * mr.b, 0.0, 1.0);
  let roughness = clamp(object.pbrParams.y * mr.g, 0.045, 1.0);
  let NoL = max(dot(n, l), 0.0);
  let NoV = max(dot(n, v), 0.0001);
  let h = normalize(l + v);
  let NoH = max(dot(n, h), 0.0);
  let VoH = max(dot(v, h), 0.0);
  let F0 = mix(vec3<f32>(0.04), base.rgb, vec3<f32>(metallic));
  let F = fresnelSchlick(VoH, F0);
  let D = ggxDistribution(NoH, roughness);
  let G = geometrySchlickGGX(NoV, roughness) * geometrySchlickGGX(NoL, roughness);
  let specular = (D * G * F) / max(4.0 * NoV * NoL, 0.0001);
  let diffuse = (vec3<f32>(1.0) - F) * (1.0 - metallic) * base.rgb / PI;
  let direct = (diffuse + specular) * camera.keyLight.rgb * camera.keyLight.a * NoL * shadow;
  let ambient = camera.ambientLight.rgb * camera.ambientLight.a *
    (base.rgb * (1.0 - metallic) + F0 * 0.15 * (1.0 - 0.5 * roughness));
  let reflection = reflect(-v, n);
  let envDiffuse = environmentRadiance(n.y) * base.rgb * (1.0 - metallic);
  let envSpecular = environmentRadiance(reflection.y) * fresnelSchlick(NoV, F0) *
    mix(1.0, 0.14, roughness);
  let environment = (envDiffuse + envSpecular) * camera.environmentParams.x;
  let linearColor = (direct + ambient + environment + object.emissive.rgb) * camera.settings.x;
  return vec4<f32>(linearToSRGB(toneMapACES(max(linearColor, vec3<f32>(0.0)))), base.a);
}`;


/** Depth-only program for the WebGL 2 directional shadow pass. */
export const shadowVertexGLSL = `#version 300 es
layout(location = 0) in vec3 aPosition;
uniform mat4 uShadowViewProjection;
uniform mat4 uModel;
void main() {
  gl_Position = uShadowViewProjection * uModel * vec4(aPosition, 1.0);
}`;
export const shadowFragmentGLSL = `#version 300 es
precision highp float;
void main() {}
`;
