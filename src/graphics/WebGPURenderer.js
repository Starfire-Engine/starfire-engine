import { shaderWGSL } from './shaders.js';
import { prepareGeometry } from '../geometry/Geometry.js';
import { GeometryResourceCache } from './GeometryResourceCache.js';
import { collectRenderables } from './RenderQueue.js';
import { Texture2D } from './Texture2D.js';
import { TextureSampler } from './TextureSampler.js';
import { TextureResourceCache } from './TextureResourceCache.js';
import { resolveLighting } from './Lighting.js';
import { resolveMaterial } from './PBRMaterial.js';
import { shadowViewProjection } from './ShadowSettings.js';

const MAX_OBJECTS = 2048;
const OBJECT_STRIDE = 256; // WebGPU dynamic uniform offsets must respect 256-byte alignment.

export class WebGPURenderer {
  constructor(canvas, pixelRatioCap = 2) {
    this.canvas = canvas;
    this.pixelRatioCap = pixelRatioCap;
    this.name = 'WebGPU';
    this.cache = new GeometryResourceCache((resource) => {
      resource.vertexBuffer.destroy();
      resource.indexBuffer.destroy();
    });
    this.textureCache = new TextureResourceCache((resource) => resource.texture.destroy());
    this.samplerCache = new Map();
    this.fallbackTexture = Texture2D.fromRGBA(1, 1, new Uint8Array([255, 255, 255, 255]));
    // R=unused, G=roughness multiplier, B=metallic multiplier; linear 1x1.
    this.fallbackMRTexture = Texture2D.fromRGBA(1, 1, new Uint8Array([255, 255, 255, 255]), { colorSpace: 'linear' });
    this.drawCalls = 0;
    this.triangles = 0;
    this.shadowDrawCalls = 0;
    this.lost = false;
  }
  async initialize() {
    if (!navigator.gpu) throw new Error('WebGPU unavailable');
    const adapter = await navigator.gpu.requestAdapter();
    if (!adapter) throw new Error('No WebGPU adapter available');
    const device = await adapter.requestDevice();
    this.device = device;
    this.format = navigator.gpu.getPreferredCanvasFormat();
    device.lost.then(() => { this.lost = true; });
    this.cameraBuffer = device.createBuffer({ size: 288, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
    this.objectBuffer = device.createBuffer({ size: MAX_OBJECTS * OBJECT_STRIDE, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
    const bindGroupLayout = device.createBindGroupLayout({ entries: [
      { binding: 0, visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } },
      { binding: 1, visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT, buffer: { type: 'uniform', hasDynamicOffset: true, minBindingSize: 112 } }
    ] });
    this.bindGroup = device.createBindGroup({ layout: bindGroupLayout, entries: [
      { binding: 0, resource: { buffer: this.cameraBuffer } },
      { binding: 1, resource: { buffer: this.objectBuffer, offset: 0, size: 112 } }
    ] });
    this.textureBindGroupLayout = device.createBindGroupLayout({ entries: [
      { binding: 0, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'float', viewDimension: '2d' } },
      { binding: 1, visibility: GPUShaderStage.FRAGMENT, sampler: { type: 'filtering' } },
      { binding: 2, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'float', viewDimension: '2d' } },
      { binding: 3, visibility: GPUShaderStage.FRAGMENT, sampler: { type: 'filtering' } }
    ] });
    this.shadowBindGroupLayout = device.createBindGroupLayout({ entries: [
      { binding: 0, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'depth', viewDimension: '2d' } },
      { binding: 1, visibility: GPUShaderStage.FRAGMENT, sampler: { type: 'comparison' } }
    ] });
    this.shadowSampler = device.createSampler({ compare: 'less-equal', minFilter: 'nearest', magFilter: 'nearest',
      addressModeU: 'clamp-to-edge', addressModeV: 'clamp-to-edge' });
    const module = device.createShaderModule({ code: shaderWGSL });
    const info = await module.getCompilationInfo();
    const errors = info.messages.filter((message) => message.type === 'error');
    if (errors.length) throw new Error(`WGSL compilation error: ${errors.map((e) => e.message).join('; ')}`);
    this.pipeline = device.createRenderPipeline({
      layout: device.createPipelineLayout({ bindGroupLayouts: [bindGroupLayout, this.textureBindGroupLayout, this.shadowBindGroupLayout] }),
      vertex: {
        module, entryPoint: 'vertexMain',
        buffers: [{ arrayStride: 32, attributes: [
          { shaderLocation: 0, offset: 0, format: 'float32x3' },
          { shaderLocation: 1, offset: 12, format: 'float32x3' },
          { shaderLocation: 2, offset: 24, format: 'float32x2' }
        ] }]
      },
      fragment: { module, entryPoint: 'fragmentMain', targets: [{ format: this.format }] },
      primitive: { topology: 'triangle-list', cullMode: 'back', frontFace: 'ccw' },
      depthStencil: { format: 'depth24plus', depthWriteEnabled: true, depthCompare: 'less' }
    });
    this.shadowPipeline = device.createRenderPipeline({
      layout: device.createPipelineLayout({ bindGroupLayouts: [bindGroupLayout] }),
      vertex: { module, entryPoint: 'shadowVertex', buffers: [{ arrayStride: 32, attributes: [
        { shaderLocation: 0, offset: 0, format: 'float32x3' },
        { shaderLocation: 1, offset: 12, format: 'float32x3' },
        { shaderLocation: 2, offset: 24, format: 'float32x2' }
      ] }] },
      primitive: { topology: 'triangle-list', cullMode: 'back', frontFace: 'ccw' },
      depthStencil: { format: 'depth24plus', depthWriteEnabled: true, depthCompare: 'less',
        depthBias: 2, depthBiasSlopeScale: 2 }
    });
    // Delay context acquisition until shader/pipeline compilation succeeds.
    // If WebGPU is unavailable, WebGL 2 can still use the same canvas.
    const context = this.canvas.getContext('webgpu');
    if (!context) throw new Error('WebGPU canvas context unavailable');
    this.context = context;
    context.configure({ device: this.device, format: this.format, alphaMode: 'opaque' });
    this.resize();
    this.ensureShadowResources(1); // Valid fallback depth binding even if shadows are disabled.
  }
  /** Reallocate only when the requested shadow-map resolution changes. */
  ensureShadowResources(size) {
    if (this.shadowTexture && this.shadowSize === size) return;
    const texture = this.device.createTexture({
      size: [size, size, 1], format: 'depth24plus',
      usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING
    });
    let bindGroup;
    try {
      bindGroup = this.device.createBindGroup({ layout: this.shadowBindGroupLayout, entries: [
        { binding: 0, resource: texture.createView() },
        { binding: 1, resource: this.shadowSampler }
      ] });
    } catch (error) { texture.destroy(); throw error; }
    this.shadowTexture?.destroy();
    this.shadowTexture = texture;
    this.shadowSize = size;
    this.shadowBindGroup = bindGroup;
  }
  resize() {
    const dpr = Math.min(this.pixelRatioCap, window.devicePixelRatio || 1);
    const w = Math.max(1, Math.round(this.canvas.clientWidth * dpr));
    const h = Math.max(1, Math.round(this.canvas.clientHeight * dpr));
    const sizeChanged = this.canvas.width !== w || this.canvas.height !== h;
    if (!sizeChanged && this.depthTexture) return;
    if (sizeChanged) {
      this.canvas.width = w;
      this.canvas.height = h;
      this.context.configure({ device: this.device, format: this.format, alphaMode: 'opaque' });
    }
    this.depthTexture?.destroy();
    this.depthTexture = this.device.createTexture({
      size: [w, h], format: 'depth24plus', usage: GPUTextureUsage.RENDER_ATTACHMENT
    });
  }
  getGeometry(geometry) {
    return this.cache.get(geometry, () => {
      const { vertices, indices } = prepareGeometry(geometry);
      let vertexBuffer, indexBuffer;
      try {
        vertexBuffer = this.device.createBuffer({ size: vertices.byteLength, usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST });
        indexBuffer = this.device.createBuffer({ size: indices.byteLength, usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST });
        this.device.queue.writeBuffer(vertexBuffer, 0, vertices);
        this.device.queue.writeBuffer(indexBuffer, 0, indices);
        return { vertexBuffer, indexBuffer, count: indices.length, indexFormat: indices instanceof Uint32Array ? 'uint32' : 'uint16' };
      } catch (error) {
        vertexBuffer?.destroy();
        indexBuffer?.destroy();
        throw error;
      }
    });
  }
  /** Upload an image or RGBA byte array; cache is per renderer/device. */
  getTexture(texture) {
    return this.textureCache.get(texture, () => {
      const device = this.device;
      const gpuTexture = device.createTexture({
        size: [texture.width, texture.height, 1],
        format: texture.colorSpace === 'srgb' ? 'rgba8unorm-srgb' : 'rgba8unorm',
        mipLevelCount: 1,
        usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT
      });
      try {
        if (texture.data) {
          // Padded rows are valid for writeTexture on all implementations.
          const stride = texture.width * 4;
          const aligned = Math.ceil(stride / 256) * 256;
          let bytes = texture.data;
          if (aligned !== stride) {
            bytes = new Uint8Array(aligned * texture.height);
            for (let y = 0; y < texture.height; y++) {
              bytes.set(texture.data.subarray(y * stride, (y + 1) * stride), y * aligned);
            }
          }
          device.queue.writeTexture({ texture: gpuTexture }, bytes,
            { bytesPerRow: aligned, rowsPerImage: texture.height },
            { width: texture.width, height: texture.height, depthOrArrayLayers: 1 });
        } else {
          device.queue.copyExternalImageToTexture({ source: texture.image, flipY: false },
            { texture: gpuTexture }, [texture.width, texture.height]);
        }
        // WeakMap keys are the second texture resource: binding sets don't
        // retain dead metallic-roughness uploads after version changes.
        return { texture: gpuTexture, view: gpuTexture.createView(), bindGroups: new WeakMap() };
      } catch (error) { gpuTexture.destroy(); throw error; }
    });
  }
  getSampler(sampler = TextureSampler.DEFAULT) {
    if (!(sampler instanceof TextureSampler)) throw new TypeError('Expected TextureSampler');
    if (!this.samplerCache.has(sampler.key)) {
      this.samplerCache.set(sampler.key, this.device.createSampler({
        addressModeU: sampler.wrapU, addressModeV: sampler.wrapV,
        minFilter: sampler.minFilter, magFilter: sampler.magFilter,
        mipmapFilter: 'nearest', maxAnisotropy: 1
      }));
    }
    return this.samplerCache.get(sampler.key);
  }
  getMaterialBindGroup(material) {
    // Browser initialize() establishes the texture layout; older tests stub only geometry.
    if (!this.textureBindGroupLayout) return null;
    const baseTexture = material.baseColorTexture ?? this.fallbackTexture;
    const pbr = resolveMaterial(material);
    const mrTexture = pbr.metallicRoughnessTexture ?? this.fallbackMRTexture;
    const sampler = material.sampler ?? TextureSampler.DEFAULT;
    const baseResource = this.getTexture(baseTexture);
    const mrResource = this.getTexture(mrTexture);
    let groups = baseResource.bindGroups.get(mrResource);
    if (!groups) {
      groups = new Map();
      baseResource.bindGroups.set(mrResource, groups);
    }
    if (!groups.has(sampler.key)) {
      groups.set(sampler.key, this.device.createBindGroup({
        layout: this.textureBindGroupLayout,
        entries: [
          { binding: 0, resource: baseResource.view },
          { binding: 1, resource: this.getSampler(sampler) },
          { binding: 2, resource: mrResource.view },
          { binding: 3, resource: this.getSampler(sampler) }
        ]
      }));
    }
    return groups.get(sampler.key);
  }
  render(scene, camera) {
    if (this.lost) throw new Error('WebGPU device lost; reload to reinitialize the renderer');
    this.resize();
    const device = this.device;
    const lighting = resolveLighting(scene);
    const shadows = lighting.shadows;
    const shadowsActive = shadows.enabled && Boolean(this.shadowPipeline);
    if (this.shadowPipeline) this.ensureShadowResources(shadowsActive ? shadows.mapSize : 1);
    const shadowMatrix = shadowsActive
      ? shadowViewProjection(lighting.direction, shadows, 'webgpu')
      : new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
    const uniforms = new Float32Array(72);
    uniforms.set(camera.matrix(this.canvas.width / this.canvas.height, 'webgpu'), 0);
    uniforms.set([...lighting.direction, 0], 16);
    uniforms.set([...camera.position, 1], 20);
    uniforms.set([...lighting.color, lighting.intensity], 24);
    uniforms.set([...lighting.ambientColor, lighting.ambientIntensity], 28);
    uniforms.set([lighting.exposure, 0, 0, 0], 32);
    uniforms.set(shadowMatrix, 36);
    uniforms.set([Number(shadowsActive), shadows.bias, shadows.strength, 1 / (shadowsActive ? shadows.mapSize : 1)], 52);
    uniforms.set([...lighting.environment.skyColor, 0], 56);
    uniforms.set([...lighting.environment.horizonColor, 0], 60);
    uniforms.set([...lighting.environment.groundColor, 0], 64);
    uniforms.set([lighting.environment.intensity, 0, 0, 0], 68);
    device.queue.writeBuffer(this.cameraBuffer, 0, uniforms);
    const meshes = collectRenderables(scene);
    this.cache.sweep(new Set(meshes.map((item) => item.geometry)));
    this.textureCache.sweep(new Set([
      this.fallbackTexture, this.fallbackMRTexture,
      ...meshes.map((item) => item.mesh.material.baseColorTexture).filter(Boolean),
      ...meshes.map((item) => resolveMaterial(item.mesh.material).metallicRoughnessTexture).filter(Boolean)
    ]));
    if (meshes.length > MAX_OBJECTS) throw new Error(`Exceeded renderer draw limit of ${MAX_OBJECTS} objects`);
    const objects = new Float32Array((OBJECT_STRIDE / 4) * meshes.length);
    meshes.forEach((entity, index) => {
      const mesh = entity.mesh;
      objects.set(entity.modelMatrix, index * OBJECT_STRIDE / 4);
      objects.set(mesh.material.color, index * OBJECT_STRIDE / 4 + 16);
      const pbr = resolveMaterial(mesh.material);
      objects.set([pbr.metallic, pbr.roughness, Number(pbr.isPBR), 0], index * OBJECT_STRIDE / 4 + 20);
      objects.set([...pbr.emissive, 0], index * OBJECT_STRIDE / 4 + 24);
    });
    if (meshes.length) device.queue.writeBuffer(this.objectBuffer, 0, objects);
    const encoder = device.createCommandEncoder();
    this.shadowDrawCalls = 0;
    if (shadowsActive) {
      const depthPass = encoder.beginRenderPass({
        colorAttachments: [],
        depthStencilAttachment: { view: this.shadowTexture.createView(),
          depthClearValue: 1, depthLoadOp: 'clear', depthStoreOp: 'store' }
      });
      depthPass.setPipeline(this.shadowPipeline);
      meshes.forEach((item, index) => {
        const buffer = this.getGeometry(item.geometry);
        depthPass.setBindGroup(0, this.bindGroup, [index * OBJECT_STRIDE]);
        depthPass.setVertexBuffer(0, buffer.vertexBuffer);
        depthPass.setIndexBuffer(buffer.indexBuffer, buffer.indexFormat);
        depthPass.drawIndexed(buffer.count);
        this.shadowDrawCalls++;
      });
      depthPass.end();
    }
    const pass = encoder.beginRenderPass({
      colorAttachments: [{
        view: this.context.getCurrentTexture().createView(),
        clearValue: { r: 0.023, g: 0.034, b: 0.063, a: 1 },
        loadOp: 'clear', storeOp: 'store'
      }],
      depthStencilAttachment: {
        view: this.depthTexture.createView(),
        depthClearValue: 1, depthLoadOp: 'clear', depthStoreOp: 'store'
      }
    });
    pass.setPipeline(this.pipeline);
    if (this.shadowBindGroup) pass.setBindGroup(2, this.shadowBindGroup);
    this.drawCalls = 0;
    this.triangles = 0;
    meshes.forEach((entity, index) => {
      const buffer = this.getGeometry(entity.geometry);
      pass.setBindGroup(0, this.bindGroup, [index * OBJECT_STRIDE]);
      const materialGroup = this.getMaterialBindGroup(entity.mesh.material);
      if (materialGroup) pass.setBindGroup(1, materialGroup);
      pass.setVertexBuffer(0, buffer.vertexBuffer);
      pass.setIndexBuffer(buffer.indexBuffer, buffer.indexFormat);
      pass.drawIndexed(buffer.count);
      this.drawCalls++;
      this.triangles += buffer.count / 3;
    });
    pass.end();
    device.queue.submit([encoder.finish()]);
  }
  dispose() {
    this.cache.clear();
    this.textureCache.clear();
    this.samplerCache.clear();
    this.depthTexture?.destroy();
    this.shadowTexture?.destroy();
    this.shadowTexture = null;
    this.shadowBindGroup = null;
    this.cameraBuffer?.destroy();
    this.objectBuffer?.destroy();
  }
}
