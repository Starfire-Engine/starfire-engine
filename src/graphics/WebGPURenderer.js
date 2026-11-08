import { shaderWGSL } from './shaders.js';

const MAX_OBJECTS = 2048;
const OBJECT_STRIDE = 256; // WebGPU dynamic uniform offsets must respect 256-byte alignment.

export class WebGPURenderer {
  constructor(canvas, pixelRatioCap = 2) {
    this.canvas = canvas;
    this.pixelRatioCap = pixelRatioCap;
    this.name = 'WebGPU';
    this.cache = new Map();
    this.drawCalls = 0;
    this.triangles = 0;
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
    this.cameraBuffer = device.createBuffer({ size: 96, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
    this.objectBuffer = device.createBuffer({ size: MAX_OBJECTS * OBJECT_STRIDE, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
    const bindGroupLayout = device.createBindGroupLayout({ entries: [
      { binding: 0, visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } },
      { binding: 1, visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT, buffer: { type: 'uniform', hasDynamicOffset: true, minBindingSize: 80 } }
    ] });
    this.bindGroup = device.createBindGroup({ layout: bindGroupLayout, entries: [
      { binding: 0, resource: { buffer: this.cameraBuffer } },
      { binding: 1, resource: { buffer: this.objectBuffer, offset: 0, size: 80 } }
    ] });
    const module = device.createShaderModule({ code: shaderWGSL });
    const info = await module.getCompilationInfo();
    const errors = info.messages.filter((message) => message.type === 'error');
    if (errors.length) throw new Error(`WGSL compilation error: ${errors.map((e) => e.message).join('; ')}`);
    this.pipeline = device.createRenderPipeline({
      layout: device.createPipelineLayout({ bindGroupLayouts: [bindGroupLayout] }),
      vertex: {
        module, entryPoint: 'vertexMain',
        buffers: [{ arrayStride: 24, attributes: [
          { shaderLocation: 0, offset: 0, format: 'float32x3' },
          { shaderLocation: 1, offset: 12, format: 'float32x3' }
        ] }]
      },
      fragment: { module, entryPoint: 'fragmentMain', targets: [{ format: this.format }] },
      primitive: { topology: 'triangle-list', cullMode: 'back', frontFace: 'ccw' },
      depthStencil: { format: 'depth24plus', depthWriteEnabled: true, depthCompare: 'less' }
    });
    // Delay context acquisition until shader/pipeline compilation succeeds.
    // If WebGPU is unavailable, WebGL 2 can still use the same canvas.
    const context = this.canvas.getContext('webgpu');
    if (!context) throw new Error('WebGPU canvas context unavailable');
    this.context = context;
    context.configure({ device: this.device, format: this.format, alphaMode: 'opaque' });
    this.resize();
  }
  resize() {
    const dpr = Math.min(this.pixelRatioCap, window.devicePixelRatio || 1);
    const w = Math.max(1, Math.round(this.canvas.clientWidth * dpr));
    const h = Math.max(1, Math.round(this.canvas.clientHeight * dpr));
    if (this.canvas.width === w && this.canvas.height === h) return;
    this.canvas.width = w;
    this.canvas.height = h;
    this.context.configure({ device: this.device, format: this.format, alphaMode: 'opaque' });
    this.depthTexture?.destroy();
    this.depthTexture = this.device.createTexture({
      size: [w, h], format: 'depth24plus', usage: GPUTextureUsage.RENDER_ATTACHMENT
    });
  }
  getGeometry(geometry) {
    if (this.cache.has(geometry)) return this.cache.get(geometry);
    const device = this.device;
    const vertexBuffer = device.createBuffer({ size: geometry.vertices.byteLength, usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST });
    const indexBuffer = device.createBuffer({ size: geometry.indices.byteLength, usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST });
    device.queue.writeBuffer(vertexBuffer, 0, geometry.vertices);
    device.queue.writeBuffer(indexBuffer, 0, geometry.indices);
    const value = { vertexBuffer, indexBuffer, count: geometry.indices.length };
    this.cache.set(geometry, value);
    return value;
  }
  render(scene, camera) {
    if (this.lost) throw new Error('WebGPU device lost; reload to reinitialize the renderer');
    this.resize();
    const device = this.device;
    const uniforms = new Float32Array(24);
    uniforms.set(camera.matrix(this.canvas.width / this.canvas.height, 'webgpu'), 0);
    uniforms.set([0.65, 0.95, 0.42, 0], 16);
    uniforms.set([...camera.position, 1], 20);
    device.queue.writeBuffer(this.cameraBuffer, 0, uniforms);
    const meshes = scene.query('mesh').filter((entity) => entity.visible);
    if (meshes.length > MAX_OBJECTS) throw new Error(`Exceeded renderer draw limit of ${MAX_OBJECTS} objects`);
    const objects = new Float32Array((OBJECT_STRIDE / 4) * meshes.length);
    meshes.forEach((entity, index) => {
      const mesh = entity.get('mesh');
      objects.set(entity.transform.matrix(), index * OBJECT_STRIDE / 4);
      objects.set(mesh.material.color, index * OBJECT_STRIDE / 4 + 16);
    });
    if (meshes.length) device.queue.writeBuffer(this.objectBuffer, 0, objects);
    const encoder = device.createCommandEncoder();
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
    this.drawCalls = 0;
    this.triangles = 0;
    meshes.forEach((entity, index) => {
      const mesh = entity.get('mesh');
      const buffer = this.getGeometry(mesh.geometry);
      pass.setBindGroup(0, this.bindGroup, [index * OBJECT_STRIDE]);
      pass.setVertexBuffer(0, buffer.vertexBuffer);
      pass.setIndexBuffer(buffer.indexBuffer, 'uint16');
      pass.drawIndexed(buffer.count);
      this.drawCalls++;
      this.triangles += buffer.count / 3;
    });
    pass.end();
    device.queue.submit([encoder.finish()]);
  }
  dispose() {
    for (const geometry of this.cache.values()) {
      geometry.vertexBuffer.destroy();
      geometry.indexBuffer.destroy();
    }
    this.cache.clear();
    this.depthTexture?.destroy();
    this.cameraBuffer?.destroy();
    this.objectBuffer?.destroy();
  }
}
