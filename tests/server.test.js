import test from 'node:test';
import assert from 'node:assert/strict';
import { tmpdir } from 'node:os';
import { mkdtemp, mkdir, writeFile, symlink, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { once } from 'node:events';
import { createStaticServer } from '../scripts/static-server.mjs';

async function withServer(check) {
  const root = await mkdtemp(join(tmpdir(), 'starfire-static-'));
  const server = createStaticServer({ root });
  try {
    await mkdir(join(root, 'demo'));
    await mkdir(join(root, 'src'));
    await writeFile(join(root, 'index.html'), '<h1>Starfire</h1>');
    await writeFile(join(root, 'demo', 'main.js'), 'export const demo = true;');
    await writeFile(join(root, 'src', 'index.js'), 'export const engine = true;');
    await writeFile(join(root, '.env'), 'SECRET_DO_NOT_SERVE');
    await writeFile(join(root, 'demo', '.hidden.js'), 'HIDDEN_DO_NOT_SERVE');
    await writeFile(join(root, 'private.js'), 'PRIVATE_DO_NOT_SERVE');
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const url = `http://127.0.0.1:${server.address().port}`;
    await check({ url, root });
  } finally {
    await new Promise((resolve, reject) => server.close((err) => err ? reject(err) : resolve()));
    await rm(root, { recursive: true, force: true });
  }
}

test('serves index and public engine/demo assets', async () => {
  await withServer(async ({ url }) => {
    const index = await fetch(url);
    assert.equal(index.status, 200);
    assert.match(await index.text(), /Starfire/);
    const js = await fetch(`${url}/src/index.js`);
    assert.equal(js.status, 200);
    assert.match(js.headers.get('content-type'), /javascript/);
    const head = await fetch(`${url}/demo/main.js`, { method: 'HEAD' });
    assert.equal(head.status, 200);
    assert.equal(await head.text(), '');
  });
});

test('never serves dotfiles, private paths or traversal attempts', async () => {
  await withServer(async ({ url }) => {
    for (const path of ['/.env', '/private.js', '/demo/.hidden.js', '/src/../.env', '/demo/%2e%2e/.env', '/.git/config', '/tests/scene.test.js', '/node_modules/x.js']) {
      const response = await fetch(`${url}${path}`);
      const body = await response.text();
      assert.notEqual(response.status, 200, `${path} should be forbidden`);
      assert.doesNotMatch(body, /SECRET_DO_NOT_SERVE|PRIVATE_DO_NOT_SERVE|HIDDEN_DO_NOT_SERVE/);
    }
    assert.equal((await fetch(`${url}/src/index.js`, { method: 'POST' })).status, 405);
  });
});

test('rejects symlinks that resolve outside the public folders', async (t) => {
  await withServer(async ({ url, root }) => {
    try {
      await symlink(join(root, '.env'), join(root, 'src', 'leaked.js'), 'file');
    } catch (error) {
      if (['EPERM', 'EACCES', 'ENOSYS'].includes(error.code)) { t.diagnostic('Symlinks unavailable; skipping symlink case'); return; }
      throw error;
    }
    const res = await fetch(`${url}/src/leaked.js`);
    assert.notEqual(res.status, 200);
    assert.doesNotMatch(await res.text(), /SECRET_DO_NOT_SERVE/);
  });
});
