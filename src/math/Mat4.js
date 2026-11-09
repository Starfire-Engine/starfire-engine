/** Column-major 4x4 matrices, with right-handed world coordinates. */
export const Mat4 = {
  identity() {
    return new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
  },
  multiply(a, b) {
    const out = new Float32Array(16);
    for (let column = 0; column < 4; column++) {
      for (let row = 0; row < 4; row++) {
        out[column * 4 + row] =
          a[row] * b[column * 4] +
          a[4 + row] * b[column * 4 + 1] +
          a[8 + row] * b[column * 4 + 2] +
          a[12 + row] * b[column * 4 + 3];
      }
    }
    return out;
  },
  perspective(fovRadians, aspect, near, far, depthMode = 'webgpu') {
    if (!(aspect > 0 && near > 0 && far > near)) throw new RangeError('Invalid perspective dimensions');
    const f = 1 / Math.tan(fovRadians / 2);
    const out = new Float32Array(16);
    out[0] = f / aspect;
    out[5] = f;
    out[11] = -1;
    if (depthMode === 'webgpu') {
      out[10] = far / (near - far);
      out[14] = (far * near) / (near - far);
    } else if (depthMode === 'webgl') {
      out[10] = (far + near) / (near - far);
      out[14] = (2 * far * near) / (near - far);
    } else {
      throw new TypeError(`Unknown depth convention: ${depthMode}`);
    }
    return out;
  },
  lookAt(eye, target, up = [0, 1, 0]) {
    const unit = (v) => {
      const n = Math.hypot(...v);
      if (n < 1e-8) throw new RangeError('Degenerate lookAt direction');
      return v.map((value) => value / n);
    };
    const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
    const z = unit(eye.map((value, i) => value - target[i]));
    const x = unit(cross(up, z));
    const y = cross(z, x);
    return new Float32Array([
      x[0], y[0], z[0], 0,
      x[1], y[1], z[1], 0,
      x[2], y[2], z[2], 0,
      -x.reduce((s, v, i) => s + v * eye[i], 0),
      -y.reduce((s, v, i) => s + v * eye[i], 0),
      -z.reduce((s, v, i) => s + v * eye[i], 0), 1
    ]);
  },
  /** Position, rotation in XYZ Euler radians, and nonuniform scale. */
  compose(position = [0, 0, 0], rotation = [0, 0, 0], scale = [1, 1, 1]) {
    const [x, y, z] = rotation;
    const [cx, cy, cz] = [Math.cos(x), Math.cos(y), Math.cos(z)];
    const [sx, sy, sz] = [Math.sin(x), Math.sin(y), Math.sin(z)];
    // Rz * Ry * Rx (column-major); positions are in world units.
    return new Float32Array([
      cz * cy * scale[0], sz * cy * scale[0], -sy * scale[0], 0,
      (cz * sy * sx - sz * cx) * scale[1], (sz * sy * sx + cz * cx) * scale[1], cy * sx * scale[1], 0,
      (cz * sy * cx + sz * sx) * scale[2], (sz * sy * cx - cz * sx) * scale[2], cy * cx * scale[2], 0,
      position[0], position[1], position[2], 1
    ]);
  },
  /** Quaternion composition for glTF-compatible scene hierarchy (xyzw). */
  composeQuaternion(position = [0, 0, 0], quaternion = [0, 0, 0, 1], scale = [1, 1, 1]) {
    if (quaternion.length !== 4 || !quaternion.every(Number.isFinite)) throw new TypeError('Quaternion must contain four finite components');
    const length = Math.hypot(...quaternion);
    if (!(length > 1e-10)) throw new RangeError('Quaternion cannot be zero');
    const [x, y, z, w] = quaternion.map(v => v / length);
    const xx = x*x, yy = y*y, zz = z*z;
    const xy = x*y, xz = x*z, yz = y*z, xw = x*w, yw = y*w, zw = z*w;
    return new Float32Array([
      (1 - 2*(yy + zz))*scale[0], 2*(xy + zw)*scale[0], 2*(xz - yw)*scale[0], 0,
      2*(xy - zw)*scale[1], (1 - 2*(xx + zz))*scale[1], 2*(yz + xw)*scale[1], 0,
      2*(xz + yw)*scale[2], 2*(yz - xw)*scale[2], (1 - 2*(xx + yy))*scale[2], 0,
      position[0], position[1], position[2], 1
    ]);
  },
  transformPoint(m, p) {
    const w = m[3] * p[0] + m[7] * p[1] + m[11] * p[2] + m[15];
    return [
      (m[0] * p[0] + m[4] * p[1] + m[8] * p[2] + m[12]) / w,
      (m[1] * p[0] + m[5] * p[1] + m[9] * p[2] + m[13]) / w,
      (m[2] * p[0] + m[6] * p[1] + m[10] * p[2] + m[14]) / w
    ];
  }
};
