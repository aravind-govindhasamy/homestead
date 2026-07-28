import * as THREE from 'three';
import { terrainHeightAt, SPOTS } from './terrain.js';
import { createCharacter, animateCharacter } from './player.js';

// ponytail: waypoint FSM, no navmesh/Yuka; add three-pathfinding when obstacles matter
export const TASK_POINTS = {
  field: new THREE.Vector3(SPOTS.farm.x, 0, SPOTS.farm.z),
  hives: new THREE.Vector3(SPOTS.hives.x, 0, SPOTS.hives.z + 1.8),
  home: new THREE.Vector3(3, 0, 5),
  pond: new THREE.Vector3(SPOTS.pond.x, 0, SPOTS.pond.z + SPOTS.pond.r + 2),
};

export const npcs = [
  { name: 'Alice', role: 'farmer', shirt: 0xc94f7c, tasks: ['field', 'pond', 'field', 'home'], awake: [6, 18] },
  { name: 'Bob', role: 'beekeeper', shirt: 0x4f7cc9, tasks: ['hives', 'home', 'hives', 'pond'], awake: [7, 19] },
].map((n, i) => {
  const ch = createCharacter(n.shirt);
  return { ...n, ...ch, x: 3 + i * 2, z: 5, state: 'idle', taskIdx: 0, workTimer: 0 };
});

export function updateNPC(n, dt, dayTime) {
  const awake = dayTime >= n.awake[0] && dayTime < n.awake[1];
  const targetName = awake ? n.tasks[n.taskIdx] : 'home';
  const target = TASK_POINTS[targetName];
  const dx = target.x - n.x, dz = target.z - n.z;
  const dist = Math.hypot(dx, dz);
  let speed = 0;

  if (n.state === 'work') {
    n.workTimer -= dt;
    if (n.workTimer <= 0) { n.taskIdx = (n.taskIdx + 1) % n.tasks.length; n.state = 'idle'; }
  } else if (dist > 0.6) {
    n.state = 'walk';
    speed = 3;
    n.x += (dx / dist) * speed * dt;
    n.z += (dz / dist) * speed * dt;
    n.group.rotation.y = Math.atan2(dx, dz);
  } else if (awake) {
    n.state = 'work';
    n.workTimer = 4;
  } else {
    n.state = 'idle'; // asleep at home
  }
  n.group.position.set(n.x, terrainHeightAt(n.x, n.z), n.z);
  animateCharacter(n, dt, speed);
  n.status = awake ? `${n.state === 'work' ? 'working at' : 'heading to'} ${targetName}` : 'sleeping';
}
