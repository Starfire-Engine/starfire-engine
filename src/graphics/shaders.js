export const vertexGLSL = `#version 300 es
layout(location = 0) in vec3 aPosition;
layout(location = 1) in vec3 aNormal;
uniform mat4 uViewProjection;
uniform mat4 uModel;
out vec3 vWorldPosition;
out vec3 vWorldNormal;
void main() {
  vec4 world = uModel * vec4(aPosition, 1.0);
  vWorldPosition = world.xyz;
  // Inverse-transpose corrects normal direction for nonuniform object scaling.
  vWorldNormal = mat3(transpose(inverse(uModel))) * aNormal;
  gl_Position = uViewProjection * world;
}`;

export const fragmentGLSL = `#version 300 es
precision highp float;
in vec3 vWorldPosition;
in vec3 vWorldNormal;
uniform vec4 uColor;
uniform vec3 uEye;
out vec4 fragColor;
void main() {
  vec3 n = normalize(vWorldNormal);
  vec3 l = normalize(vec3(0.65, 0.95, 0.42));
  vec3 v = normalize(uEye - vWorldPosition);
  float diffuse = max(dot(n, l), 0.0);
  float spec = pow(max(dot(n, normalize(l + v)), 0.0), 36.0) * 0.20;
  vec3 lit = uColor.rgb * (0.29 + 0.71 * diffuse) + vec3(spec);
  fragColor = vec4(lit, uColor.a);
}`;

export const shaderWGSL = `
struct Camera {
  viewProjection: mat4x4<f32>,
  light: vec4<f32>,
  eye: vec4<f32>,
};
struct ObjectUniforms {
  model: mat4x4<f32>,
  color: vec4<f32>,
};
@group(0) @binding(0) var<uniform> camera: Camera;
@group(0) @binding(1) var<uniform> object: ObjectUniforms;
struct VertexInput {
  @location(0) position: vec3<f32>,
  @location(1) normal: vec3<f32>,
};
struct VertexOutput {
  @builtin(position) clipPosition: vec4<f32>,
  @location(0) worldPosition: vec3<f32>,
  @location(1) worldNormal: vec3<f32>,
};
@vertex
fn vertexMain(input: VertexInput) -> VertexOutput {
  var out: VertexOutput;
  let world = object.model * vec4<f32>(input.position, 1.0);
  out.clipPosition = camera.viewProjection * world;
  out.worldPosition = world.xyz;
  // Inverse-transpose produces correct normals for nonuniform scaling.
  out.worldNormal = transpose(inverse(mat3x3<f32>(
    object.model[0].xyz, object.model[1].xyz, object.model[2].xyz
  ))) * input.normal;
  return out;
}
@fragment
fn fragmentMain(input: VertexOutput) -> @location(0) vec4<f32> {
  let n = normalize(input.worldNormal);
  let l = normalize(camera.light.xyz);
  let view = normalize(camera.eye.xyz - input.worldPosition);
  let diffuse = max(dot(n, l), 0.0);
  let halfway = normalize(l + view);
  let spec = pow(max(dot(n, halfway), 0.0), 36.0) * 0.20;
  let lit = object.color.rgb * (0.29 + 0.71 * diffuse) + vec3<f32>(spec);
  return vec4<f32>(lit, object.color.a);
}`;
