import test from 'node:test';
import assert from 'node:assert/strict';
import { OrbitControls } from '../src/input/OrbitControls.js';

test('reset restores user-provided initial camera controls', () => {
  const callbacks = new Map();
  const canvas = {
    style: {},
    addEventListener(type, cb) { callbacks.set(type, cb); },
    removeEventListener(type) { callbacks.delete(type); },
    setPointerCapture() {}
  };
  const camera = { position: [], target: [0, 0, 0] };
  const home = { distance: 22, azimuth: 1.2, elevation: 0.4 };
  const orbit = new OrbitControls(canvas, camera, home);
  const first = [...camera.position];
  callbacks.get('wheel')({ deltaY: 120, preventDefault() {} });
  assert.notDeepEqual(camera.position, first);
  orbit.reset();
  assert.deepEqual(camera.position, first);
  assert.equal(orbit.distance, home.distance);
  assert.equal(orbit.azimuth, home.azimuth);
  assert.equal(orbit.elevation, home.elevation);
  orbit.dispose();
  assert.equal(callbacks.size, 0);
});
