import * as THREE from 'three';
import { groundAt } from './house.js';

// Biscuit: follows the player, wags constantly, sits when you stand still
export function createDog() {
  const g = new THREE.Group();
  const fur = new THREE.MeshStandardMaterial({ color: 0xc89762, roughness: 0.9 });
  const darkFur = new THREE.MeshStandardMaterial({ color: 0x8a6a45, roughness: 0.9 });

  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.22, 0.5, 4, 8), fur);
  body.rotation.x = Math.PI / 2;
  body.position.y = 0.42;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.19, 10, 8), fur);
  head.position.set(0, 0.62, 0.42);
  const snout = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.1, 0.16), darkFur);
  snout.position.set(0, 0.56, 0.6);
  const earGeo = new THREE.ConeGeometry(0.07, 0.16, 5);
  const earL = new THREE.Mesh(earGeo, darkFur), earR = new THREE.Mesh(earGeo, darkFur);
  earL.position.set(-0.11, 0.8, 0.38); earR.position.set(0.11, 0.8, 0.38);
  const tail = new THREE.Mesh(new THREE.CapsuleGeometry(0.045, 0.3, 3, 6), darkFur);
  tail.geometry.translate(0, 0.18, 0);
  tail.position.set(0, 0.5, -0.42);
  tail.rotation.x = -0.9;
  const legGeo = new THREE.CapsuleGeometry(0.05, 0.2, 3, 6);
  const legs = [[-0.13, 0.28], [0.13, 0.28], [-0.13, -0.25], [0.13, -0.25]].map(([x, z]) => {
    const l = new THREE.Mesh(legGeo, fur);
    l.position.set(x, 0.18, z);
    g.add(l);
    return l;
  });

  g.add(body, head, snout, earL, earR, tail);
  g.traverse(m => (m.castShadow = true));
  return { group: g, tail, legs, x: 2, z: 8, heading: 0, phase: 0, idleTime: 0 };
}

export function updateDog(dog, dt, player, t) {
  // heel position: behind and beside the player
  const hx = player.x - Math.sin(player.heading) * 1.5 + Math.cos(player.heading) * 0.9;
  const hz = player.z - Math.cos(player.heading) * 1.5 - Math.sin(player.heading) * 0.9;
  const dx = hx - dog.x, dz = hz - dog.z;
  const dist = Math.hypot(dx, dz);
  let speed = 0;

  if (dist > 0.4) {
    speed = Math.min(11, dist * 2.5);
    dog.x += (dx / dist) * speed * dt;
    dog.z += (dz / dist) * speed * dt;
    const target = Math.atan2(dx, dz);
    let d = target - dog.heading;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    dog.heading += d * Math.min(1, dt * 10);
    dog.idleTime = 0;
  } else {
    dog.idleTime += dt;
  }

  const sitting = dog.idleTime > 2;
  dog.group.position.set(dog.x, groundAt(dog.x, dog.z), dog.z);
  dog.group.rotation.y = dog.heading;
  dog.group.rotation.x = sitting ? -0.35 : 0; // haunches down
  dog.tail.rotation.z = Math.sin(t * (speed > 0.5 ? 14 : 7)) * 0.5;

  if (speed > 0.5) {
    dog.phase += dt * speed * 2;
    dog.legs.forEach((l, i) => (l.rotation.x = Math.sin(dog.phase + (i % 2) * Math.PI) * 0.7));
  } else {
    dog.legs.forEach(l => (l.rotation.x *= 1 - Math.min(1, dt * 8)));
  }
}
