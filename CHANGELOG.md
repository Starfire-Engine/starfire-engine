## Unreleased — v0.2.0 development / PR 02–03

- Introduce attribute-based geometry supporting positions, normals, UVs and extra named attributes.
- Add support for Uint32 indices in both WebGPU and WebGL 2 renderers.
- Add parent/child scene hierarchy and quaternion transforms.
- Share render collection and release unreferenced GPU geometry allocations automatically.
- Add UV sphere and plane geometry, test coverage and a hierarchy demo.
- Retain compatibility with the v0.1.x interleaved geometry representation.

- Add PR 03 texture/sampler/material APIs, browser image loading, GPU texture reuse, and textured demo support on WebGPU and WebGL 2.

# Changelog

## [0.1.0-alpha.1] - 2026-11-08

### Added
- Starfire Engine runtime and entity/component scene graph.
- Custom WebGPU renderer using WGSL, with WebGL 2 fallback using GLSL ES 3.00.
- Camera, orbit controls, basic lit geometry and reusable material data.
- Dependency-free, browser-based interactive playground.
- Node-based local static server, automated tests, project documentation, and CI.

### Known limitations
- Experimental renderer: basic Lambert/specular illumination, not PBR or photorealistic yet.
- No asset import pipeline, editor, physics, networking, animation mixer, or audio yet.
- Browser capability requirements apply; WebGPU and WebGL 2 availability vary.
