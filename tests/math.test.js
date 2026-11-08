import test from 'node:test';
import assert from 'node:assert/strict';
import { Vec3, Mat4 } from '../src/math/index.js';

const close = (a, b, epsilon = 1e-5) => assert.ok(Math.abs(a - b) < epsilon, `${a} ≉ ${b}`);

test('Vec3 operations are consistent', () => {
  assert.deepEqual(Vec3.add([1, 2, 3], [4, 5, 6]), [5, 7, 9]);
  assert.deepEqual(Vec3.cross([1, 0, 0], [0, 1, 0]), [0, 0, 1]);
  assert.deepEqual(Vec3.normalize([0, 0, 0]), [0, 0, 0]);
  close(Vec3.length(Vec3.normalize([3, 4, 0])), 1);
});

test('Mat4 identity and composition transform points', () => {
  const identity = Mat4.identity();
  const translated = Mat4.compose([3, 2, -4]);
  assert.deepEqual(Mat4.transformPoint(identity, [2, -1, 0]), [2, -1, 0]);
  assert.deepEqual(Mat4.transformPoint(translated, [2, -1, 0]), [5, 1, -4]);
  [...Mat4.multiply(identity, translated)].forEach((n, i) => close(n, translated[i]));
});

test('Mat4 rotation around the Y axis', () => {
  const rotated = Mat4.compose([0, 0, 0], [0, Math.PI / 2, 0]);
  const point = Mat4.transformPoint(rotated, [1, 0, 0]);
  close(point[0], 0);
  close(point[2], -1);
});

test('Projection conventions differ as expected', () => {
  const near = 0.1, far = 100;
  const webgpu = Mat4.perspective(Math.PI / 3, 1.5, near, far, 'webgpu');
  const webgl = Mat4.perspective(Math.PI / 3, 1.5, near, far, 'webgl');
  close((webgpu[10] * -near + webgpu[14]) / near, 0);
  close((webgl[10] * -near + webgl[14]) / near, -1);
  close((webgpu[10] * -far + webgpu[14]) / far, 1);
  close((webgl[10] * -far + webgl[14]) / far, 1);
});

test('Camera lookAt places its eye at the origin', () => {
  const camera = Mat4.lookAt([3, 5, 7], [0, 0, 0]);
  const point = Mat4.transformPoint(camera, [3, 5, 7]);
  point.forEach((n) => close(n, 0));
});

test('Perspective rejects invalid arguments', () => {
  assert.throws(() => Mat4.perspective(1, 0, .1, 10), RangeError);
  assert.throws(() => Mat4.perspective(1, 1, 10, 10), RangeError);
  assert.throws(() => Mat4.perspective(1, 1, .1, 10, 'unknown'), TypeError);
});
