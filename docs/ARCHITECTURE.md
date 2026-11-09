# Architecture

## Design goals

- General-purpose engine; domain-specific games live in separate private or public projects.
- Browser-native, dependency-free first runtime.
- Renderer backends implement the same interface: `initialize`, `resize`, `render`, `dispose`.
- Engine updates scenes with a time delta and displays via `requestAnimationFrame`.
- Scene manages entities; entities contain `Transform` and optional components.
- Application scenes define their own behavior and own art assets.

## Modules

| Module | Responsibility |
|---|---|
| `math/` | Vectors, matrices, camera geometry |
| `core/` | Engine lifecycle, entities, scenes, transforms |
| `geometry/` | Reusable mesh data |
| `graphics/` | Backends, GPU resources, materials |
| `input/` | Pointer controls |
| `demo/` | Public, generic engine playground |

## Renderer backend

WebGPU uses WGSL and uniform buffers. WebGL 2 uses GLSL ES 300, VAOs, and classic uniforms. Both draw the same `Mesh`/`Material` components; the demo works without WebGPU.

The experimental lighting is simple directional diffuse + specular with ambient contribution. It is not a physically based renderer yet.

## Boundary with proprietary applications

This repository **must not** contain any private application code, data, configurations, assets, scenarios, diagrams or backend tools. Games use the public general-purpose interfaces as dependencies.

## v0.2.0 development: scene and geometry contracts

- `Geometry` holds named attributes (at least `POSITION`) and triangle indices; WebGPU and WebGL 2 pack `POSITION`/`NORMAL`/`TEXCOORD_0` into an eight-float vertex layout. Other attributes are retained for future rendering features.
- `Geometry.markDirty()` invalidates cached GPU geometry after deliberate CPU-side mutations. Legacy interleaved `{vertices, indices}` values continue to work, but should be treated as immutable after upload.
- Parent/child `Entity` objects compose local transforms into world transforms; quaternion rotation (xyzw) overrides Euler rotation when supplied.
- `Scene.add(parent)` indexes the descendant hierarchy. `Scene.remove(parent)` removes the entire subtree. Children can be added after registration.
- `collectRenderables(scene)` forms a shared visible-mesh render queue. A hidden ancestor hides its descendants.
- Each renderer uses `GeometryResourceCache` to reuse GPU buffers across meshes sharing geometry. Stale resources are released during the next render and at renderer disposal.
- PR 02 does not introduce a complete ECS, render-graph, material pipeline, scene serialization, GLB loader, or physics engine.

## v0.2.0 development: texture/material contract (PR 03)

`Texture2D` describes a CPU-side RGBA8 array or decoded browser image with `srgb`/`linear` color space and dirty version. `TextureManager` deduplicates URL fetch+decode (separate from per-renderer GPU allocation). `Material` supplies a color tint, optional baseColorTexture and immutable `TextureSampler` descriptor; legacy color objects remain valid.

Both renderers own independent `TextureResourceCache` instances. Textures shared by meshes are uploaded once per device/version; unused uploads are destroyed on render and on renderer.dispose(). WebGPU uses sampled-texture and sampler bind group 1, WebGL 2 uses texture unit 0 and WebGLSampler. A white 1×1 texture preserves legacy untextured materials.

PR 03 adds one base-color image and sampler per mesh, not glTF, PBR, normal maps, alpha blending or mipmaps. Shader sources remain independent (WGSL and GLSL), sharing the material/geometry semantics. Run the manual backend parity checks described in `docs/V0.2.0-PR03-TEXTURES-MATERIALS.md` before merging.
