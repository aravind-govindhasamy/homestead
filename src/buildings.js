import * as THREE from 'three';
import { terrainHeightAt } from './terrain.js';

export const MODULE_DEFS = {
  wall:  { size: [2, 2.4, 0.25], yOff: 1.2,  color: 0xd9c8a9 },
  floor: { size: [2, 0.2, 2],    yOff: 0.1,  color: 0x9a7b52 },
  roof:  { size: [2.2, 0.3, 2.2], yOff: 2.7, color: 0x8a3b2e },
};
export const GRID = 2;
export const modules = []; // {type, x, z, mesh}
export const moduleGroup = new THREE.Group();

export const snap = v => Math.round(v / GRID) * GRID;

export function makeModuleMesh(type, ghost = false) {
  const d = MODULE_DEFS[type];
  const mat = new THREE.MeshLambertMaterial({ color: d.color, transparent: ghost, opacity: ghost ? 0.5 : 1 });
  const m = new THREE.Mesh(new THREE.BoxGeometry(...d.size), mat);
  m.castShadow = m.receiveShadow = !ghost;
  return m;
}

export function placeModule(type, x, z) {
  const mesh = makeModuleMesh(type);
  mesh.position.set(x, terrainHeightAt(x, z) + MODULE_DEFS[type].yOff, z);
  moduleGroup.add(mesh);
  modules.push({ type, x, z, mesh });
}

export function removeModuleByMesh(mesh) {
  const i = modules.findIndex(m => m.mesh === mesh);
  if (i >= 0) { moduleGroup.remove(mesh); modules.splice(i, 1); }
}

export function clearModules() {
  while (modules.length) removeModuleByMesh(modules[0].mesh);
}

// keep placed modules glued to the ground after terrain edits
export function reglueModules() {
  for (const m of modules) m.mesh.position.y = terrainHeightAt(m.x, m.z) + MODULE_DEFS[m.type].yOff;
}

// starter cabin so the scene isn't empty
[[0, 0], [2, 0], [0, 2], [2, 2]].forEach(([x, z]) => placeModule('floor', x, z));
[[-1, 0], [-1, 2], [3, 0], [3, 2]].forEach(([x, z]) => placeModule('wall', x, z));
[[0, 0], [2, 0], [0, 2], [2, 2]].forEach(([x, z]) => placeModule('roof', x, z));
