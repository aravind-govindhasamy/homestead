import * as THREE from 'three';
import { SPOTS, terrainHeightAt } from './terrain.js';

// walkable surfaces: floor slab and deck (ponytail: no wall collision yet —
// add AABB blocking if walking through glass starts to hurt)
export function houseSurfaceAt(x, z) {
  const hx = x - SPOTS.house.x, hz = z - SPOTS.house.z;
  if (Math.abs(hx) <= 6 && Math.abs(hz) <= 4.25) return SPOTS.house.h + 0.36; // floor slab
  if (hx >= -3 && hx <= 4 && hz > 4.25 && hz <= 8) return SPOTS.house.h + 0.23; // deck
  return -Infinity;
}
export const groundAt = (x, z) => Math.max(terrainHeightAt(x, z), houseSurfaceAt(x, z));

// modern flat-roof house: white volumes, glass front, wood accent, deck
export function createHouse() {
  const g = new THREE.Group();
  const white = new THREE.MeshStandardMaterial({ color: 0xf2f1ec, roughness: 0.6 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x33393f, roughness: 0.5, metalness: 0.2 });
  const wood = new THREE.MeshStandardMaterial({ color: 0xb08454, roughness: 0.85 });
  const glass = new THREE.MeshStandardMaterial({
    color: 0x9fc4d8, transparent: true, opacity: 0.32, roughness: 0.05, metalness: 0.4,
  });
  const box = (mat, w, h, d, x, y, z) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(x, y, z);
    m.castShadow = m.receiveShadow = true;
    g.add(m);
    return m;
  };

  // main volume
  box(white, 12, 0.35, 8.5, 0, 0.18, 0);          // floor slab
  box(white, 12, 3.1, 0.22, 0, 1.9, -4.1);        // back wall
  box(white, 0.22, 3.1, 8.5, -5.9, 1.9, 0);       // left wall
  box(wood, 0.28, 3.1, 8.5, 5.9, 1.9, 0);         // wood accent right wall
  // glass front with dark mullions
  box(glass, 11, 2.9, 0.1, 0, 1.85, 4.1);
  for (const x of [-5.5, -2.75, 0, 2.75, 5.5]) box(dark, 0.12, 3, 0.16, x, 1.85, 4.1);
  box(dark, 11.2, 0.12, 0.16, 0, 3.32, 4.1);
  // flat roof with overhang
  box(dark, 13.2, 0.35, 9.8, 0, 3.65, 0.2);
  // clerestory second volume
  box(white, 6, 1.5, 5, -2.5, 4.55, -1.2);
  box(dark, 6.6, 0.25, 5.6, -2.5, 5.4, -1.2);
  // deck + steps
  box(wood, 7, 0.22, 3.6, 0.5, 0.12, 6.2);
  box(wood, 3, 0.16, 0.9, 0.5, 0.0, 8.4);
  // warm interior light for evenings (main loop drives intensity)
  const light = new THREE.PointLight(0xffc98a, 0, 18, 1.6);
  light.position.set(0, 2.4, 0);
  g.add(light);

  g.position.set(SPOTS.house.x, SPOTS.house.h, SPOTS.house.z);
  g.userData.light = light;
  return g;
}
