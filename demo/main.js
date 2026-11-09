import { Engine, Scene, Entity, Mesh, PerspectiveCamera, OrbitControls, createBox, createSphere, createPlane, TextureManager, Material, PBRMaterial, Lighting, ShadowSettings, EnvironmentLighting, TextureSampler, GLTFLoader } from '../src/index.js';

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
  const scene = new Scene('Starfire Engine / Shadow & Environment Lighting Preview');
  scene.lighting = new Lighting({ direction: [0.65,0.95,0.42], color:[1,0.96,0.88],
    intensity: 3.8, ambientColor:[0.75,0.85,1], ambientIntensity:0.23, exposure:1,
    shadows: new ShadowSettings({ enabled:true, mapSize:1024, radius:14, distance:40, near:0.5, far:100, bias:0.0025 }),
    environment: new EnvironmentLighting({ skyColor:[0.20,0.33,0.66], horizonColor:[0.56,0.60,0.76],
      groundColor:[0.05,0.07,0.12], intensity:0.8 }) });
  const box = createBox();
  // PR 03: load an original, public test image once, then share it across meshes.
  const textures = new TextureManager();
  const gridTexture = await textures.load('/assets/textures/starfire-grid.png');
  const mrTexture = await textures.load('/assets/textures/metallic-roughness-preview.png', { colorSpace:'linear' });
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
  // PR 04: material gallery. First four spheres demonstrate increasing
  // roughness; the fifth uses a packed linear G=roughness/B=metallic map.
  const materialSamples = [
    { name:'Dielectric', x:-4.3, metallic:0, roughness:0.3, color:[0.12,0.52,0.92,1] },
    { name:'Polished metal', x:-2.15, metallic:1, roughness:0.12, color:[0.87,0.55,0.24,1] },
    { name:'Brushed metal', x:0, metallic:1, roughness:0.42, color:[0.85,0.85,0.93,1] },
    { name:'Rough metal', x:2.15, metallic:1, roughness:0.86, color:[0.58,0.72,0.92,1] },
    { name:'Packed MR map', x:4.3, metallic:1, roughness:1, color:[0.93,0.63,0.32,1], metallicRoughnessTexture:mrTexture }
  ];
  for (const material of materialSamples) {
    const ball = new Entity(`PBR / ${material.name}`)
      .add('mesh', new Mesh(createSphere(.60, 36, 24), new PBRMaterial(material)));
    ball.transform.position=[material.x, .26, -4.0];
    scene.add(ball);
    const plinth = new Entity(`PBR plinth / ${material.name}`).add('mesh',
      new Mesh(createBox(), {color:[0.06,0.14,0.23,1]}));
    plinth.transform.position=[material.x, -.45, -4.0];
    plinth.transform.scale=[1.35,.18,1.35];
    scene.add(plinth);
  }
  // PR 05: import a real, original binary glTF 2.0 asset with nested nodes,
  // metallic-roughness materials and images embedded inside the GLB file.
  const relay = await new GLTFLoader().load('/assets/models/starfire-relay.glb');
  // GLTFLoader registers imported nodes in relay.scene. Explicitly detach each
  // root subtree before moving it into the larger technical preview scene.
  for (const root of relay.roots) {
    relay.scene.remove(root);
    scene.add(root);
  }
  if (relay.warnings.length) console.warn('Starfire GLB import:', ...relay.warnings);
  // The demo retains the decoded asset images for its lifetime.
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
    const exposure = $('exposure');
    const exposureValue = $('exposureValue');
    const updateExposure = () => {
      scene.lighting.exposure = Number(exposure.value);
      exposureValue.textContent = scene.lighting.exposure.toFixed(1);
    };
    exposure.addEventListener('input', updateExposure);
    updateExposure();
    const shadowToggle = $('shadowToggle');
    shadowToggle.checked = scene.lighting.shadows.enabled;
    shadowToggle.addEventListener('change', () => { scene.lighting.shadows.enabled = shadowToggle.checked; });
    const envInput = $('environmentIntensity');
    const envValue = $('environmentValue');
    const updateEnvironment = () => {
      scene.lighting.environment.intensity = Number(envInput.value);
      envValue.textContent = scene.lighting.environment.intensity.toFixed(1);
    };
    envInput.addEventListener('input', updateEnvironment);
    updateEnvironment();
    $('renderer').textContent = engine.renderer.name.toUpperCase();
    $('engineStatus').textContent = 'All systems operational • Shadows / environment / GLB';
    engine.onStats = ({ fps, renderer, entities, drawCalls, triangles }) => {
      $('fps').textContent = fps;
      $('renderer').textContent = renderer.toUpperCase();
      $('entities').textContent = entities;
      $('drawcalls').textContent = drawCalls;
      $('shadowDraws').textContent = engine.renderer.shadowDrawCalls ?? 0;
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
