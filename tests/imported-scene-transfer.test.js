import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { Entity, GLTFLoader, Scene } from '../src/index.js';
import { collectRenderables } from '../src/graphics/RenderQueue.js';

const glb = new URL('../assets/models/starfire-relay.glb', import.meta.url);
const loader = () => new GLTFLoader({
  imageDecoder: async () => ({ width: 16, height: 16, close() {} })
});

test('PR06 preview can transfer imported GLB roots without cross-scene ownership errors', async () => {
  const loaded = await loader().parse(await readFile(glb));
  try {
    const preview = new Scene('Shadow and Environment Preview');
    preview.add(new Entity('Existing geometry'));
    const initialGLBEntityCount = loaded.scene.entities.size;
    assert.equal(initialGLBEntityCount, 8);
    assert.throws(() => preview.add(loaded.roots[0]), /different scene/);

    // Mirror the PR06 demo code. Removal releases scene ownership recursively.
    for (const root of loaded.roots) {
      assert.equal(loaded.scene.remove(root), true);
      preview.add(root);
    }
    assert.equal(loaded.scene.entities.size, 0);
    assert.equal(preview.entities.size, initialGLBEntityCount + 1);
    assert.equal(preview.query('mesh').length, 7);
    assert.equal(collectRenderables(preview).length, 7);
    for (const root of loaded.roots) {
      assert.equal(root._scene, preview);
      assert.equal(root.parent, null);
    }
    for (const entity of preview.entities.values()) {
      assert.equal(entity._scene, preview);
    }
  } finally {
    loaded.dispose();
  }
});

test('each root can be transferred independently while retaining its children', () => {
  const oldScene = new Scene('Imported');
  const first = new Entity('first');
  first.addChild(new Entity('first child'));
  const second = new Entity('second');
  second.addChild(new Entity('second child'));
  oldScene.add(first);
  oldScene.add(second);
  const newScene = new Scene('Preview');
  for (const root of [first, second]) {
    oldScene.remove(root);
    newScene.add(root);
  }
  assert.equal(oldScene.entities.size, 0);
  assert.equal(newScene.entities.size, 4);
  assert.equal(first.children.size, 1);
  assert.equal(second.children.size, 1);
});
