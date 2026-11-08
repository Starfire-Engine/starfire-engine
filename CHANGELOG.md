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
