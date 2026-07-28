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
const _goldenColor = new THREE.Color(0xff7020);
export const SEASONS = ['Spring', 'Summer', 'Autumn', 'Winter'];
export function getSeason(day) { return Math.floor(((day - 1) % 120) / 30); }

export function updateDay(dayTime, scene) {
  const angle = ((dayTime - 6) / 24) * Math.PI * 2; // sunrise at 6
  sunDir.set(Math.cos(angle), Math.sin(angle), 0.35).normalize();
  sky.material.uniforms.sunPosition.value.copy(sunDir);
  sun.position.copy(sunDir).multiplyScalar(90);
  const dayness = Math.max(0, sunDir.y);
  // golden hour: sun turns orange near the horizon (dawn and dusk)
  const golden = Math.max(0, 1 - Math.abs(sunDir.y) * 7) * (1 - weather.rain * 0.5);
  sun.color.set(0xfff1dc).lerp(_goldenColor, golden * 0.75);
  sky.material.uniforms.rayleigh.value = 1.8 + golden * 2.0;
  const clear = 1 - weather.rain * 0.6;
  sun.intensity = 3 * dayness * clear;
  moon.intensity = 0.3 * Math.max(0, 1 - dayness * 4);
  moon.position.set(-sunDir.x * 80, Math.max(25, -sunDir.y * 80), -sunDir.z * 80);
  hemi.intensity = (0.12 + 0.55 * dayness) * (1 - weather.rain * 0.25);
  sky.material.uniforms.turbidity.value = 6 + weather.rain * 14;
  // morning mist peaks just after sunrise (hour ~7), dissipates by 9
  const mistFactor = Math.max(0, 1 - Math.abs(dayTime - 7) / 2) * Math.min(1, dayness * 5) * (1 - weather.rain * 0.8);
  scene.fog.near = Math.max(3, 80 - mistFactor * 77);
  scene.fog.far = 320 - weather.rain * 150 - mistFactor * 150;
  // fog color: night dark → dawn/dusk amber → midday blue-white
  const dawnDusk = Math.max(0, 1 - Math.abs(sunDir.y) * 5) * 0.75;
  const dayFogColor = new THREE.Color(0xbfd4e0).lerp(new THREE.Color(0xffcca0), dawnDusk);
  scene.fog.color.lerpColors(new THREE.Color(0x0a0e1c), dayFogColor, dayness * (1 - weather.rain * 0.3));
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
let waterGeo, clouds = [], bees = [], butterflies = [], birds = [],
  fireflies, fireflyBase, starsMat, flame, fireLight;
let rainPts, rainVel = [];
let snowPts, snowVel = [], snowDrift = [];
let seasonalPts, seasonalVel = [], seasonalDrift = []; // leaves in autumn, petals in spring
let leafMat, grassInstMat; // updated each frame for seasonal color
let torchLights = []; // {pl: PointLight, fl: flame mesh} — path torches
export const CAMPFIRE = new THREE.Vector3(8.5, 0, 8.5);

// ponytail: coin-flip weather, no fronts or forecast; add a pressure sim never
export const weather = { rain: 0, target: 0, timer: 20 };

export function buildScenery() {
  const group = new THREE.Group();

  // trees
  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x6e4f30, roughness: 1 });
  leafMat = new THREE.MeshStandardMaterial({ color: 0x4e7d33, roughness: 0.9 });
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

  // a few hand-placed trees framing the house
  for (const [tx, tz, s] of [[9.5, -5, 1.3], [-9, -6.5, 1.1], [11.5, 3, 0.9]]) {
    const ty = terrainHeightAt(tx, tz);
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.32, 2.4 * s, 6), trunkMat);
    trunk.position.set(tx, ty + 1.2 * s, tz); trunk.castShadow = true;
    const canopy = new THREE.Mesh(new THREE.IcosahedronGeometry(1.7 * s, 1), leafMat);
    canopy.position.set(tx, ty + 2.9 * s, tz); canopy.castShadow = true;
    group.add(trunk, canopy);
  }

  // grass tufts everywhere the ground is grassy
  const N_GRASS = 4200;
  grassInstMat = new THREE.MeshStandardMaterial({ color: 0x69a144, roughness: 1 });
  const grassMesh = new THREE.InstancedMesh(new THREE.ConeGeometry(0.07, 0.45, 4), grassInstMat, N_GRASS);
  const gCol = new THREE.Color();
  scatter(N_GRASS, ([x, y, z], i) => {
    dummy.position.set(x, y + 0.16, z);
    dummy.scale.set(1, rand(0.6, 1.6), 1);
    dummy.rotation.set(rand(-0.15, 0.15), rand(0, 7), rand(-0.15, 0.15));
    dummy.updateMatrix(); grassMesh.setMatrixAt(i, dummy.matrix);
    gCol.setHSL(0.26, 0.3, rand(0.45, 0.75)); // multiplied with base green
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
    new THREE.MeshStandardMaterial({ color: 0x2a6888, transparent: true, opacity: 0.88, roughness: 0.04, metalness: 0.55, envMapIntensity: 1.2 }));
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

  // path torches lit at dusk, along the stone path toward the farm
  const flameMat = new THREE.MeshStandardMaterial({
    color: 0xff8c2e, emissive: 0xff6a00, emissiveIntensity: 2, transparent: true, opacity: 0.9,
  });
  for (const [tx, tz] of [[0, 9.8], [-4, 11.5], [-8, 13], [-11, 14.2]]) {
    const ty = terrainHeightAt(tx, tz);
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.09, 1.5, 5), woodMat);
    pole.position.set(tx, ty + 0.75, tz);
    const fl = new THREE.Mesh(new THREE.ConeGeometry(0.11, 0.28, 5), flameMat.clone());
    fl.position.set(tx, ty + 1.6, tz);
    const pl = new THREE.PointLight(0xff9a4d, 0, 9, 2);
    pl.position.set(tx, ty + 1.65, tz);
    torchLights.push({ pl, fl, ox: tx });
    group.add(pole, fl, pl);
  }

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

  // butterflies fluttering over the meadow by day
  const bfCols = [0xf2b5d4, 0xfff3c4, 0xa8d8ea, 0xffb347];
  for (let i = 0; i < 8; i++) {
    const bf = new THREE.Mesh(
      new THREE.SphereGeometry(0.09, 6, 5),
      new THREE.MeshStandardMaterial({ color: bfCols[i % 4], emissive: bfCols[i % 4], emissiveIntensity: 0.25 }));
    bf.scale.set(1.4, 0.35, 1);
    const cx = rand(-35, 35), cz = rand(-35, 35);
    bf.userData = { phi: rand(0, 7), r: rand(2, 6), w: rand(0.4, 0.9), cx, cz };
    butterflies.push(bf);
    group.add(bf);
  }

  // rain: recycled particle box that follows nobody — big enough to cover the play area
  const N_RAIN = 1400;
  const rp = new Float32Array(N_RAIN * 3);
  for (let i = 0; i < N_RAIN; i++) {
    rp.set([rand(-45, 45), rand(0, 30), rand(-45, 45)], i * 3);
    rainVel.push(rand(18, 26));
  }
  const rainGeo = new THREE.BufferGeometry();
  rainGeo.setAttribute('position', new THREE.BufferAttribute(rp, 3));
  rainPts = new THREE.Points(rainGeo, new THREE.PointsMaterial({
    color: 0x9db8cc, size: 1.8, sizeAttenuation: false, transparent: true, opacity: 0, depthWrite: false,
  }));
  group.add(rainPts);

  // snow: slow drifting flakes for winter (updateEnvironment drives opacity)
  const N_SNOW = 700;
  const snowBuf = new Float32Array(N_SNOW * 3);
  for (let i = 0; i < N_SNOW; i++) {
    snowBuf.set([rand(-50, 50), rand(0, 32), rand(-50, 50)], i * 3);
    snowVel.push(rand(3, 7));
    snowDrift.push(rand(0, Math.PI * 2));
  }
  const snowGeo = new THREE.BufferGeometry();
  snowGeo.setAttribute('position', new THREE.BufferAttribute(snowBuf, 3));
  snowPts = new THREE.Points(snowGeo, new THREE.PointsMaterial({
    color: 0xe8eeff, size: 2.2, sizeAttenuation: false, transparent: true, opacity: 0, depthWrite: false,
  }));
  group.add(snowPts);

  // seasonal particles: autumn leaves (amber) or spring petals (pink)
  const N_SEASONAL = 400;
  const seaBuf = new Float32Array(N_SEASONAL * 3);
  for (let i = 0; i < N_SEASONAL; i++) {
    seaBuf.set([rand(-50, 50), rand(0, 28), rand(-50, 50)], i * 3);
    seasonalVel.push(rand(1.2, 3.2));
    seasonalDrift.push(rand(0, Math.PI * 2));
  }
  const seaGeo = new THREE.BufferGeometry();
  seaGeo.setAttribute('position', new THREE.BufferAttribute(seaBuf, 3));
  seasonalPts = new THREE.Points(seaGeo, new THREE.PointsMaterial({
    color: 0xd4802a, size: 3.8, sizeAttenuation: false, transparent: true, opacity: 0, depthWrite: false,
  }));
  group.add(seasonalPts);

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

  // birds: small dark fliers circling above the terrain
  const birdMat = new THREE.MeshStandardMaterial({ color: 0x1a1a1a });
  for (let i = 0; i < 7; i++) {
    const bird = new THREE.Mesh(new THREE.SphereGeometry(0.3, 5, 3), birdMat);
    bird.scale.set(0.9, 0.16, 0.4);
    bird.userData = { phase: (i / 7) * Math.PI * 2, r: 20 + (i % 3) * 7, spd: 0.28 + i * 0.035, dy: i * 1.3 };
    birds.push(bird);
    group.add(bird);
  }

  return group;
}

export function updateEnvironment(dt, t, dayness, day = 1) {
  const season = getSeason(day);
  // weather: rain chance varies by season (wetter in spring/autumn, drier summer, snowy winter)
  weather.timer -= dt;
  if (weather.timer <= 0) {
    const rainChance = [0.35, 0.12, 0.45, 0.25][season];
    weather.target = weather.target > 0 ? 0 : (Math.random() < rainChance ? 1 : 0);
    weather.timer = weather.target ? rand(25, 45) : rand(35, 80);
  }
  weather.rain += (weather.target - weather.rain) * Math.min(1, dt * 0.4);

  // rain falls only outside winter; winter gets snow instead
  const isWinter = season === 3;
  rainPts.material.opacity = isWinter ? 0 : weather.rain * 0.55;
  if (!isWinter && weather.rain > 0.02) {
    const rpp = rainPts.geometry.attributes.position;
    for (let i = 0; i < rainVel.length; i++) {
      let y = rpp.getY(i) - rainVel[i] * dt;
      if (y < 0) y = 28;
      rpp.setY(i, y);
    }
    rpp.needsUpdate = true;
  }

  // snow drifts gently in winter
  const snowAmt = isWinter ? (0.35 + weather.rain * 0.65) : 0;
  snowPts.material.opacity = snowAmt * 0.72;
  if (snowAmt > 0.02) {
    const sp = snowPts.geometry.attributes.position;
    for (let i = 0; i < snowVel.length; i++) {
      const x = sp.getX(i) + Math.sin(t * 0.4 + snowDrift[i]) * 0.08;
      const y = sp.getY(i) - snowVel[i] * dt;
      sp.setXYZ(i, x, y < 0 ? 30 : y, sp.getZ(i));
    }
    sp.needsUpdate = true;
  }

  // seasonal falling particles: amber leaves in autumn, pink petals in spring
  const isAutumn = season === 2, isSpring = season === 0;
  const seaAmt = isAutumn ? 0.75 : (isSpring ? 0.45 : 0);
  seasonalPts.material.opacity = seaAmt;
  if (seaAmt > 0) {
    seasonalPts.material.color.setHex(isSpring ? 0xffb8cc : 0xd4802a);
    const sp = seasonalPts.geometry.attributes.position;
    for (let i = 0; i < seasonalVel.length; i++) {
      const x = sp.getX(i) + Math.sin(t * 0.9 + seasonalDrift[i]) * 0.18;
      const y = sp.getY(i) - seasonalVel[i] * dt;
      sp.setXYZ(i, x, y < 0 ? 27 : y, sp.getZ(i));
    }
    sp.needsUpdate = true;
  }

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

  // butterflies by fair day, sheltering in rain
  const bfOut = dayness > 0.15 && weather.rain < 0.5;
  for (const bf of butterflies) {
    bf.visible = bfOut;
    if (bfOut) {
      const u = bf.userData;
      const x = u.cx + Math.cos(t * u.w + u.phi) * u.r;
      const z = u.cz + Math.sin(t * u.w * 1.3 + u.phi) * u.r;
      bf.position.set(x, terrainHeightAt(x, z) + 1 + Math.sin(t * 4 + u.phi) * 0.35, z);
      bf.rotation.z = Math.sin(t * 14 + u.phi) * 0.6; // wing flutter
    }
  }

  // bees by day, home in rain
  const beesOut = dayness > 0.12 && weather.rain < 0.5;
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

  // path torches flicker at dusk/night
  const torchOn = dayness < 0.28;
  for (const { pl, fl, ox } of torchLights) {
    fl.visible = torchOn;
    pl.intensity = torchOn ? (1.6 + Math.sin(t * 13.7 + ox) * 0.18 + Math.sin(t * 31.3 + ox * 2) * 0.08) : 0;
  }

  // seasonal foliage colors: spring green → summer deep → autumn amber → winter dormant
  const leafColors = [0x5d9a3a, 0x4e7d33, 0xc87820, 0x6a7560];
  const grassColors = [0x7ab848, 0x5d9a30, 0xa0872a, 0x7a8068];
  leafMat.color.setHex(leafColors[season]);
  grassInstMat.color.setHex(grassColors[season]);

  // birds circle during the day, hide at night and in heavy rain
  const birdsActive = dayness > 0.08 && weather.rain < 0.7;
  for (const b of birds) {
    b.visible = birdsActive;
    if (birdsActive) {
      const u = b.userData;
      const a = t * u.spd + u.phase;
      b.position.set(Math.cos(a) * u.r, 18 + Math.sin(t * 0.6 + u.dy) * 3, Math.sin(a) * u.r);
      b.rotation.y = a + Math.PI / 2;
    }
  }
}
