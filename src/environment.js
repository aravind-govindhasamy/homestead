import * as THREE from 'three';
import { Sky } from 'three/addons/objects/Sky.js';
import { SIZE, WATER_LEVEL, SPOTS, terrainHeightAt } from './terrain.js';

// ---------- sky + lighting ----------
export const sky = new Sky();
sky.scale.setScalar(2000);
sky.material.uniforms.turbidity.value = 6;
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

export const moon = new THREE.DirectionalLight(0x93a7cc, 0);
export const hemi = new THREE.HemisphereLight(0xbfd9ff, 0x4a5d35, 0.5);

const sunDir = new THREE.Vector3();
export function updateDay(dayTime, scene) {
  const angle = ((dayTime - 6) / 24) * Math.PI * 2; // sunrise at 6
  sunDir.set(Math.cos(angle), Math.sin(angle), 0.35).normalize();
  sky.material.uniforms.sunPosition.value.copy(sunDir);
  sun.position.copy(sunDir).multiplyScalar(90);
  const dayness = Math.max(0, sunDir.y);
  sun.intensity = 3 * dayness;
  moon.intensity = 0.3 * Math.max(0, 1 - dayness * 4);
  moon.position.set(-sunDir.x * 80, Math.max(25, -sunDir.y * 80), -sunDir.z * 80);
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

// ---------- scenery ----------
const dummy = new THREE.Object3D();
const rand = (a, b) => a + Math.random() * (b - a);

function clearOfSpots(x, z, pad = 3) {
  return Object.values(SPOTS).every(s => Math.hypot(x - s.x, z - s.z) > s.r + pad);
}

function scatter(count, place, filter = null) {
  let placed = 0, guard = count * 40;
  while (placed < count && guard-- > 0) {
    const x = rand(-SIZE / 2 + 6, SIZE / 2 - 6), z = rand(-SIZE / 2 + 6, SIZE / 2 - 6);
    const y = terrainHeightAt(x, z);
    const ok = filter ? filter(x, y, z) : y > WATER_LEVEL + 0.4 && clearOfSpots(x, z);
    if (ok) place([x, y, z], placed++);
  }
}

// dynamic bits driven by updateEnvironment
let waterGeo, clouds = [], bees = [], fireflies, fireflyBase, starsMat, flame, fireLight;
export const CAMPFIRE = new THREE.Vector3(8.5, 0, 8.5);

export function buildScenery() {
  const group = new THREE.Group();

  // trees
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
    dummy.position.set(x, y + 1.1 * s, z); dummy.scale.setScalar(s); dummy.rotation.set(0, rand(0, 7), 0);
    dummy.updateMatrix(); trunks.setMatrixAt(t++, dummy.matrix);
    dummy.position.y = y + (2 + rand(0.4, 0.9)) * s; dummy.updateMatrix();
    canopies.setMatrixAt(i, dummy.matrix);
  });
  scatter(N_PINE, ([x, y, z], i) => {
    const s = rand(0.7, 1.4);
    dummy.position.set(x, y + 1.1 * s, z); dummy.scale.setScalar(s); dummy.rotation.set(0, rand(0, 7), 0);
    dummy.updateMatrix(); trunks.setMatrixAt(t++, dummy.matrix);
    dummy.position.y = y + 3 * s; dummy.updateMatrix();
    pines.setMatrixAt(i, dummy.matrix);
  });
  trunks.count = t;
  group.add(trunks, canopies, pines);

  // grass tufts everywhere the ground is grassy
  const N_GRASS = 2600;
  const grassMesh = new THREE.InstancedMesh(
    new THREE.ConeGeometry(0.06, 0.38, 4),
    new THREE.MeshStandardMaterial({ roughness: 1 }), N_GRASS);
  const gCol = new THREE.Color();
  scatter(N_GRASS, ([x, y, z], i) => {
    dummy.position.set(x, y + 0.16, z);
    dummy.scale.set(1, rand(0.6, 1.6), 1);
    dummy.rotation.set(rand(-0.15, 0.15), rand(0, 7), rand(-0.15, 0.15));
    dummy.updateMatrix(); grassMesh.setMatrixAt(i, dummy.matrix);
    gCol.setHSL(0.26 + rand(-0.03, 0.03), 0.5, 0.32 + rand(-0.06, 0.06));
    grassMesh.setColorAt(i, gCol);
  }, (x, y, z) =>
    y > 0 && y < 4 &&
    Math.hypot(x - SPOTS.pond.x, z - SPOTS.pond.z) > SPOTS.pond.r + 1 &&
    Math.hypot(x - SPOTS.house.x, z - SPOTS.house.z) > 8);
  group.add(grassMesh);

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

  // flowers
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

  // pond water (rippled each frame in updateEnvironment)
  waterGeo = new THREE.CircleGeometry(SPOTS.pond.r - 0.3, 40);
  const water = new THREE.Mesh(waterGeo,
    new THREE.MeshStandardMaterial({ color: 0x3d7a9e, transparent: true, opacity: 0.82, roughness: 0.08, metalness: 0.3 }));
  water.rotation.x = -Math.PI / 2;
  water.position.set(SPOTS.pond.x, WATER_LEVEL, SPOTS.pond.z);
  group.add(water);

  // bench facing the pond
  const woodMat = new THREE.MeshStandardMaterial({ color: 0x8a6a45, roughness: 1 });
  const benchY = terrainHeightAt(-15, -10.6);
  const seat = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.12, 0.55), woodMat);
  seat.position.set(-15, benchY + 0.5, -10.6); seat.castShadow = true;
  const back = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.55, 0.1), woodMat);
  back.position.set(-15, benchY + 0.95, -10.35);
  group.add(seat, back);
  for (const lx of [-0.9, 0.9]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.5, 0.5), woodMat);
    leg.position.set(-15 + lx, benchY + 0.25, -10.6);
    group.add(leg);
  }

  // stone path from the deck toward the farm gate
  const pathMat = new THREE.MeshStandardMaterial({ color: 0xa8a49a, roughness: 1 });
  const stones = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.45, 0.45, 0.09, 7), pathMat, 15);
  for (let i = 0; i < 15; i++) {
    const k = i / 14;
    const x = 0.5 + (-12.5 - 0.5) * k + rand(-0.3, 0.3);
    const z = 9 + (15 - 9) * k + rand(-0.3, 0.3);
    dummy.position.set(x, terrainHeightAt(x, z) + 0.06, z);
    dummy.scale.setScalar(rand(0.8, 1.2)); dummy.rotation.set(0, rand(0, 7), 0);
    dummy.updateMatrix(); stones.setMatrixAt(i, dummy.matrix);
  }
  group.add(stones);

  // campfire near the deck
  const fy = terrainHeightAt(CAMPFIRE.x, CAMPFIRE.z);
  CAMPFIRE.y = fy;
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2;
    const stone = new THREE.Mesh(new THREE.DodecahedronGeometry(0.22), pathMat);
    stone.position.set(CAMPFIRE.x + Math.cos(a) * 0.7, fy + 0.12, CAMPFIRE.z + Math.sin(a) * 0.7);
    group.add(stone);
  }
  for (const rot of [0.5, 2.1]) {
    const log = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 1, 6), woodMat);
    log.rotation.set(Math.PI / 2, 0, rot);
    log.position.set(CAMPFIRE.x, fy + 0.14, CAMPFIRE.z);
    group.add(log);
  }
  flame = new THREE.Mesh(
    new THREE.ConeGeometry(0.3, 0.8, 7),
    new THREE.MeshStandardMaterial({ color: 0xff8c2e, emissive: 0xff6a00, emissiveIntensity: 2, transparent: true, opacity: 0.9 }));
  flame.position.set(CAMPFIRE.x, fy + 0.55, CAMPFIRE.z);
  fireLight = new THREE.PointLight(0xff9a4d, 0, 14, 1.8);
  fireLight.position.set(CAMPFIRE.x, fy + 1, CAMPFIRE.z);
  group.add(flame, fireLight);

  // beehives + bees
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
  const beeMat = new THREE.MeshStandardMaterial({ color: 0xf2c14e, emissive: 0x604010, emissiveIntensity: 0.4 });
  for (let i = 0; i < 8; i++) {
    const bee = new THREE.Mesh(new THREE.SphereGeometry(0.06, 6, 5), beeMat);
    bee.userData = { phi: rand(0, 7), r: rand(0.8, 2.2), w: rand(1.5, 3), cx: SPOTS.hives.x + rand(-1.5, 1.5), cz: SPOTS.hives.z + rand(-0.5, 1.5) };
    bees.push(bee);
    group.add(bee);
  }

  // farm fence
  const { x: fx, z: fz } = SPOTS.farm;
  const W = 7, D = 5;
  const postsPos = [];
  for (let x = -W; x <= W; x += 2.33) postsPos.push([fx + x, fz - D], [fx + x, fz + D]);
  for (let z = -D + 2.5; z <= D - 1; z += 2.5) postsPos.push([fx - W, fz + z], [fx + W, fz + z]);
  const postMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(0.16, 1.1, 0.16), woodMat, postsPos.length);
  postsPos.forEach(([x, z], i) => {
    dummy.position.set(x, terrainHeightAt(x, z) + 0.5, z);
    dummy.scale.setScalar(1); dummy.rotation.set(0, 0, 0);
    dummy.updateMatrix(); postMesh.setMatrixAt(i, dummy.matrix);
  });
  postMesh.castShadow = true;
  group.add(postMesh);
  for (const dy of [0.45, 0.85]) {
    for (const pz of [fz - D, fz + D]) {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(W * 2, 0.07, 0.07), woodMat);
      rail.position.set(fx, SPOTS.farm.h + dy, pz); group.add(rail);
    }
    for (const px of [fx - W, fx + W]) {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.07, D * 2), woodMat);
      rail.position.set(px, SPOTS.farm.h + dy, fz); group.add(rail);
    }
  }

  // clouds
  const cloudMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, transparent: true, opacity: 0.88 });
  for (let i = 0; i < 8; i++) {
    const c = new THREE.Group();
    const n = 3 + Math.floor(rand(0, 3));
    for (let j = 0; j < n; j++) {
      const puff = new THREE.Mesh(new THREE.SphereGeometry(rand(2.2, 4), 8, 6), cloudMat);
      puff.position.set(rand(-4, 4), rand(-0.6, 0.6), rand(-2, 2));
      puff.scale.y = 0.5;
      c.add(puff);
    }
    c.position.set(rand(-SIZE / 2, SIZE / 2), rand(42, 60), rand(-SIZE / 2, SIZE / 2));
    c.userData.speed = rand(0.5, 1.4);
    clouds.push(c);
    group.add(c);
  }

  // stars
  const starPos = new Float32Array(800 * 3);
  for (let i = 0; i < 800; i++) {
    const a = rand(0, Math.PI * 2), e = rand(0.06, Math.PI / 2), r = 850;
    starPos[i * 3] = Math.cos(a) * Math.cos(e) * r;
    starPos[i * 3 + 1] = Math.sin(e) * r;
    starPos[i * 3 + 2] = Math.sin(a) * Math.cos(e) * r;
  }
  const starGeo = new THREE.BufferGeometry();
  starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
  starsMat = new THREE.PointsMaterial({ color: 0xdfe8ff, size: 1.6, sizeAttenuation: false, transparent: true, opacity: 0, fog: false });
  group.add(new THREE.Points(starGeo, starsMat));

  // fireflies around the pond, out at night
  fireflyBase = [];
  const ffPos = new Float32Array(42 * 3);
  for (let i = 0; i < 42; i++) {
    const x = SPOTS.pond.x + rand(-12, 12), z = SPOTS.pond.z + rand(-12, 12);
    const y = Math.max(terrainHeightAt(x, z), WATER_LEVEL) + rand(0.5, 2.2);
    fireflyBase.push([x, y, z, rand(0, 7)]);
    ffPos.set([x, y, z], i * 3);
  }
  const ffGeo = new THREE.BufferGeometry();
  ffGeo.setAttribute('position', new THREE.BufferAttribute(ffPos, 3));
  fireflies = new THREE.Points(ffGeo, new THREE.PointsMaterial({
    color: 0xb8ff7a, size: 3.2, sizeAttenuation: false, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false,
  }));
  group.add(fireflies);

  return group;
}

export function updateEnvironment(dt, t, dayness) {
  // water ripple
  const wp = waterGeo.attributes.position;
  for (let i = 0; i < wp.count; i++) {
    const r = Math.hypot(wp.getX(i), wp.getY(i));
    wp.setZ(i, Math.sin(r * 1.6 - t * 2.2) * 0.055);
  }
  wp.needsUpdate = true;

  // drifting clouds
  for (const c of clouds) {
    c.position.x += c.userData.speed * dt;
    if (c.position.x > SIZE / 2 + 30) c.position.x = -SIZE / 2 - 30;
  }

  // bees by day
  const beesOut = dayness > 0.12;
  for (const b of bees) {
    b.visible = beesOut;
    if (beesOut) {
      const u = b.userData;
      b.position.set(
        u.cx + Math.cos(t * u.w + u.phi) * u.r,
        terrainHeightAt(u.cx, u.cz) + 1.2 + Math.sin(t * 2.3 + u.phi) * 0.35,
        u.cz + Math.sin(t * u.w + u.phi) * u.r);
    }
  }

  // stars + fireflies at night
  const night = Math.max(0, 1 - dayness * 4);
  starsMat.opacity = night * 0.95;
  fireflies.material.opacity = night * (0.55 + Math.sin(t * 3) * 0.25);
  const fp = fireflies.geometry.attributes.position;
  for (let i = 0; i < fireflyBase.length; i++) {
    const [x, y, z, phi] = fireflyBase[i];
    fp.setXYZ(i,
      x + Math.sin(t * 0.7 + phi) * 1.2,
      y + Math.sin(t * 1.3 + phi * 2) * 0.4,
      z + Math.cos(t * 0.5 + phi) * 1.2);
  }
  fp.needsUpdate = true;

  // campfire burns in the evening and night
  const fire = dayness < 0.35 ? 1 : 0;
  flame.visible = fire > 0;
  if (flame.visible) {
    const flicker = 1 + Math.sin(t * 11) * 0.12 + Math.sin(t * 23 + 1) * 0.07;
    flame.scale.set(flicker, flicker * (1 + Math.sin(t * 7) * 0.15), flicker);
    fireLight.intensity = 2.2 * flicker;
  } else fireLight.intensity = 0;
}
