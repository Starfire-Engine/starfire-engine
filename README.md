<div align="center">

# ✳ Starfire Engine

**An experimental, open-source 3D engine built for the web.**

[![CI](https://img.shields.io/badge/status-pre--alpha-4f9eff)](#project-status)
[![License](https://img.shields.io/badge/license-Apache--2.0-65c7a5)](LICENSE)
[![Zero runtime dependencies](https://img.shields.io/badge/runtime_dependencies-0-blue)](#requirements)

**WebGPU · WebGL 2 fallback · JavaScript ES modules · WGSL · GLSL ES 3.00**

</div>

## Project status

**`v0.1.0-alpha.1` — Experimental pre-alpha.** This is a small but functional first engine release, **not** a complete game engine, a stable SDK, or a production-ready renderer.

The browser demo runs an original 3D scene through **our own rendering code**, without Three.js or Babylon.js. It attempts WebGPU first and falls back to WebGL 2 when WebGPU cannot initialize.

### In this release

- Custom WebGPU renderer with WGSL shaders and GPU-buffered meshes.
- Independent WebGL 2 fallback renderer with GLSL shaders.
- Depth testing, indexed geometry, directional diffuse/specular lighting.
- Scene, entity/component storage, transforms, perspective camera.
- Orbit/pinch/scroll controls and an animated demonstration scene.
- Live FPS, draw-call, triangle, and entity counters.
- Basic math/scene unit tests, CI, and a zero-dependency local dev server.

### Development preview: PR 06 lighting and shadows

The `development` branch adds opt-in directional shadow mapping with 3×3 percentage-closer filtering on WebGPU and WebGL 2, plus a configurable procedural sky/horizon/ground reflection approximation for PBR materials.

```js
import { Lighting, ShadowSettings, EnvironmentLighting } from './src/index.js';
scene.lighting = new Lighting({
  shadows: new ShadowSettings({ enabled: true, mapSize: 1024, radius: 14, bias: 0.0025 }),
  environment: new EnvironmentLighting({ intensity: 0.8 })
});
```

This is **not** HDR image-based lighting, physically accurate prefiltered reflection probes, cascaded shadows, or a general multiple-light system. Shadow coverage is a fixed orthographic world-space region centered on `shadows.center`. Increase `radius` for larger scenes (at a cost to shadow detail), or disable shadows to avoid the extra draw pass. Shadow-map sizes: 256, 512, 1024, 2048.

### Not yet implemented

The published v0.1.0 tag does not include PBR materials, textures or glTF loading. Shadows, animation mixer, audio, general rigid-body physics, scripting, scene editor, authoring tools, multiplayer and production benchmarks remain future work. See [ROADMAP.md](ROADMAP.md).

## Requirements

- **Node.js 20 or newer** (Node 22 LTS recommended).
- A current browser with **WebGPU or WebGL 2** and working graphics drivers.
- A local development server (included); direct `file://` access is not supported by ES module loading.

No `npm install` is required: this pre-alpha intentionally uses **zero third-party runtime or build dependencies**.

## Quick start

```bash
git clone https://github.com/Starfire-Engine/starfire-engine.git
cd starfire-engine
npm run dev
```

Then open **http://localhost:5173**.

To run checks:

```bash
npm run ci
```

To force the WebGL 2 backend use `http://localhost:5173/?renderer=webgl2`.

## Library usage

The engine is importable through native browser ES modules. For example, from a page served alongside the repository:

```js
import { Engine, Scene, Entity, Mesh, createBox } from './src/index.js';

const engine = await Engine.create({ canvas: document.querySelector('canvas') });
const scene = new Scene('My scene');
const cube = new Entity('Cube');
cube.add('mesh', new Mesh(createBox(), { color: [0.2, 0.7, 1, 1] }));
scene.add(cube);
engine.scene = scene;
engine.start();
```

Use `engine.stop()` and `engine.dispose()` when the app no longer needs the renderer.

## Repository map

```text
src/
  core/       Engine, Scene, Entity, Transform, Camera
  graphics/   Mesh, WebGPURenderer, WebGLRenderer, shaders
  math/       Mat4, Vec3
  geometry/   Geometric primitives
  assets/     Static glTF 2.0 and GLB import
  input/      OrbitControls
demo/         Interactive renderer demonstration
scripts/      Dependency-free dev server and checks
tests/        Node built-in test runner
docs/         Architecture and release instructions
```

## Why an original renderer?

Starfire Engine intentionally implements both low-level backends against browser graphics APIs. We use browser GPU APIs, not third-party 3D scene engines. The first architecture focuses on a transparent, testable renderer before moving to performance, asset systems and higher visual fidelity.

This is **a general-purpose open-source engine only**. Proprietary games built with it—including commercial projects—live in **separate private repositories**. No private application source, assets, gameplay logic, or development tools are included here.

## Development branch (v0.2.0 work in progress)

The `development` branch adds flexible indexed geometry, nested scene transforms, texture loading and material samplers, and a **first-pass metallic-roughness PBR preview** (PR 04). This is in-progress pre-alpha work; the published `v0.1.0-alpha.1` tag remains unchanged.

PR 04 introduces `PBRMaterial` and scene-level `Lighting` and renders a live material gallery on WebGPU and WebGL 2. It uses a GGX direct-light BRDF, optional base-color and packed metallic-roughness textures, linear-light shading, tone mapping, and exposure control. It **does not** yet support image-based reflections, shadows, transparent objects, or normal maps. PR 05 adds a limited static glTF/GLB importer. Legacy plain-color and `Material` objects retain their previous shading path.

See [PR 04 development notes](docs/V0.2.0-PR04-PBR.md) for example imports, supported material properties, limitations, and hardware testing steps.


The `development` branch is where new, unreleased features are prepared. PR 02 adds:

- An attribute-based `Geometry` API with positions, normals, UVs, and preserved custom attributes.
- 16-bit and 32-bit triangle indices, plus new plane/sphere primitives.
- Parent/child entities, visibility inheritance, and quaternion-compatible transforms.
- Shared geometry resource caching with automatic disposal when geometry stops being visible.
- A shared render submission step for WebGPU and WebGL 2.
- PR 03: browser image/byte-array textures, optional per-material base-color map, configurable samplers, texture caching/cleanup, and a textured public demo.

The original `createBox()` typed-array geometry remains supported. This branch is not a
new release: `package.json` retains the existing published version until tagging.
The current development branch includes PR 04 PBR and PR 05 static glTF/GLB importing. Advanced shadows and full glTF compliance are not implemented yet.

See [PR 02 implementation notes](docs/V0.2.0-PR02-RENDERING-GEOMETRY.md) and [PR 03 textures and materials](docs/V0.2.0-PR03-TEXTURES-MATERIALS.md).

## Texture preview (development branch)

`npm run dev` serves an original textured material demonstration in both WebGPU and WebGL 2. The demo loads an image from `/assets/textures/starfire-grid.png` and shares it between a sphere and a plane.

```js
import { TextureManager, TextureSampler, Material, Mesh, createSphere } from './src/index.js';

const texture = await new TextureManager().load('/assets/textures/starfire-grid.png');
const material = new Material({
  color: [1, 1, 1, 1],
  baseColorTexture: texture,
  sampler: new TextureSampler({ wrapU: 'repeat', wrapV: 'repeat' })
});
const mesh = new Mesh(createSphere(), material);
```

Texture support remains non-PBR (base color × texture, directional lighting); no mipmaps, alpha blending, compressed textures, or glTF support yet. The older `{ color: [...] }` material format remains valid.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md), [GOVERNANCE.md](GOVERNANCE.md), and [SECURITY.md](SECURITY.md). Contributors are asked to sign off their commits under the DCO.

## License

Copyright © 2026 Starfire Engine contributors.

Source code is licensed under [Apache License, Version 2.0](LICENSE). Project names/logos are handled separately; see [TRADEMARKS.md](TRADEMARKS.md).

## PR 05 — Import Blender-style 3D models (development branch)

Static glTF 2.0 / GLB files containing standard triangular meshes, scene hierarchy, and metallic-roughness materials can now be loaded by `GLTFLoader`. The default demo imports the original public `assets/models/starfire-relay.glb` model. JSON glTF with external `.bin` resources is also supported.

```js
import { GLTFLoader } from './src/index.js';
const imported = await new GLTFLoader().load('/assets/models/starfire-relay.glb');
engine.scene = imported.scene;
```

This is a deliberately limited **static** importer: animations, skins, sparse accessors, double-sided/transparent surfaces, normal maps and compressed extensions are not supported. Unsupported features fail with explanatory errors. See [PR 05 documentation](docs/V0.2.0-PR05-GLTF-ASSETS.md).


## 0.2.0 development — PR 07 performance foundation

PR 07 adds conservative main/shadow frustum culling, an explicit `InstancedMesh` API,
CPU-only frame timing, renderer resource estimates, and a performance benchmark demo.
The version 0.2.0 graphics and asset train is still **experimental** until real
WebGPU and WebGL 2 hardware testing passes. `gpuMs` is `null` by design.

See [PR 07 design and test notes](docs/V0.2.0-PR07-PERFORMANCE.md) and the
[versioning and v1.0.0 policy](docs/VERSIONING-AND-1.0.md).

A `0.x.0` milestone is a substantial developer capability release. Follow-up fixes,
limited features and hardening belong in `0.x.y`. Starfire Engine `1.0.0` will not
ship until developers can create, edit, test, package and release a complete game
using the publicly available engine runtime and editor/toolchain.
