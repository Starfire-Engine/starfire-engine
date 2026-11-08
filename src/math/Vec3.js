/** Minimal, allocation-light vector operations. */
export const Vec3 = {
  create(x = 0, y = 0, z = 0) { return [x, y, z]; },
  add(a, b) { return [a[0] + b[0], a[1] + b[1], a[2] + b[2]]; },
  subtract(a, b) { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; },
  scale(v, s) { return [v[0] * s, v[1] * s, v[2] * s]; },
  dot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; },
  cross(a, b) {
    return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  },
  length(v) { return Math.hypot(v[0], v[1], v[2]); },
  normalize(v) {
    const n = Math.hypot(v[0], v[1], v[2]);
    return n > 1e-10 ? [v[0] / n, v[1] / n, v[2] / n] : [0, 0, 0];
  }
};
