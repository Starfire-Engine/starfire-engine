<div align="center">

# ✳ Starfire Engine

**An open-source 3D graphics and asset engine for modern web browsers.**

**WebGPU · WebGL 2 · JavaScript ES modules · WGSL · GLSL ES 3.00 · Apache 2.0**

</div>

## Release status

**v0.2.0-rc.1 — release candidate.** Starfire Engine 0.2 adds a substantial rendering and asset foundation, but it is **not** a complete game engine or a stable production SDK. The RC requires cross-browser hardware validation before the final v0.2.0 release.

For the latest code, see [GitHub](https://github.com/Starfire-Engine/starfire-engine); for features and the detailed release history, see [CHANGELOG.md](CHANGELOG.md). The last publicly published version remains v0.1.0-alpha.1 until a new GitHub release is created.

### What v0.2 adds

- **Original rendering backends:** custom WebGPU/WGSL and separate WebGL 2/GLSL paths, without Three.js or Babylon.js.
- **Geometry and scene hierarchy:** flexible position/normal/UV attributes, 16- and 32-bit indices, child transforms, quaternions, visibility and UV sphere/plane primitives.
- **Textures and materials:** PNG/JPEG loading, samplers, resource reuse, a first-pass metallic-roughness PBR shading model, exposure and tone mapping.
- **Static 3D imports:** a validated subset of glTF 2.0 and binary GLB, including nested nodes, multiple primitives, embedded/external texture resources and compatible materials.
- **Lighting and shadows:** one directional shadow map with 3×3 PCF filtering plus a procedural sky/horizon/ground ambient-reflection approximation.
- **Performance foundations:** camera/shadow frustum culling, opt-in indexed GPU instancing, CPU profiling and approximate GPU resource diagnostics.
- **Demonstrations and tests:** interactive renderer comparison, original Starfire Relay GLB model, material gallery and 256-instance stress scene.

### Known limitations

- **Experimental:** WebGPU/GLSL correctness, compatibility, performance and device loss behavior require ongoing browser/driver testing; CI alone does not prove GPU compatibility.
- This is a graphics-and-assets milestone; there is **no game editor, general physics engine, complete input action system, audio system or animation mixer yet**.
- GLB/glTF importing handles a defined **static triangle-mesh subset**. Skins, skeletal animation, morph targets, sparse accessors, compression extensions, normal maps, transparent/double-sided materials and some glTF extensions are not supported.
- Shadows use one fixed-volume directional shadow map, not cascaded shadows. Environment lighting is an approximation, not HDR image-based lighting or reflection probes.
- GPU profiling reports **CPU update and submission time only**. Estimated GPU allocation sizes are not measured VRAM usage. Instancing must be opted into explicitly.
- Pre-1.0 APIs may change; consult the [versioning policy](docs/VERSIONING-AND-1.0.md).

## Requirements

- Node.js 20 or newer for local tools (Node 22 recommended).
- An up-to-date browser with WebGPU **or** WebGL 2 enabled, and a supported graphics driver.
- A local HTTP server for browser ES modules and assets. Opening `index.html` as `file://` is unsupported.

The repository has **zero third-party runtime dependencies**. The local development server is **not designed for Internet-facing production hosting**.

## Run the interactive demo

```bash
git clone https://github.com/Starfire-Engine/starfire-engine.git
cd starfire-engine
# Use development for the release candidate, once its changes are merged there:
git switch development
npm run dev
```

Open `http://localhost:5173/` in a browser, or force a graphics backend:

- WebGPU: `http://localhost:5173/?renderer=webgpu`
- WebGL 2: `http://localhost:5173/?renderer=webgl2`

The demo includes shadow/environment controls, an exposure slider, an instancing stress toggle, and a short performance snapshot. A successful visual test requires an actual browser and GPU.

## Use the engine

The source API is plain JavaScript ES modules. When served from the repository alongside `src/`:

```js
import { Engine, Scene, Entity, Mesh, PBRMaterial, createSphere } from './src/index.js';

const engine = await Engine.create({ canvas: document.querySelector('canvas') });
const scene = new Scene('Sample');
const sphere = new Entity('Sphere');
sphere.add('mesh', new Mesh(createSphere(1), new PBRMaterial({
  color: [0.8, 0.5, 0.2, 1], metallic: 0.75, roughness: 0.3
})));
scene.add(sphere);
engine.scene = scene;
engine.start();
```

Load a compatible GLB model with the same scene architecture:

```js
import { GLTFLoader } from './src/index.js';
const imported = await new GLTFLoader().load('/assets/models/starfire-relay.glb');
engine.scene = imported.scene;
```

To combine an imported model with another scene, **remove each root from the imported scene first**, then add it to the destination scene. Each entity tree can belong to only one scene.

The repository can be packed locally with `npm pack`; this is **not** a claim that `@starfire/engine` is published on npm. Package consumers need an ESM-capable build tool or browser import mapping and a compatible asset-serving setup.

## Tests and release validation

```bash
npm run ci
npm run release:check
```

`release:check` runs syntax/unit tests plus package/export/asset checks. It does not substitute for real-device testing. See [the browser validation matrix](docs/V0.2.0-BROWSER-VALIDATION.md) and [release instructions](docs/RELEASE.md).

## Source layout

```text
src/core/      Engine, Scene, Entity, Transform, Camera, profiler
src/graphics/  WebGPU and WebGL2 renderers, PBR, shadows, resources, instancing
src/geometry/  Geometry and primitives
src/assets/    Static glTF/GLB importing
src/input/     OrbitControls
demo/          Public interactive demo
assets/        Public sample textures and original GLB model
tests/         Node.js unit and integration tests
scripts/       Local dev server, source and release validation
docs/          Architecture, development milestones, release policies
```

## Roadmap, contributions and license

Our [roadmap to 1.0.0](ROADMAP.md) treats each `0.x.0` as a substantial developer-capability release. The next major goal, v0.3.0, is a **playable game runtime**, not an editor or game that already exists in this version.

Contributions are welcome; see [CONTRIBUTING.md](CONTRIBUTING.md), [GOVERNANCE.md](GOVERNANCE.md) and [SECURITY.md](SECURITY.md).

Starfire Engine is licensed under [Apache 2.0](LICENSE). Names and logos have separate trademark treatment in [TRADEMARKS.md](TRADEMARKS.md). Only the **general-purpose engine** is open source; proprietary games built with it belong in **separate private repositories** and are not included here.
