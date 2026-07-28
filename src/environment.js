import * as THREE from 'three';
import { Sky } from 'three/addons/objects/Sky.js';
import { SIZE, WATER_LEVEL, SPOTS, terrainHeightAt } from './terrain.js';

// ---------- sky + lighting ----------
export const sky = new Sky();
sky.scale.setScalar(2000);
Object.assign(sky.material.uniforms.turbidity, { value: 6 });
sky.material.uniforms.rayleigh.value = 1.8;
sky.material.uniforms.mieCoefficient.value = 0.004;
sky.material.uniforms.mieDirectionalG.value = 0.85;

export const sun = new THREE.DirectionalLight(0xfff1dc, 3);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = sun.shadow.camera.bottom = -60;
sun.shadow.camera.right = sun.shadow.camera.top = 60;
sun.shadow.camera.far = 250;
sun.shadow.bias = -0.0004;

export const hemi = new THREE.HemisphereLight(0xbfd9ff, 0x4a5d35, 0.5);

const sunDir = new THREE.Vector3();
export function updateDay(dayTime, scene) {
  const angle = ((dayTime - 6) / 24) * Math.PI * 2; // sunrise at 6
  sunDir.set(Math.cos(angle), Math.sin(angle), 0.35).normalize();
  sky.material.uniforms.sunPosition.value.copy(sunDir);
  sun.position.copy(sunDir).multiplyScalar(90);
  const dayness = Math.max(0, sunDir.y);
  sun.intensity = 3 * dayness;
  hemi.intensity = 0.12 + 0.55 * dayness;
  scene.fog.color.lerpColors(new THREE.Color(0x0a0e1c), new THREE.Color(0xbfd4e0), dayness);
  return dayness;
}

export function configureRenderer(renderer) {
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.65;
}

// ---------- scattered scenery: trees, rocks, flowers, water, hives, fence ----------
const dummy = new THREE.Object3D();
const rand = (a, b) => a + Math.random() * (b - a);

function clearOfSpots(x, z, pad = 3) {
  return Object.values(SPOTS).every(s => Math.hypot(x - s.x, z - s.z) > s.r + pad);
}

function scatter(count, place) {
  const spots = [];
  let guard = count * 30;
  while (spots.length < count && guard-- > 0) {
    const x = rand(-SIZE / 2 + 6, SIZE / 2 - 6), z = rand(-SIZE / 2 + 6, SIZE / 2 - 6);
    const y = terrainHeightAt(x, z);
    if (y > WATER_LEVEL + 0.4 && clearOfSpots(x, z)) spots.push([x, y, z]);
  }
  spots.forEach((s, i) => place(s, i));
  return spots.length;
}

export function buildScenery() {
  const group = new THREE.Group();

  // trees: round canopies + pines, instanced
  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x6e4f30, roughness: 1 });
  const leafMat = new THREE.MeshStandardMaterial({ color: 0x4e7d33, roughness: 0.9 });
  const pineMat = new THREE.MeshStandardMaterial({ color: 0x3c6b3a, roughness: 0.9 });

  const N_ROUND = 70, N_PINE = 50;
  const trunks = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.18, 0.3, 2.2, 6), trunkMat, N_ROUND + N_PINE);
  const canopies = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1.5, 1), leafMat, N_ROUND);
  const pines = new THREE.InstancedMesh(new THREE.ConeGeometry(1.3, 3.4, 7), pineMat, N_PINE);
  trunks.castShadow = canopies.castShadow = pines.castShadow = true;

  let t = 0;
  scatter(N_ROUND, ([x, y, z], i) => {
    const s = rand(0.8, 1.5);
    dummy.position.set(x, y + 1.1 * s, z); dummy.scale.setScalar(s); dummy.rotation.y = rand(0, 7);
    dummy.updateMatrix(); trunks.setMatrixAt(t++, dummy.matrix);
    dummy.position.y = y + (2 + rand(0.4, 0.9)) * s; dummy.updateMatrix();
    canopies.setMatrixAt(i, dummy.matrix);
  });
  scatter(N_PINE, ([x, y, z], i) => {
    const s = rand(0.7, 1.4);
    dummy.position.set(x, y + 1.1 * s, z); dummy.scale.setScalar(s); dummy.rotation.y = rand(0, 7);
    dummy.updateMatrix(); trunks.setMatrixAt(t++, dummy.matrix);
    dummy.position.y = y + 3 * s; dummy.updateMatrix();
    pines.setMatrixAt(i, dummy.matrix);
  });
  trunks.count = t;
  group.add(trunks, canopies, pines);

  // rocks
  const rocks = new THREE.InstancedMesh(
    new THREE.DodecahedronGeometry(0.7),
    new THREE.MeshStandardMaterial({ color: 0x8d8880, roughness: 1 }), 28);
  rocks.castShadow = true;
  scatter(28, ([x, y, z], i) => {
    dummy.position.set(x, y + 0.15, z);
    dummy.scale.set(rand(0.5, 1.6), rand(0.35, 0.9), rand(0.5, 1.6));
    dummy.rotation.set(rand(0, 3), rand(0, 3), rand(0, 3));
    dummy.updateMatrix(); rocks.setMatrixAt(i, dummy.matrix);
  });
  group.add(rocks);

  // flowers: tiny colored blobs
  const flowers = new THREE.InstancedMesh(
    new THREE.SphereGeometry(0.09, 6, 5),
    new THREE.MeshStandardMaterial({ roughness: 0.7 }), 220);
  const petals = [0xe4572e, 0xf3a712, 0xa8c686, 0xdb2b39, 0xf5e960];
  scatter(220, ([x, y, z], i) => {
    dummy.position.set(x, y + 0.08, z); dummy.scale.setScalar(rand(0.7, 1.4));
    dummy.rotation.set(0, 0, 0); dummy.updateMatrix();
    flowers.setMatrixAt(i, dummy.matrix);
    flowers.setColorAt(i, new THREE.Color(petals[i % petals.length]));
  });
  group.add(flowers);

  // pond water
  const water = new THREE.Mesh(
    new THREE.CircleGeometry(SPOTS.pond.r - 0.3, 40),
    new THREE.MeshStandardMaterial({ color: 0x3d7a9e, transparent: true, opacity: 0.82, roughness: 0.08, metalness: 0.3 })
  );
  water.rotation.x = -Math.PI / 2;
  water.position.set(SPOTS.pond.x, WATER_LEVEL, SPOTS.pond.z);
  group.add(water);

  // beehives
  const hiveBody = new THREE.MeshStandardMaterial({ color: 0xf2ead3, roughness: 0.8 });
  const hiveBand = new THREE.MeshStandardMaterial({ color: 0xd9a441, roughness: 0.8 });
  for (let i = 0; i < 3; i++) {
    const hx = SPOTS.hives.x - 1.5 + i * 1.5, hz = SPOTS.hives.z + (i % 2) * 1.2;
    const hy = terrainHeightAt(hx, hz);
    const box = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.85, 0.8), hiveBody);
    box.position.set(hx, hy + 0.65, hz); box.castShadow = true;
    const band = new THREE.Mesh(new THREE.BoxGeometry(0.84, 0.16, 0.84), hiveBand);
    band.position.set(hx, hy + 0.75, hz);
    const lid = new THREE.Mesh(new THREE.BoxGeometry(0.92, 0.1, 0.92), hiveBand);
    lid.position.set(hx, hy + 1.12, hz); lid.castShadow = true;
    group.add(box, band, lid);
  }

  // farm fence
  const postMat = new THREE.MeshStandardMaterial({ color: 0x8a6a45, roughness: 1 });
  const { x: fx, z: fz } = SPOTS.farm;
  const W = 7, D = 5;
  const posts = [];
  for (let x = -W; x <= W; x += 2.33) { posts.push([fx + x, fz - D], [fx + x, fz + D]); }
  for (let z = -D + 2.5; z <= D - 1; z += 2.5) { posts.push([fx - W, fz + z], [fx + W, fz + z]); }
  const postMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(0.16, 1.1, 0.16), postMat, posts.length);
  posts.forEach(([x, z], i) => {
    dummy.position.set(x, terrainHeightAt(x, z) + 0.5, z);
    dummy.scale.setScalar(1); dummy.rotation.set(0, 0, 0);
    dummy.updateMatrix(); postMesh.setMatrixAt(i, dummy.matrix);
  });
  postMesh.castShadow = true;
  group.add(postMesh);
  const fy = SPOTS.farm.h;
  for (const dy of [0.45, 0.85]) {
    for (const [w, h, px, pz] of [
      [W * 2, 0.07, fx, fz - D], [W * 2, 0.07, fx, fz + D],
    ]) {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(w, 0.07, 0.07), postMat);
      rail.position.set(px, fy + dy, pz); group.add(rail);
    }
    for (const px of [fx - W, fx + W]) {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.07, D * 2), postMat);
      rail.position.set(px, fy + dy, fz); group.add(rail);
    }
  }

  return group;
}
