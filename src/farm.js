import * as THREE from 'three';
import { SPOTS, terrainHeightAt } from './terrain.js';

// plantable plots: E to plant, crops grow over time, E again to harvest
const GROW_TIME = 25; // seconds to full growth
export const plots = []; // {x, z, state: 0 empty | 1 growing | 2 ready, t, crop, fruit}

export function createFarm() {
  const g = new THREE.Group();
  const soilMat = new THREE.MeshStandardMaterial({ color: 0x4a3626, roughness: 1 });
  const stemMat = new THREE.MeshStandardMaterial({ color: 0x4f8f2f, roughness: 0.8 });
  const fruitMat = new THREE.MeshStandardMaterial({ color: 0xd9772f, roughness: 0.6 });

  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 4; c++) {
      const x = SPOTS.farm.x - 3.6 + c * 2.4;
      const z = SPOTS.farm.z - 2.4 + r * 2.4;
      const y = terrainHeightAt(x, z);
      const soil = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.28, 1.9), soilMat);
      soil.position.set(x, y + 0.1, z);
      soil.receiveShadow = true;

      const crop = new THREE.Group();
      const stem = new THREE.Mesh(new THREE.ConeGeometry(0.32, 0.85, 7), stemMat);
      stem.position.y = 0.42;
      stem.castShadow = true;
      const fruit = new THREE.Mesh(new THREE.SphereGeometry(0.26, 10, 8), fruitMat);
      fruit.position.set(0.3, 0.18, 0.2);
      fruit.castShadow = true;
      fruit.visible = false;
      crop.add(stem, fruit);
      crop.position.set(x, y + 0.24, z);
      crop.visible = false;

      g.add(soil, crop);
      plots.push({ x, z, state: 0, t: 0, crop, fruit });
    }
  }
  return g;
}

export function updateFarm(dt) {
  for (const p of plots) {
    if (p.state === 1) {
      p.t += dt;
      const k = Math.min(1, p.t / GROW_TIME);
      p.crop.visible = true;
      p.crop.scale.setScalar(0.2 + 0.8 * k);
      if (k >= 1) { p.state = 2; p.fruit.visible = true; }
    } else if (p.state === 0) {
      p.crop.visible = false;
      p.fruit.visible = false;
    }
  }
}

// returns a message when something happened, else null
export function interactFarm(px, pz) {
  let best = null, bestD = 2.4;
  for (const p of plots) {
    const d = Math.hypot(p.x - px, p.z - pz);
    if (d < bestD) { best = p; bestD = d; }
  }
  if (!best) return null;
  if (best.state === 0) { best.state = 1; best.t = 0; return 'Planted a crop 🌱'; }
  if (best.state === 2) { best.state = 0; best.t = 0; return 'harvest'; }
  return 'Still growing…';
}
