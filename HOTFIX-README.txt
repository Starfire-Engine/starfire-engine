Starfire Engine WebGPU hotfix (for v0.1.0-alpha.1 source)

Fix 1: WGSL shader compile error "unresolved call target inverse"
- Replaces unsupported inverse() call with a cofactor-based normal transform.
- Supports nonuniform and mirrored, non-singular transforms.
- Transform scale of zero remains unsupported for meaningful normals.

Fix 2: Depth attachment initialization edge case
- Creates the depth texture even when canvas already has the correct dimensions.

Fix 3: Two regression tests.
- These are source/lifecycle tests, NOT a real GPU/browser rendering test.

Apply to cloned Starfire Engine root (PowerShell):
  Expand-Archive "$HOME\\Downloads\\starfire-webgpu-hotfix.zip" "$HOME\\Downloads\\starfire-hotfix" -Force
  Copy-Item "$HOME\\Downloads\\starfire-hotfix\\src" "." -Recurse -Force
  Copy-Item "$HOME\\Downloads\\starfire-hotfix\\tests" "." -Recurse -Force
  npm run ci
  npm run dev

Open:
  http://localhost:5173/?renderer=webgpu

If it succeeds and you review the diff:
  git diff
  git add src/graphics/shaders.js src/graphics/WebGPURenderer.js tests/webgpu-hotfix.test.js
  git commit -m "fix: make WGSL normals compile and initialize depth texture"
  git push origin main

DO NOT move the existing v0.1.0-alpha.1 release tag.
Release a new hotfix pre-release tag after hardware testing if desired.
