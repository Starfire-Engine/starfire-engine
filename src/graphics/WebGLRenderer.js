import { fragmentGLSL, vertexGLSL } from './shaders.js';

function compile(gl, type, source) {
  const shader = gl.createShader(type);
  if (!shader) throw new Error('Could not create WebGL shader');
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(shader);
    gl.deleteShader(shader);
    throw new Error(`WebGL shader compile failed: ${log}`);
  }
  return shader;
}
function createProgram(gl) {
  const vertex = compile(gl, gl.VERTEX_SHADER, vertexGLSL);
  const fragment = compile(gl, gl.FRAGMENT_SHADER, fragmentGLSL);
  const program = gl.createProgram();
  if (!program) throw new Error('Could not create WebGL program');
  gl.attachShader(program, vertex);
  gl.attachShader(program, fragment);
  gl.linkProgram(program);
  gl.deleteShader(vertex);
  gl.deleteShader(fragment);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const log = gl.getProgramInfoLog(program);
    gl.deleteProgram(program);
    throw new Error(`WebGL program link failed: ${log}`);
  }
  return program;
}

export class WebGLRenderer {
  constructor(canvas, pixelRatioCap = 2) {
    this.canvas = canvas;
    this.pixelRatioCap = pixelRatioCap;
    this.name = 'WebGL 2';
    this.drawCalls = 0;
    this.triangles = 0;
    this.cache = new Map();
  }
  async initialize() {
    const gl = this.canvas.getContext('webgl2', { antialias: true, alpha: false, depth: true });
    if (!gl) throw new Error('WebGL 2 is unavailable');
    this.gl = gl;
    this.program = createProgram(gl);
    this.uniforms = {
      viewProjection: gl.getUniformLocation(this.program, 'uViewProjection'),
      model: gl.getUniformLocation(this.program, 'uModel'),
      color: gl.getUniformLocation(this.program, 'uColor'),
      eye: gl.getUniformLocation(this.program, 'uEye')
    };
    gl.enable(gl.DEPTH_TEST);
    gl.enable(gl.CULL_FACE);
    gl.cullFace(gl.BACK);
    gl.clearColor(0.023, 0.034, 0.063, 1);
    this.resize();
  }
  resize() {
    const gl = this.gl;
    const dpr = Math.min(this.pixelRatioCap, window.devicePixelRatio || 1);
    const w = Math.max(1, Math.round(this.canvas.clientWidth * dpr));
    const h = Math.max(1, Math.round(this.canvas.clientHeight * dpr));
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
    gl.viewport(0, 0, w, h);
  }
  getGeometry(geometry) {
    if (this.cache.has(geometry)) return this.cache.get(geometry);
    const gl = this.gl;
    const vao = gl.createVertexArray();
    const vertexBuffer = gl.createBuffer();
    const indexBuffer = gl.createBuffer();
    gl.bindVertexArray(vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, vertexBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, geometry.vertices, gl.STATIC_DRAW);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, geometry.indices, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 24, 0);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 24, 12);
    gl.bindVertexArray(null);
    const gpuMesh = { vao, vertexBuffer, indexBuffer, count: geometry.indices.length };
    this.cache.set(geometry, gpuMesh);
    return gpuMesh;
  }
  render(scene, camera) {
    this.resize();
    const gl = this.gl;
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.useProgram(this.program);
    gl.uniformMatrix4fv(this.uniforms.viewProjection, false, camera.matrix(this.canvas.width / this.canvas.height, 'webgl'));
    gl.uniform3fv(this.uniforms.eye, camera.position);
    this.drawCalls = 0;
    this.triangles = 0;
    for (const entity of scene.query('mesh')) {
      if (!entity.visible) continue;
      const mesh = entity.get('mesh');
      const gpuMesh = this.getGeometry(mesh.geometry);
      gl.uniformMatrix4fv(this.uniforms.model, false, entity.transform.matrix());
      gl.uniform4fv(this.uniforms.color, mesh.material.color);
      gl.bindVertexArray(gpuMesh.vao);
      gl.drawElements(gl.TRIANGLES, gpuMesh.count, gl.UNSIGNED_SHORT, 0);
      this.drawCalls++;
      this.triangles += gpuMesh.count / 3;
    }
    gl.bindVertexArray(null);
  }
  dispose() {
    const gl = this.gl;
    for (const value of this.cache.values()) {
      gl.deleteVertexArray(value.vao);
      gl.deleteBuffer(value.vertexBuffer);
      gl.deleteBuffer(value.indexBuffer);
    }
    this.cache.clear();
    gl.deleteProgram(this.program);
  }
}
