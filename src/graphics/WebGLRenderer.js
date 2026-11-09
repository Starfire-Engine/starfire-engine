import { fragmentGLSL, vertexGLSL } from './shaders.js';
import { prepareGeometry } from '../geometry/Geometry.js';
import { GeometryResourceCache } from './GeometryResourceCache.js';
import { collectRenderables } from './RenderQueue.js';
import { Texture2D } from './Texture2D.js';
import { TextureSampler } from './TextureSampler.js';
import { TextureResourceCache } from './TextureResourceCache.js';

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
    this.textureCache = new TextureResourceCache((resource) => this.gl.deleteTexture(resource));
    this.samplerCache = new Map();
    this.fallbackTexture = Texture2D.fromRGBA(1, 1, new Uint8Array([255, 255, 255, 255]));
    this.drawCalls = 0;
    this.triangles = 0;
    this.cache = new GeometryResourceCache((resource) => {
      this.gl.deleteVertexArray(resource.vao);
      this.gl.deleteBuffer(resource.vertexBuffer);
      this.gl.deleteBuffer(resource.indexBuffer);
    });
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
      eye: gl.getUniformLocation(this.program, 'uEye'),
      baseColorTexture: gl.getUniformLocation(this.program, 'uBaseColorTexture')
    };
    gl.useProgram(this.program);
    gl.uniform1i(this.uniforms.baseColorTexture, 0);
    this.texturingReady = true;
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
    return this.cache.get(geometry, () => {
      const { vertices, indices } = prepareGeometry(geometry);
      const gl = this.gl;
      const vao = gl.createVertexArray();
      const vertexBuffer = gl.createBuffer();
      const indexBuffer = gl.createBuffer();
      if (!vao || !vertexBuffer || !indexBuffer) {
        if (vao) gl.deleteVertexArray(vao);
        if (vertexBuffer) gl.deleteBuffer(vertexBuffer);
        if (indexBuffer) gl.deleteBuffer(indexBuffer);
        throw new Error('Unable to allocate WebGL geometry resources');
      }
      try {
        gl.bindVertexArray(vao);
        gl.bindBuffer(gl.ARRAY_BUFFER, vertexBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer);
        gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indices, gl.STATIC_DRAW);
        gl.enableVertexAttribArray(0);
        gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 32, 0);
        gl.enableVertexAttribArray(1);
        gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 32, 12);
        gl.enableVertexAttribArray(2);
        gl.vertexAttribPointer(2, 2, gl.FLOAT, false, 32, 24);
        return { vao, vertexBuffer, indexBuffer, count: indices.length,
          indexType: indices instanceof Uint32Array ? gl.UNSIGNED_INT : gl.UNSIGNED_SHORT };
      } catch (error) {
        gl.deleteVertexArray(vao);
        gl.deleteBuffer(vertexBuffer);
        gl.deleteBuffer(indexBuffer);
        throw error;
      } finally { gl.bindVertexArray(null); }
    });
  }
  getTexture(texture) {
    return this.textureCache.get(texture, () => {
      const gl = this.gl;
      const gpuTexture = gl.createTexture();
      if (!gpuTexture) throw new Error('Unable to allocate WebGL texture');
      try {
        gl.bindTexture(gl.TEXTURE_2D, gpuTexture);
        gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        const format = texture.colorSpace === 'srgb' ? gl.SRGB8_ALPHA8 : gl.RGBA8;
        if (texture.data) {
          gl.texImage2D(gl.TEXTURE_2D, 0, format, texture.width, texture.height,
            0, gl.RGBA, gl.UNSIGNED_BYTE, texture.data);
        } else {
          gl.texImage2D(gl.TEXTURE_2D, 0, format, gl.RGBA, gl.UNSIGNED_BYTE, texture.image);
        }
        return gpuTexture;
      } catch (error) { gl.deleteTexture(gpuTexture); throw error; }
      finally { gl.bindTexture(gl.TEXTURE_2D, null); }
    });
  }
  getSampler(sampler = TextureSampler.DEFAULT) {
    if (!(sampler instanceof TextureSampler)) throw new TypeError('Expected TextureSampler');
    const gl = this.gl;
    if (!this.samplerCache.has(sampler.key)) {
      const state = gl.createSampler();
      if (!state) throw new Error('Unable to allocate WebGL sampler');
      const wraps = { repeat: gl.REPEAT, 'clamp-to-edge': gl.CLAMP_TO_EDGE, 'mirror-repeat': gl.MIRRORED_REPEAT };
      const filters = { nearest: gl.NEAREST, linear: gl.LINEAR };
      gl.samplerParameteri(state, gl.TEXTURE_WRAP_S, wraps[sampler.wrapU]);
      gl.samplerParameteri(state, gl.TEXTURE_WRAP_T, wraps[sampler.wrapV]);
      gl.samplerParameteri(state, gl.TEXTURE_MIN_FILTER, filters[sampler.minFilter]);
      gl.samplerParameteri(state, gl.TEXTURE_MAG_FILTER, filters[sampler.magFilter]);
      this.samplerCache.set(sampler.key, state);
    }
    return this.samplerCache.get(sampler.key);
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
    const renderables = collectRenderables(scene);
    this.cache.sweep(new Set(renderables.map((item) => item.geometry)));
    this.textureCache.sweep(new Set([
      this.fallbackTexture,
      ...renderables.map((item) => item.mesh.material.baseColorTexture).filter(Boolean)
    ]));
    for (const item of renderables) {
      const gpuMesh = this.getGeometry(item.geometry);
      gl.uniformMatrix4fv(this.uniforms.model, false, item.modelMatrix);
      gl.uniform4fv(this.uniforms.color, item.mesh.material.color);
      if (this.texturingReady) {
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D,
          this.getTexture(item.mesh.material.baseColorTexture ?? this.fallbackTexture));
        gl.bindSampler(0, this.getSampler(item.mesh.material.sampler ?? TextureSampler.DEFAULT));
      }
      gl.bindVertexArray(gpuMesh.vao);
      gl.drawElements(gl.TRIANGLES, gpuMesh.count, gpuMesh.indexType, 0);
      this.drawCalls++;
      this.triangles += gpuMesh.count / 3;
    }
    gl.bindVertexArray(null);
    if (this.texturingReady) {
      gl.bindSampler(0, null);
      gl.bindTexture(gl.TEXTURE_2D, null);
    }
  }
  dispose() {
    const gl = this.gl;
    this.cache.clear();
    this.textureCache.clear();
    for (const sampler of this.samplerCache.values()) gl.deleteSampler(sampler);
    this.samplerCache.clear();
    if (this.program) gl.deleteProgram(this.program);
  }
}
