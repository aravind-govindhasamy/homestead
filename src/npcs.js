import * as THREE from 'three';
import { terrainHeightAt } from './terrain.js';

// ponytail: waypoint FSM, no navmesh/Yuka; add three-pathfinding when obstacles matter
export const TASK_POINTS = {
  field: new THREE.Vector3(-20, 0, 15),
  hives: new THREE.Vector3(18, 0, -18),
  home: new THREE.Vector3(1, 0, 1),
  pond: new THREE.Vector3(-15, 0, -20),
};

export const npcs = [
  { name: 'Alice', role: 'farmer', color: 0xc94f7c, tasks: ['field', 'pond', 'field', 'home'], awake: [6, 18] },
  { name: 'Bob', role: 'beekeeper', color: 0x4f7cc9, tasks: ['hives', 'home', 'hives', 'pond'], awake: [7, 19] },
].map((n, i) => {
  const mesh = new THREE.Mesh(
    new THREE.CapsuleGeometry(0.4, 0.9, 4, 8),
    new THREE.MeshLambertMaterial({ color: n.color })
  );
  mesh.castShadow = true;
  return { ...n, mesh, x: 1 + i * 2, z: 1, state: 'idle', taskIdx: 0, workTimer: 0 };
});

export function updateNPC(n, dt, dayTime) {
  const awake = dayTime >= n.awake[0] && dayTime < n.awake[1];
  const targetName = awake ? n.tasks[n.taskIdx] : 'home';
  const target = TASK_POINTS[targetName];
  const dx = target.x - n.x, dz = target.z - n.z;
  const dist = Math.hypot(dx, dz);

  if (n.state === 'work') {
    n.workTimer -= dt;
    if (n.workTimer <= 0) { n.taskIdx = (n.taskIdx + 1) % n.tasks.length; n.state = 'idle'; }
  } else if (dist > 0.5) {
    n.state = 'walk';
    const speed = 3;
    n.x += (dx / dist) * speed * dt;
    n.z += (dz / dist) * speed * dt;
    n.mesh.rotation.y = Math.atan2(dx, dz);
  } else if (awake) {
    n.state = 'work';
    n.workTimer = 3;
  } else {
    n.state = 'idle'; // asleep at home
  }
  n.mesh.position.set(n.x, terrainHeightAt(n.x, n.z) + 1.05, n.z);
  n.status = awake ? `${n.state === 'work' ? 'working at' : 'heading to'} ${targetName}` : 'sleeping';
}
