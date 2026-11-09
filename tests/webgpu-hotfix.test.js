import test from 'node:test';
import assert from 'node:assert/strict';
import { shaderWGSL } from '../src/graphics/shaders.js';
import { WebGPURenderer } from '../src/graphics/WebGPURenderer.js';

test('WGSL normal transform does not call unsupported inverse builtin', () => {
  assert.doesNotMatch(shaderWGSL.replaceAll(/\/\/[^\n]*/g, ''), /\binverse\s*\(/);
  assert.match(shaderWGSL, /cross\(c1, c2\)/);
});

test('depth texture initializes when canvas already matches dimensions', () => {
  const previousWindow = globalThis.window;
  const previousTextureUsage = globalThis.GPUTextureUsage;
  globalThis.window = { devicePixelRatio: 1 };
  globalThis.GPUTextureUsage = { RENDER_ATTACHMENT: 16 };
  try {
    const canvas = { clientWidth: 100, clientHeight: 80, width: 100, height: 80 };
    const renderer = new WebGPURenderer(canvas);
    let created = 0;
    renderer.format = 'bgra8unorm';
    renderer.context = { configure() {} };
    renderer.device = { createTexture(desc) {
      created++;
      assert.equal(desc.format, 'depth24plus');
      return { createView() {}, destroy() {} };
    }};
    renderer.resize();
    assert.ok(renderer.depthTexture);
    renderer.resize();
    assert.equal(created, 1);
  } finally {
    if (previousWindow === undefined) delete globalThis.window;
    else globalThis.window = previousWindow;
    if (previousTextureUsage === undefined) delete globalThis.GPUTextureUsage;
    else globalThis.GPUTextureUsage = previousTextureUsage;
  }
});
