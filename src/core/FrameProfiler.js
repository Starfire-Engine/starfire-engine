/** CPU-side timings only; not a GPU timestamp query or a GPU execution metric. */
export class FrameProfiler {
  constructor() { this.reset(); }
  reset() { this.frame = 0; this.average = { frameMs: 0, updateMs: 0, renderMs: 0 }; }
  record({ frameMs, updateMs = 0, renderMs = 0 }) {
    for (const [name, value] of Object.entries({ frameMs, updateMs, renderMs })) {
      if (!Number.isFinite(value) || value < 0) throw new RangeError(`Invalid frame timing ${name}`);
    }
    const smoothing = this.frame === 0 ? 1 : 0.1;
    for (const [name, value] of Object.entries({ frameMs, updateMs, renderMs })) {
      this.average[name] += (value - this.average[name]) * smoothing;
    }
    this.frame++;
  }
  snapshot() {
    return { frames: this.frame, cpuFrameMs: this.average.frameMs,
      cpuUpdateMs: this.average.updateMs, cpuRenderMs: this.average.renderMs,
      gpuMs: null };
  }
}
