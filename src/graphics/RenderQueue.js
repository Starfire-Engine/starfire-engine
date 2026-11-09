/**
 * Shared render submission for WebGPU and WebGL 2. Non-mesh hierarchy nodes
 * are retained in the scene; a hidden parent hides all its descendants.
 */
export function collectRenderables(scene) {
  const result = [];
  for (const entity of scene.entities.values()) {
    const mesh = entity.get('mesh');
    if (!mesh || !entity.isVisibleInHierarchy()) continue;
    result.push({ entity, mesh, geometry: mesh.geometry, modelMatrix: entity.worldMatrix() });
  }
  return result;
}
