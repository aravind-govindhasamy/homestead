import * as THREE from 'three';
import { SPOTS } from './terrain.js';
import { CAMPFIRE } from './environment.js';
import { groundAt } from './house.js';
import { createCharacter, animateCharacter } from './player.js';

// ponytail: waypoint FSM, no navmesh/Yuka; add three-pathfinding when obstacles matter
export const TASK_POINTS = {
  field: new THREE.Vector3(SPOTS.farm.x, 0, SPOTS.farm.z),
  hives: new THREE.Vector3(SPOTS.hives.x, 0, SPOTS.hives.z + 1.8),
  home: new THREE.Vector3(3, 0, 5),
  pond: new THREE.Vector3(SPOTS.pond.x, 0, SPOTS.pond.z + SPOTS.pond.r + 2.5),
  campfire: new THREE.Vector3(CAMPFIRE.x + 1.2, 0, CAMPFIRE.z + 1.2),
};

// daily schedule: [startHour, place, label] — work, breaks, leisure, sleep
export const npcs = [
  {
    name: 'Alice', role: 'farmer', shirt: 0xc94f7c, hair: 0x5a3825,
    schedule: [
      [6, 'field', 'tending the crops'],
      [12, 'home', 'lunch at home'],
      [13.5, 'field', 'tending the crops'],
      [17, 'pond', 'relaxing by the pond'],
      [19.5, 'campfire', 'sitting at the campfire'],
      [21.5, 'home', 'sleeping'],
    ],
  },
  {
    name: 'Bob', role: 'beekeeper', shirt: 0x4f7cc9, hair: 0x2b2b2b,
    schedule: [
      [7, 'hives', 'checking the hives'],
      [12, 'campfire', 'lunch by the fire'],
      [13.5, 'hives', 'checking the hives'],
      [17.5, 'campfire', 'unwinding at the fire'],
      [20.5, 'home', 'sleeping'],
    ],
  },
].map((n, i) => {
  const ch = createCharacter(n.shirt, 0x3b4252, 0xf0c8a0, n.hair);
  return { ...n, ...ch, x: 3 + i * 2, z: 5, status: '' };
});

// context-aware small talk for the E key
export function getGreeting(n) {
  const s = n.status;
  if (s.includes('sleep')) return `${n.name} is fast asleep. 💤`;
  if (s.includes('walking')) return `${n.name}: "Can't chat — ${s.replace('walking', 'heading')}!"`;
  if (s.includes('crops')) return `${n.name}: "The crops are coming along beautifully this year."`;
  if (s.includes('hives')) return `${n.name}: "The bees are happy today. That means good honey."`;
  if (s.includes('lunch')) return `${n.name}: "Pull up a seat, there's plenty!"`;
  if (s.includes('pond')) return `${n.name}: "Nothing beats the pond at this hour."`;
  if (s.includes('fire')) return `${n.name}: "Come sit by the fire a while."`;
  return `${n.name}: "Lovely day on the homestead, isn't it?"`;
}

function currentBlock(schedule, dayTime) {
  let cur = schedule[schedule.length - 1]; // before first block = still last night's block
  for (const b of schedule) if (dayTime >= b[0]) cur = b;
  return cur;
}

export function updateNPC(n, dt, dayTime) {
  const [, place, label] = currentBlock(n.schedule, dayTime);
  const target = TASK_POINTS[place];
  const dx = target.x - n.x, dz = target.z - n.z;
  const dist = Math.hypot(dx, dz);
  let speed = 0;

  if (dist > 0.6) {
    speed = 3;
    n.x += (dx / dist) * speed * dt;
    n.z += (dz / dist) * speed * dt;
    n.group.rotation.y = Math.atan2(dx, dz);
    n.status = `walking to ${place}`;
  } else {
    n.status = label;
  }
  n.group.position.set(n.x, groundAt(n.x, n.z), n.z);
  animateCharacter(n, dt, speed);
}
