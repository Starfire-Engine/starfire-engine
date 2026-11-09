import { WebGLRenderer } from '../graphics/WebGLRenderer.js';
import { WebGPURenderer } from '../graphics/WebGPURenderer.js';
import { PerspectiveCamera } from './Camera.js';
import { Scene } from './Scene.js';
import { FrameProfiler } from './FrameProfiler.js';

/** Cross-backend engine lifecycle; game-specific systems belong outside the engine. */
export class Engine {
  constructor(canvas, renderer) {
    this.canvas = canvas;
    this.renderer = renderer;
    this.scene = new Scene();
    this.camera = new PerspectiveCamera();
    this.running = false;
    this.paused = false;
    this.elapsed = 0;
    this.onStats = null;
    this.onError = null;
    this.frame = 0;
    this.fps = 0;
    this.profiler = new FrameProfiler();
    this._sampleStart = 0;
    this._sampleFrames = 0;
  }
  static async create({ canvas, renderer = 'auto', pixelRatioCap = 2 } = {}) {
    if (!canvas || typeof canvas.getContext !== 'function') throw new TypeError('Engine.create requires a canvas');
    if (!['auto', 'webgpu', 'webgl2'].includes(renderer)) throw new RangeError(`Unknown renderer: ${renderer}`);
    if (!(pixelRatioCap >= 0.5 && pixelRatioCap <= 4)) throw new RangeError('pixelRatioCap must be between 0.5 and 4');
    const options = { renderer, pixelRatioCap };
    const errors = [];
    if (options.renderer !== 'webgl2') {
      const gpuRenderer = new WebGPURenderer(canvas, pixelRatioCap);
      try {
        await gpuRenderer.initialize();
        return new Engine(canvas, gpuRenderer);
      } catch (error) {
        // Initialization can allocate GPU buffers before shaders are validated.
        // Release partial resources before attempting WebGL 2 fallback.
        try { gpuRenderer.dispose(); } catch { /* Keep the original startup error. */ }
        errors.push(error);
        if (options.renderer === 'webgpu') throw error;
      }
    }
    try {
      const glRenderer = new WebGLRenderer(canvas, pixelRatioCap);
      await glRenderer.initialize();
      return new Engine(canvas, glRenderer);
    } catch (error) {
      // Partial WebGL initialization can also allocate programs and textures.
      try { glRenderer.dispose(); } catch { /* Keep the primary initialization error. */ }
      errors.push(error);
      throw new Error(`No supported renderer could initialize: ${errors.map((e) => e.message).join(' / ')}`);
    }
  }
  start() {
    if (this.running) return;
    this.running = true;
    this._lastTime = performance.now();
    this._sampleStart = this._lastTime;
    this._sampleFrames = 0;
    this.profiler.reset();
    const step = (now) => {
      if (!this.running) return;
      const dt = Math.min((now - this._lastTime) / 1000, 0.05);
      this._lastTime = now;
      try {
        const updateStart = performance.now();
        if (!this.paused) {
          this.elapsed += dt;
          this.scene.update(dt, this.elapsed);
        }
        const renderStart = performance.now();
        this.renderer.render(this.scene, this.camera);
        const workEnd = performance.now();
        this.profiler.record({ frameMs: workEnd - updateStart,
          updateMs: renderStart - updateStart, renderMs: workEnd - renderStart });
        this.frame++;
        this._sampleFrames++;
        if (now - this._sampleStart >= 400) {
          this.fps = Math.round(this._sampleFrames * 1000 / (now - this._sampleStart));
          this._sampleStart = now;
          this._sampleFrames = 0;
          this.onStats?.({
            fps: this.fps,
            renderer: this.renderer.name,
            entities: this.scene.entities.size,
            drawCalls: this.renderer.drawCalls,
            triangles: this.renderer.triangles,
            shadowDrawCalls: this.renderer.shadowDrawCalls ?? 0,
            culledMeshes: this.renderer.culledMeshes ?? 0,
            shadowCulled: this.renderer.shadowCulled ?? 0,
            visibleMeshes: this.renderer.visibleMeshes ?? 0,
            instancesRendered: this.renderer.instancesRendered ?? 0,
            ...this.profiler.snapshot(),
            resources: this.renderer.getDiagnostics?.() ?? null
          });
        }
      } catch (error) {
        this.stop();
        if (this.onError) this.onError(error);
        else console.error('Starfire Engine frame error:', error);
        return;
      }
      this._requestId = requestAnimationFrame(step);
    };
    this._requestId = requestAnimationFrame(step);
  }
  stop() {
    this.running = false;
    if (this._requestId !== undefined) cancelAnimationFrame(this._requestId);
  }
  dispose() { this.stop(); this.renderer.dispose(); }
}
