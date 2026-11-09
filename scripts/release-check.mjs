import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = resolve(fileURLToPath(new URL('../', import.meta.url)));
const file = async (name) => readFile(join(root, name));
const pkg = JSON.parse((await file('package.json')).toString('utf8'));
assert.match(pkg.version, /^0\.2\.0(?:-(?:alpha|beta|rc)\.\d+)?$/, 'Incorrect v0.2.0 release version');
assert.equal(pkg.name, '@starfire/engine');
assert.equal(pkg.license, 'Apache-2.0');
assert.deepEqual(pkg.files, ['src/', 'LICENSE', 'NOTICE', 'README.md']);
const tag = process.env.GITHUB_REF_TYPE === 'tag' ? process.env.GITHUB_REF_NAME : null;
if (tag) assert.equal(tag, `v${pkg.version}`, 'Tag must match package.json version');

for (const f of ['LICENSE','NOTICE','README.md','CHANGELOG.md','ROADMAP.md','docs/RELEASE.md',
  'docs/V0.2.0-BROWSER-VALIDATION.md','docs/V0.2.0-RELEASE-NOTES.md', 'index.html',
  'assets/models/starfire-relay.glb', 'assets/textures/starfire-grid.png',
  'assets/textures/metallic-roughness-preview.png', 'src/index.js']) {
  assert.ok((await stat(join(root, f))).isFile(), `Missing required release file: ${f}`);
}
const html = (await file('index.html')).toString('utf8');
assert.ok(html.includes(pkg.version), 'Demo version label must match package version');
const readme = (await file('README.md')).toString('utf8');
assert.ok(readme.includes(pkg.version), 'README release status must match version');
const glb = await file('assets/models/starfire-relay.glb');
assert.equal(glb.subarray(0,4).toString('ascii'), 'glTF', 'Invalid GLB fixture');
assert.equal(glb.readUInt32LE(4), 2, 'Expected GLB v2 fixture');
assert.equal(glb.readUInt32LE(8), glb.length, 'GLB fixture length mismatch');
const pngSig = Buffer.from([137,80,78,71,13,10,26,10]);
for (const asset of ['assets/textures/starfire-grid.png','assets/textures/metallic-roughness-preview.png']) {
  assert.ok((await file(asset)).subarray(0,8).equals(pngSig), `Invalid PNG fixture: ${asset}`);
}
const api = await import('../src/index.js');
for (const key of ['Engine','Scene','Mesh','Geometry','GLTFLoader','PBRMaterial',
  'TextureManager','ShadowSettings','InstancedMesh','FrameProfiler']) {
  assert.equal(typeof api[key], 'function', `Missing public API export: ${key}`);
}

const npmCli = process.env.npm_execpath;
if (!npmCli) throw new Error('Run release validation with npm run release:check');
const run = spawnSync(process.execPath, [npmCli, 'pack','--dry-run','--json','--ignore-scripts'], {
  cwd:root, encoding:'utf8', env:process.env, maxBuffer:8*1024*1024
});
if (run.status !== 0) throw new Error(`npm pack failed: ${run.stderr || run.stdout}`);
const pack = JSON.parse(run.stdout)[0];
assert.equal(pack.name, pkg.name);
assert.equal(pack.version, pkg.version);
const contents = new Set(pack.files.map(f=>f.path));
for (const f of ['src/index.js','src/graphics/WebGPURenderer.js','src/graphics/WebGLRenderer.js','src/assets/GLTFLoader.js','LICENSE','NOTICE','README.md']) {
  assert.ok(contents.has(f), `Missing npm package file: ${f}`);
}
for (const f of contents) {
  assert.ok(!f.startsWith('tests/') && !f.startsWith('assets/') && !f.startsWith('demo/') &&
    !f.startsWith('.github/') && !f.startsWith('scripts/') && !f.startsWith('docs/') &&
    !f.startsWith('APPLY-'), `Unexpected development-only file in npm package: ${f}`);
}
console.log(`Release audit passed: ${pkg.name}@${pkg.version}; ${contents.size} npm package files; GLB and PNG fixtures valid.`);
