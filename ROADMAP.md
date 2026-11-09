# Roadmap

This is an aspirational roadmap, not a shipping commitment.

- **0.1.0-alpha.1 (this release)**: dependency-free browser runtime, WebGPU/WebGL2 renderer, cameras, meshes, lighting, scene graph, demo, and unit tests.
- **0.2 alpha (in progress)**: renderer reliability, flexible geometry, hierarchy, GPU resource lifecycle, textures/material infrastructure (PR 03), direct-light metallic-roughness PBR (PR 04), static glTF/GLB asset import (PR 05), followed by directional shadow maps and procedural environment approximation (PR 06); HDR IBL and advanced shadows remain future work.
- **0.3 alpha**: animation, audio, better scene serialization, debug tooling, profiling.
- **0.4 alpha**: collision and physics integration, scene editor proof of concept, asset processing.
- **0.5+**: networking primitives, scripting and plugins, optimization, broader browser coverage.
- **1.0**: stability commitment only after extensive production and compatibility testing.

No proprietary application-specific code or content belongs in this public repository.

- **PR 05 completed locally:** Limited static glTF 2.0/.glb loader with geometry, nested nodes, PNG/JPEG textures, PBR material mapping, error reporting, and an original GLB demo asset. Browser GPU validation pending.
