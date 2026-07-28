import * as THREE from 'three';
import { SIZE, terrainHeightAt } from './terrain.js';

// stylized low-poly character shared by player and NPCs
export function createCharacter(shirt, pants = 0x3b4252, skin = 0xf0c8a0) {
  const g = new THREE.Group();
  const mat = c => new THREE.MeshStandardMaterial({ color: c, roughness: 0.8 });

  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.32, 0.45, 4, 10), mat(shirt));
  torso.position.y = 1.05;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.26, 14, 12), mat(skin));
  head.position.y = 1.72;

  const limb = (r, len, color) => {
    const geo = new THREE.CapsuleGeometry(r, len, 4, 8);
    geo.translate(0, -(len / 2 + r), 0); // pivot at the top so rotation swings from the joint
    return new THREE.Mesh(geo, mat(color));
  };
  const legL = limb(0.115, 0.4, pants), legR = limb(0.115, 0.4, pants);
  legL.position.set(-0.16, 0.72, 0); legR.position.set(0.16, 0.72, 0);
  const armL = limb(0.09, 0.38, shirt), armR = limb(0.09, 0.38, shirt);
  armL.position.set(-0.42, 1.38, 0); armR.position.set(0.42, 1.38, 0);

  g.add(torso, head, legL, legR, armL, armR);
  g.traverse(m => (m.castShadow = true));
  return { group: g, legL, legR, armL, armR, phase: 0 };
}

// swing limbs while moving, settle when idle
export function animateCharacter(ch, dt, speed) {
  if (speed > 0.1) {
    ch.phase += dt * speed * 2.2;
    const s = Math.sin(ch.phase) * 0.65;
    ch.legL.rotation.x = s; ch.legR.rotation.x = -s;
    ch.armL.rotation.x = -s * 0.7; ch.armR.rotation.x = s * 0.7;
  } else {
    for (const l of [ch.legL, ch.legR, ch.armL, ch.armR]) l.rotation.x *= 1 - Math.min(1, dt * 10);
  }
}

export function createPlayer() {
  const ch = createCharacter(0x2a9d8f, 0x33415c);
  const p = { ...ch, x: 4, z: 7, heading: 0 };
  return p;
}

const BOUND = SIZE / 2 - 3;
export function updatePlayer(p, dt, input, camYaw) {
  const fx = -Math.sin(camYaw), fz = -Math.cos(camYaw);
  let mx = fx * input.fwd + -fz * input.side;
  let mz = fz * input.fwd + fx * input.side;
  const len = Math.hypot(mx, mz);
  let speed = 0;
  if (len > 0.01) {
    speed = input.run ? 9 : 4.5;
    mx /= len; mz /= len;
    p.x = Math.max(-BOUND, Math.min(BOUND, p.x + mx * speed * dt));
    p.z = Math.max(-BOUND, Math.min(BOUND, p.z + mz * speed * dt));
    const target = Math.atan2(mx, mz);
    let d = target - p.heading;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    p.heading += d * Math.min(1, dt * 12);
  }
  p.group.position.set(p.x, terrainHeightAt(p.x, p.z), p.z);
  p.group.rotation.y = p.heading;
  animateCharacter(p, dt, speed);
  return speed;
}
