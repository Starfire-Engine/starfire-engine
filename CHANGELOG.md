# Changelog

All notable public-release changes to Starfire Engine are recorded here. The v0.2.0 release is a graphics and asset **capability milestone**, not a complete game-development SDK.

## [0.2.0-rc.1] — Release candidate (2026-11-09)

### Added

- Two independent browser graphics backends: upgraded WebGPU/WGSL and WebGL 2/GLSL ES 3 pipelines.
- Attribute-based geometry, 16-/32-bit indices, new plane/sphere primitives, parent-child scene transforms and quaternions.
- Typed texture/sampler/material APIs, browser image loading, GPU texture reuse and cleanup.
- First-pass metallic-roughness PBR shading, direct directional light, emissive color, tone mapping and exposure.
- Static glTF 2.0 and GLB subset importing, nested scene nodes, material mapping, and original Starfire Relay sample model.
- Optional directional shadow mapping with PCF filtering and simple procedural environment lighting approximation.
- Conservative frustum culling, explicit instanced mesh rendering, CPU-frame timing and resource diagnostics.
- Public demo: texture and PBR material gallery, GLB object, shadow controls, 256-instance stress mode and benchmark readout.
- Regression tests for the graphics pipeline, importer, hierarchy, resource lifecycle, shaders and rendering state.

### Fixed

- Invalid WGSL `inverse()` call prevented the original WebGPU shader from compiling.
- WebGPU depth texture could remain uninitialized when the canvas already matched its display size.
- Local static server could expose project files; replaced with an explicit public file/folder allowlist.
- Customized orbit-camera reset now restores its initial state.
- Imported scene ownership transfer no longer fails when moving models between scenes in the demo.
- Improved partial renderer resource cleanup and error paths.

### Release-candidate limitations

- Full cross-browser GPU validation and PR 07 real-hardware benchmarking remain release gates for v0.2.0.
- No gameplay physics, editor, animations, audio system or packaging toolchain; these belong to future capability milestones.
- The GLB importer is intentionally static and does not support every glTF extension.
- Shadows are single-directional and fixed-volume; no cascades, HDR IBL, or reflection probes.
- CPU render submission timing is **not** measured GPU execution time, and VRAM estimates are approximate.
- Pre-1.0 API compatibility may change; consult [the versioning policy](docs/VERSIONING-AND-1.0.md).

## [0.1.0-alpha.1] — 2026-11-08

### Added

- Original experimental WebGPU renderer, with separate WebGL 2 fallback.
- Basic scene/entity/component storage, math, transforms and perspective camera controls.
- Indexed box geometry, directional diffuse/specular lighting and interactive browser demo.
- Open-source licensing, documentation, local development server and Node.js tests/CI.

### Known limitations

- Experimental first rendering prototype; lacked the asset, material and performance capabilities introduced in v0.2.0.
