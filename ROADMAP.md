# Starfire Engine — Capability Roadmap to 1.0.0

Starfire Engine is a **free, Apache-2.0-licensed, general-purpose game engine for the web**.
The open-source engine is independent from any proprietary game made with it.

## Versioning contract

We do **not** advance to `0.x.0` for a handful of fixes or a small feature.

- `0.x.0`: major capability release with a substantial integrated developer workflow.
- `0.x.y` (where `y > 0`): fixes, refinements, compatibility updates, and limited features.
- `0.x.y-alpha.N` / beta / rc: explicitly experimental prereleases.
- Each `0.x.0` release must demonstrate a major before/after difference with tests, a sample project, documented APIs and a supported upgrade path.
- Major capabilities may ship across multiple reviewable PRs before the version is released. A PR is **not** a release.

A stable 1.0 means creators can **author, debug, package and ship a complete playable game** without needing an unrelated engine, editor or undocumented internal-only tools. See [the release gates](docs/VERSIONING-AND-1.0.md).

## Large capability releases

| Version | Required leap | Concrete demonstration |
|:---|:---|:---|
| **0.1.x** | Engine proof of concept | Original JS renderer, scene runtime, basic tests |
| **0.2.0** | **Rendering and asset foundation** | Real GLB model, PBR materials, lighting/shadows, hierarchy, texture pipeline, culling/instancing, diagnostics |
| **0.3.0** | **Playable game runtime** | Deterministic/fixed-step simulation, input actions, collisions, initial rigid-body physics, audio, character animation, example interactive game loop |
| **0.4.0** | **Visual editor foundation** | Project creation, scene hierarchy and viewport tools, property inspector, gizmos, undo/redo, save/reload scene |
| **0.5.0** | **Content-production workflow** | Asset browser/import settings, reusable prefabs, scripting lifecycle/hot reload, animation tooling, asset dependency tracking |
| **0.6.0** | **Game-design systems** | UI layout/widgets, gameplay events, navigation/pathfinding foundations, save/load, gameplay templates and sample projects |
| **0.7.0** | **Build, export, and publishing** | Reproducible builds, asset packaging, optimized browser bundles, player startup shell, deployment/diagnostics workflow |
| **0.8.0** | **Production performance and compatibility** | Profiling, large-scene performance, stress and memory tooling, browser/input/accessibility testing, targeted optimization |
| **0.9.0** | **Game-complete beta** | Full example game built with public tooling, API freeze candidates, migration guides, end-to-end QA and release candidates |
| **1.0.0** | **Stable game development platform** | SDK + editor + runtime + packaging all tested with a shipped, playable sample game and documented supported browsers |

The contents are goals, not guaranteed delivery dates or claims of current implementation. We will adjust scope when engineering discoveries require it, but **not** weaken the 1.0 completion gate to force a version number.

## 0.2.0 implementation train

- PR 01: WebGPU startup, local-server security, and engine reliability.
- PR 02: geometry, 32-bit indices, hierarchy and GPU resource ownership.
- PR 03: textures, samplers, image decoding and material foundation.
- PR 04: metallic-roughness direct-light PBR, color-space handling and tone mapping.
- PR 05: static glTF/GLB importer, material mapping, nested assets.
- PR 06: directional shadows and procedural environment fill/reflection approximations.
- **PR 07: visibility culling, true indexed GPU instancing, CPU frame profiling, memory diagnostics, responsive performance demo.**
- Release candidate: hardware GPU validation on Windows/RX 6600 and browser test matrix, fixes, docs and package health.

PR 07 deliberately does **not** claim true HDR image-based lighting, GPU timestamp profiling, or fully automatic batching of arbitrary materials.

## 1.0 philosophy

Support a complete single-player web game workflow first. Multiplayer and specialized features may remain optional modules or post-1.0 upgrades. A production-oriented public SDK needs stable APIs, tests, developer tools and reproducible build output—not just impressive screenshots.
