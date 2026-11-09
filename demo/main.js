import { Engine, Scene, Entity, Mesh, PerspectiveCamera, OrbitControls, createBox, createSphere, createPlane, TextureManager, Material, TextureSampler } from '../src/index.js';

const $ = (id) => document.getElementById(id);
const canvas = $('world');
const qs = new URLSearchParams(location.search);
const backend = ['auto', 'webgpu', 'webgl2'].includes(qs.get('renderer')) ? qs.get('renderer') : 'auto';
$('backendSelect').value = backend;
$('backendSelect').addEventListener('change', (event) => {
  const url = new URL(location.href);
  if (event.target.value === 'auto') url.searchParams.delete('renderer');
  else url.searchParams.set('renderer', event.target.value);
  location.assign(url.toString());
});

async function createScene() {
  const scene = new Scene('Starfire Engine / Technical Preview');
  const box = createBox();
  // PR 03: load an original, public test image once, then share it across meshes.
  const textures = new TextureManager();
  const gridTexture = await textures.load('/assets/textures/starfire-grid.png');
  const repeatSampler = new TextureSampler({ wrapU: 'repeat', wrapV: 'repeat' });
  const texturedBase = createPlane(2.80, 2.80);
  const uv = texturedBase.getAttribute('uv').array;
  for (let i = 0; i < uv.length; i++) uv[i] *= 2;
  texturedBase.markDirty();
  const tile = new Entity('Textured material preview').add('mesh', new Mesh(texturedBase,
    new Material({ color: [1, 1, 1, 1], baseColorTexture: gridTexture, sampler: repeatSampler })));
  tile.transform.position = [0, -0.47, 0];
  scene.add(tile);
  const cube = (name, position, scale, color, rotation = [0, 0, 0]) => {
    const entity = new Entity(name).add('mesh', new Mesh(box, { color }));
    entity.transform.position = position;
    entity.transform.scale = scale;
    entity.transform.rotation = rotation;
    scene.add(entity);
    return entity;
  };
  // Entirely generic graphics test assets; no private applications source, models, logic or data.
  cube('Foundation', [0, -1.30, 0], [12, .5, 12], [0.065, 0.105, 0.18, 1]);
  cube('Core platform', [0, -0.94, 0], [5, .23, 5], [0.11, 0.25, 0.42, 1]);
  cube('Raised plinth', [0, -0.65, 0], [2.7, .35, 2.7], [0.15, 0.33, 0.59, 1]);
  cube('Core pedestal', [0, -0.3, 0], [1.62, .3, 1.62], [0.23, 0.43, 0.72, 1]);
  const rotating = cube('Engine test object', [0, 1.52, 0], [1.5, 1.5, 1.5], [0.31, 0.73, 1, 1], [.25, .48, .16]);
  const inner = cube('Inner test geometry', [0, 1.52, 0], [.7, .7, .7], [0.74, 0.85, 1, 1], [.4, .1, .2]);
  // PR 02: demonstrate hierarchical transforms + new indexed sphere geometry.
  const orbitPivot = scene.add(new Entity('Orbit pivot'));
  orbitPivot.transform.position = [0, 1.55, 0];
  const satellite = new Entity('Hierarchy satellite').add('mesh',
    new Mesh(createSphere(.42, 28, 16),
      new Material({ color: [1, 1, 1, 1], baseColorTexture: gridTexture, sampler: repeatSampler })));
  satellite.transform.position = [2.6, .25, 0];
  orbitPivot.addChild(satellite);
  const rings = [];
  for (let i = 0; i < 12; i++) {
    const angle = 2 * Math.PI * i / 12;
    const radius = 3.9;
    cube(`Outer node ${i + 1}`, [radius * Math.cos(angle), -.75, radius * Math.sin(angle)], [.33, .24, .33], [0.09, 0.54, 0.77, 1]);
    const column = cube(`Marker ${i + 1}`, [radius * Math.cos(angle), -.30, radius * Math.sin(angle)], [.08, .70, .08], [0.15, 0.42, 0.78, 1]);
    rings.push(column);
  }
  for (let i = -5; i <= 5; i++) {
    const lineColor = i === 0 ? [0.11, .39, .63, 1] : [0.09, .20, .34, 1];
    cube(`Grid X${i}`, [i, -1.025, 0], [.018, .014, 10], lineColor);
    cube(`Grid Z${i}`, [0, -1.025, i], [10, .014, .018], lineColor);
  }
  // Distinctive architectural light pylons make shader rotation and lighting visible.
  for (const x of [-4.75, 4.75]) for (const z of [-4.75, 4.75]) {
    cube(`Pylon ${x}/${z}`, [x, -.15, z], [.28, 1.85, .28], [0.095, 0.20, 0.36, 1]);
    cube(`Beacon ${x}/${z}`, [x, .82, z], [.39, .13, .39], [.32, .78, 1, 1]);
  }
  scene.addSystem((_scene, dt, elapsed) => {
    orbitPivot.transform.rotation[1] -= dt * .34;
    rotating.transform.rotation[1] += dt * .42;
    rotating.transform.rotation[0] += dt * .11;
    inner.transform.rotation[0] -= dt * .34;
    inner.transform.rotation[2] += dt * .39;
    rotating.transform.position[1] = 1.50 + Math.sin(elapsed * 1.2) * .13;
    inner.transform.position[1] = rotating.transform.position[1];
    rings.forEach((entity, index) => {
      entity.transform.scale[1] = .70 + Math.sin(elapsed * 1.3 + index * .4) * .15;
    });
  });
  return scene;
}

async function boot() {
  try {
    const engine = await Engine.create({ canvas, renderer: backend, pixelRatioCap: 2 });
    engine.camera = new PerspectiveCamera({
      position: [10, 7, 13], target: [0, .65, 0], fov: 48, near: .1, far: 200
    });
    const controls = new OrbitControls(canvas, engine.camera, { distance: 16.5, azimuth: 0.54, elevation: 0.36 });
    const scene = await createScene();
    engine.scene = scene;
    $('renderer').textContent = engine.renderer.name.toUpperCase();
    $('engineStatus').textContent = 'All systems operational';
    engine.onStats = ({ fps, renderer, entities, drawCalls, triangles }) => {
      $('fps').textContent = fps;
      $('renderer').textContent = renderer.toUpperCase();
      $('entities').textContent = entities;
      $('drawcalls').textContent = drawCalls;
      $('triangles').textContent = triangles.toLocaleString();
    };
    engine.onError = (error) => {
      $('engineStatus').textContent = 'Rendering error';
      $('error').textContent = `Graphics error: ${error.message}. Try switching to WebGL 2 or reloading.`;
      $('error').hidden = false;
      console.error(error);
    };
    $('pauseBtn').addEventListener('click', () => {
      engine.paused = !engine.paused;
      $('pauseBtn').querySelector('span').textContent = engine.paused ? 'RESUME ANIMATION' : 'PAUSE ANIMATION';
    });
    $('resetBtn').addEventListener('click', () => controls.reset());
    window.addEventListener('pagehide', () => { controls.dispose(); engine.dispose(); }, { once: true });
    engine.start();
    // For playground diagnostics only (not part of the public engine API).
    window.__starfireDemo = { engine, controls };
  } catch (error) {
    $('engineStatus').textContent = 'Unable to initialize';
    $('error').textContent = `Unable to start Starfire Engine: ${error.message}. Try another browser or choose WebGL 2.`;
    $('error').hidden = false;
    console.error(error);
  }
}
boot();
