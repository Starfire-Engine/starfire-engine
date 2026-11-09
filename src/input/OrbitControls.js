/** Pointer-based orbit camera with drag, wheel and pinch zoom. */
export class OrbitControls {
  constructor(canvas, camera, { distance = 15, azimuth = 0.65, elevation = 0.38 } = {}) {
    this.canvas = canvas;
    this.camera = camera;
    this.distance = distance;
    this.azimuth = azimuth;
    this.elevation = elevation;
    this.home = { distance, azimuth, elevation };
    this.pointers = new Map();
    this.onPointerDown = (event) => {
      this.pointers.set(event.pointerId, [event.clientX, event.clientY]);
      canvas.setPointerCapture(event.pointerId);
    };
    this.onPointerMove = (event) => {
      if (!this.pointers.has(event.pointerId)) return;
      const previous = this.pointers.get(event.pointerId);
      const current = [event.clientX, event.clientY];
      if (this.pointers.size === 1) {
        this.azimuth -= (current[0] - previous[0]) * 0.005;
        this.elevation = Math.max(-1.35, Math.min(1.35, this.elevation + (current[1] - previous[1]) * 0.005));
      } else if (this.pointers.size === 2) {
        const other = [...this.pointers.entries()].find(([id]) => id !== event.pointerId)?.[1];
        if (other) {
          const before = Math.hypot(previous[0] - other[0], previous[1] - other[1]);
          const after = Math.hypot(current[0] - other[0], current[1] - other[1]);
          this.distance = Math.max(4, Math.min(38, this.distance * (before / Math.max(1, after))));
        }
      }
      this.pointers.set(event.pointerId, current);
      this.update();
    };
    this.onPointerUp = (event) => this.pointers.delete(event.pointerId);
    this.onWheel = (event) => {
      event.preventDefault();
      this.distance = Math.min(38, Math.max(4, this.distance * Math.exp(event.deltaY * 0.001)));
      this.update();
    };
    canvas.style.touchAction = 'none';
    canvas.addEventListener('pointerdown', this.onPointerDown);
    canvas.addEventListener('pointermove', this.onPointerMove);
    canvas.addEventListener('pointerup', this.onPointerUp);
    canvas.addEventListener('pointercancel', this.onPointerUp);
    canvas.addEventListener('wheel', this.onWheel, { passive: false });
    this.update();
  }
  update() {
    const a = this.azimuth; const e = this.elevation; const d = this.distance;
    this.camera.position = [
      this.camera.target[0] + d * Math.cos(e) * Math.sin(a),
      this.camera.target[1] + d * Math.sin(e),
      this.camera.target[2] + d * Math.cos(e) * Math.cos(a)
    ];
  }
  reset() {
    this.distance = this.home.distance;
    this.azimuth = this.home.azimuth;
    this.elevation = this.home.elevation;
    this.update();
  }
  dispose() {
    this.canvas.removeEventListener('pointerdown', this.onPointerDown);
    this.canvas.removeEventListener('pointermove', this.onPointerMove);
    this.canvas.removeEventListener('pointerup', this.onPointerUp);
    this.canvas.removeEventListener('pointercancel', this.onPointerUp);
    this.canvas.removeEventListener('wheel', this.onWheel);
    this.pointers.clear();
  }
}
