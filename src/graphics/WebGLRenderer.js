import { fragmentGLSL, vertexGLSL, shadowFragmentGLSL, shadowVertexGLSL } from './shaders.js';
import { prepareGeometry } from '../geometry/Geometry.js';
import { GeometryResourceCache } from './GeometryResourceCache.js';
import { collectRenderables } from './RenderQueue.js';
import { Texture2D } from './Texture2D.js';
import { TextureSampler } from './TextureSampler.js';
import { TextureResourceCache } from './TextureResourceCache.js';
import { resolveLighting } from './Lighting.js';
import { resolveMaterial } from './PBRMaterial.js';
import { shadowViewProjection } from './ShadowSettings.js';
import { Mat4 } from '../math/Mat4.js';

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
function createProgram(gl, vertexSource = vertexGLSL, fragmentSource = fragmentGLSL) {
  const vertex = compile(gl, gl.VERTEX_SHADER, vertexSource);
  const fragment = compile(gl, gl.FRAGMENT_SHADER, fragmentSource);
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
    this.fallbackMRTexture = Texture2D.fromRGBA(1, 1, new Uint8Array([255, 255, 255, 255]), { colorSpace: 'linear' });
    this.drawCalls = 0;
    this.triangles = 0;
    this.shadowDrawCalls = 0;
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
      baseColorTexture: gl.getUniformLocation(this.program, 'uBaseColorTexture'),
      metallicRoughnessTexture: gl.getUniformLocation(this.program, 'uMetallicRoughnessTexture'),
      pbrParams: gl.getUniformLocation(this.program, 'uPBRParams'),
      emissive: gl.getUniformLocation(this.program, 'uEmissive'),
      lightDirection: gl.getUniformLocation(this.program, 'uLightDirection'),
      keyLight: gl.getUniformLocation(this.program, 'uKeyLight'),
      ambientLight: gl.getUniformLocation(this.program, 'uAmbientLight'),
      exposure: gl.getUniformLocation(this.program, 'uExposure'),
      shadowViewProjection: gl.getUniformLocation(this.program, 'uShadowViewProjection'),
      shadowParams: gl.getUniformLocation(this.program, 'uShadowParams'),
      shadowMap: gl.getUniformLocation(this.program, 'uShadowMap'),
      skyColor: gl.getUniformLocation(this.program, 'uSkyColor'),
      horizonColor: gl.getUniformLocation(this.program, 'uHorizonColor'),
      groundColor: gl.getUniformLocation(this.program, 'uGroundColor'),
      environmentIntensity: gl.getUniformLocation(this.program, 'uEnvironmentIntensity')
    };
    gl.useProgram(this.program);
    gl.uniform1i(this.uniforms.baseColorTexture, 0);
    gl.uniform1i(this.uniforms.metallicRoughnessTexture, 1);
    this.shadowProgram = createProgram(gl, shadowVertexGLSL, shadowFragmentGLSL);
    this.shadowUniforms = {
      viewProjection: gl.getUniformLocation(this.shadowProgram, 'uShadowViewProjection'),
      model: gl.getUniformLocation(this.shadowProgram, 'uModel')
    };
    gl.useProgram(this.program);
    gl.uniform1i(this.uniforms.shadowMap, 2);
    this.shadowReady = true;
    this.texturingReady = true;
    this.pbrReady = true;
    gl.enable(gl.DEPTH_TEST);
    gl.enable(gl.CULL_FACE);
    gl.cullFace(gl.BACK);
    gl.clearColor(0.023, 0.034, 0.063, 1);
    this.ensureShadowResources(1); // Complete depth texture binding when shadows are off.
    this.resize();
  }
  ensureShadowResources(size) {
    if (this.shadowTexture && this.shadowSize === size) return;
    const gl = this.gl;
    const texture = gl.createTexture();
    const framebuffer = gl.createFramebuffer();
    if (!texture || !framebuffer) {
      if (texture) gl.deleteTexture(texture);
      if (framebuffer) gl.deleteFramebuffer(framebuffer);
      throw new Error('Could not allocate WebGL shadow depth map');
    }
    try {
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.DEPTH_COMPONENT24, size, size, 0,
        gl.DEPTH_COMPONENT, gl.UNSIGNED_INT, null);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_COMPARE_MODE, gl.COMPARE_REF_TO_TEXTURE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_COMPARE_FUNC, gl.LEQUAL);
      gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.TEXTURE_2D, texture, 0);
      gl.drawBuffers([gl.NONE]);
      gl.readBuffer(gl.NONE);
      if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) {
        throw new Error('WebGL shadow framebuffer is incomplete');
      }
    } catch (error) {
      gl.deleteFramebuffer(framebuffer);
      gl.deleteTexture(texture);
      throw error;
    } finally {
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.bindTexture(gl.TEXTURE_2D, null);
    }
    if (this.shadowFramebuffer) gl.deleteFramebuffer(this.shadowFramebuffer);
    if (this.shadowTexture) gl.deleteTexture(this.shadowTexture);
    this.shadowTexture = texture;
    this.shadowFramebuffer = framebuffer;
    this.shadowSize = size;
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
    const lighting = resolveLighting(scene);
    const shadows = lighting.shadows;
    const shadowsActive = shadows.enabled && Boolean(this.shadowReady);
    const renderables = collectRenderables(scene);
    const shadowMatrix = shadowsActive
      ? shadowViewProjection(lighting.direction, shadows, 'webgl') : Mat4.identity();
    this.shadowDrawCalls = 0;
    if (this.shadowReady) {
      this.ensureShadowResources(shadowsActive ? shadows.mapSize : 1);
    }
    if (shadowsActive) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.shadowFramebuffer);
      try {
        gl.viewport(0, 0, shadows.mapSize, shadows.mapSize);
        gl.clear(gl.DEPTH_BUFFER_BIT);
        gl.colorMask(false, false, false, false);
        gl.enable(gl.POLYGON_OFFSET_FILL);
        gl.polygonOffset(2, 2);
        gl.useProgram(this.shadowProgram);
        gl.uniformMatrix4fv(this.shadowUniforms.viewProjection, false, shadowMatrix);
        for (const item of renderables) {
          const geometry = this.getGeometry(item.geometry);
          gl.uniformMatrix4fv(this.shadowUniforms.model, false, item.modelMatrix);
          gl.bindVertexArray(geometry.vao);
          gl.drawElements(gl.TRIANGLES, geometry.count, geometry.indexType, 0);
          this.shadowDrawCalls++;
        }
      } finally {
        // An upload/draw failure must never leave the browser canvas bound to
        // the shadow FBO or leave color writes disabled on the next frame.
        gl.bindVertexArray(null);
        gl.disable(gl.POLYGON_OFFSET_FILL);
        gl.colorMask(true, true, true, true);
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.viewport(0, 0, this.canvas.width, this.canvas.height);
      }
    }
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.useProgram(this.program);
    gl.uniformMatrix4fv(this.uniforms.viewProjection, false, camera.matrix(this.canvas.width / this.canvas.height, 'webgl'));
    gl.uniform3fv(this.uniforms.eye, camera.position);
    if (this.pbrReady) {
      gl.uniform3fv(this.uniforms.lightDirection, lighting.direction);
      gl.uniform4fv(this.uniforms.keyLight, [...lighting.color, lighting.intensity]);
      gl.uniform4fv(this.uniforms.ambientLight, [...lighting.ambientColor, lighting.ambientIntensity]);
      gl.uniform1f(this.uniforms.exposure, lighting.exposure);
      if (this.shadowReady) {
        gl.uniformMatrix4fv(this.uniforms.shadowViewProjection, false, shadowMatrix);
        gl.uniform4fv(this.uniforms.shadowParams, [Number(shadowsActive), shadows.bias, shadows.strength,
          1 / (shadowsActive ? shadows.mapSize : 1)]);
        gl.uniform4fv(this.uniforms.skyColor, [...lighting.environment.skyColor, 0]);
        gl.uniform4fv(this.uniforms.horizonColor, [...lighting.environment.horizonColor, 0]);
        gl.uniform4fv(this.uniforms.groundColor, [...lighting.environment.groundColor, 0]);
        gl.uniform1f(this.uniforms.environmentIntensity, lighting.environment.intensity);
        gl.activeTexture(gl.TEXTURE2);
        gl.bindTexture(gl.TEXTURE_2D, this.shadowTexture);
        gl.activeTexture(gl.TEXTURE0);
      }
    }
    this.drawCalls = 0;
    this.triangles = 0;
    this.cache.sweep(new Set(renderables.map((item) => item.geometry)));
    this.textureCache.sweep(new Set([
      this.fallbackTexture, this.fallbackMRTexture,
      ...renderables.map((item) => item.mesh.material.baseColorTexture).filter(Boolean),
      ...renderables.map((item) => resolveMaterial(item.mesh.material).metallicRoughnessTexture).filter(Boolean)
    ]));
    for (const item of renderables) {
      const gpuMesh = this.getGeometry(item.geometry);
      gl.uniformMatrix4fv(this.uniforms.model, false, item.modelMatrix);
      gl.uniform4fv(this.uniforms.color, item.mesh.material.color);
      const pbr = resolveMaterial(item.mesh.material);
      if (this.pbrReady) {
        gl.uniform4fv(this.uniforms.pbrParams, [pbr.metallic, pbr.roughness, Number(pbr.isPBR), 0]);
        gl.uniform3fv(this.uniforms.emissive, pbr.emissive);
      }
      if (this.texturingReady) {
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D,
          this.getTexture(item.mesh.material.baseColorTexture ?? this.fallbackTexture));
        gl.bindSampler(0, this.getSampler(item.mesh.material.sampler ?? TextureSampler.DEFAULT));
        if (this.pbrReady) {
          gl.activeTexture(gl.TEXTURE1);
          gl.bindTexture(gl.TEXTURE_2D, this.getTexture(pbr.metallicRoughnessTexture ?? this.fallbackMRTexture));
          gl.bindSampler(1, this.getSampler(item.mesh.material.sampler ?? TextureSampler.DEFAULT));
        }
      }
      gl.bindVertexArray(gpuMesh.vao);
      gl.drawElements(gl.TRIANGLES, gpuMesh.count, gpuMesh.indexType, 0);
      this.drawCalls++;
      this.triangles += gpuMesh.count / 3;
    }
    gl.bindVertexArray(null);
    if (this.shadowReady) {
      gl.activeTexture(gl.TEXTURE2);
      gl.bindTexture(gl.TEXTURE_2D, null);
      gl.activeTexture(gl.TEXTURE0);
    }
    if (this.texturingReady) {
      gl.bindSampler(0, null);
      if (this.pbrReady) {
        gl.activeTexture(gl.TEXTURE1);
        gl.bindSampler(1, null);
        gl.bindTexture(gl.TEXTURE_2D, null);
        gl.activeTexture(gl.TEXTURE0);
      }
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
    if (this.shadowProgram) gl.deleteProgram(this.shadowProgram);
    if (this.shadowFramebuffer) gl.deleteFramebuffer(this.shadowFramebuffer);
    if (this.shadowTexture) gl.deleteTexture(this.shadowTexture);
  }
}
