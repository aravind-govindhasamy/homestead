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
  // ---- interior (visible through the glass front) ----
  const F = 0.355; // floor top
  const teal = new THREE.MeshStandardMaterial({ color: 0x2a6f77, roughness: 0.8 });
  const cream = new THREE.MeshStandardMaterial({ color: 0xe8ddc8, roughness: 0.9 });
  // rug
  const rug = new THREE.Mesh(new THREE.CylinderGeometry(1.9, 1.9, 0.03, 24), cream);
  rug.position.set(-2, F + 0.02, 0.8); g.add(rug);
  // sofa facing the glass front
  box(teal, 2.6, 0.55, 0.95, -2, F + 0.28, -0.8);
  box(teal, 2.6, 0.55, 0.28, -2, F + 0.72, -1.2);
  for (const ax of [-3.2, -0.8]) box(teal, 0.3, 0.5, 0.95, ax, F + 0.6, -0.8);
  // coffee table
  box(wood, 1.3, 0.36, 0.65, -2, F + 0.2, 0.9);
  // dining table + chairs
  box(wood, 1.7, 0.09, 0.95, 3.2, F + 0.78, -1.5);
  for (const [lx, lz] of [[-0.7, -0.35], [0.7, -0.35], [-0.7, 0.35], [0.7, 0.35]])
    box(dark, 0.08, 0.75, 0.08, 3.2 + lx, F + 0.38, -1.5 + lz);
  for (const cz of [-2.3, -0.7]) box(wood, 0.45, 0.5, 0.45, 3.2, F + 0.26, cz);
  // kitchen counter along the back wall
  box(dark, 4.2, 0.85, 0.62, 2.2, F + 0.43, -3.6);
  box(white, 4.3, 0.06, 0.68, 2.2, F + 0.89, -3.6);
  // bookshelf on the left wall
  box(wood, 0.32, 2.1, 1.7, -5.55, F + 1.05, -1.5);
  const bookCols = [0xc94f7c, 0x4f7cc9, 0xd9a441, 0x5c8a3a, 0x8a3b2e];
  for (let i = 0; i < 10; i++)
    box(new THREE.MeshStandardMaterial({ color: bookCols[i % 5], roughness: 0.9 }),
      0.2, 0.28, 0.09, -5.5, F + 0.5 + Math.floor(i / 5) * 0.55, -2.1 + (i % 5) * 0.3);
  // floor lamp by the sofa, shade glows in the evening with the point light
  box(dark, 0.06, 1.5, 0.06, -3.6, F + 0.75, 0.2);
  const shade = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.3, 0.35, 10),
    new THREE.MeshStandardMaterial({ color: 0xffe6b8, emissive: 0xffc98a, emissiveIntensity: 0.15 }));
  shade.position.set(-3.6, F + 1.6, 0.2); g.add(shade);

  // warm interior light for evenings (main loop drives intensity)
  const light = new THREE.PointLight(0xffc98a, 0, 18, 1.6);
  light.position.set(-3.6, F + 1.7, 0.2);
  g.add(light);
  g.userData.lampShade = shade;

  g.position.set(SPOTS.house.x, SPOTS.house.h, SPOTS.house.z);
  g.userData.light = light;
  return g;
}
