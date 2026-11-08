import test from 'node:test';
import assert from 'node:assert/strict';
import { Engine } from '../src/core/Engine.js';
import { PerspectiveCamera } from '../src/core/Camera.js';

const fakeCanvas = { getContext() {} };

test('Engine requires a canvas and a recognized backend', async () => {
  await assert.rejects(Engine.create(), TypeError);
  await assert.rejects(Engine.create({ canvas: {} }), TypeError);
  await assert.rejects(Engine.create({ canvas: fakeCanvas, renderer: 'fictional' }), RangeError);
  await assert.rejects(Engine.create({ canvas: fakeCanvas, pixelRatioCap: 5 }), RangeError);
});

test('PerspectiveCamera creates projection view matrices for both depth conventions', () => {
  const camera = new PerspectiveCamera();
  assert.equal(camera.matrix(16 / 9, 'webgpu').length, 16);
  assert.equal(camera.matrix(16 / 9, 'webgl').length, 16);
});
