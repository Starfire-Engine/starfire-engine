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
