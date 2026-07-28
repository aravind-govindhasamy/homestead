import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

// ---------- scene core ----------
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x87b5d9);
scene.fog = new THREE.Fog(0x87b5d9, 80, 220);

const camera = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, 0.1, 500);
camera.position.set(30, 25, 30);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(innerWidth, innerHeight);
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
document.body.appendChild(renderer.domElement);

const controls = new OrbitControls(camera, renderer.domElement);
controls.maxPolarAngle = Math.PI / 2.1;
controls.maxDistance = 150;

const hemi = new THREE.HemisphereLight(0xbfd9ff, 0x556b3f, 0.7);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xfff2d8, 1.6);
sun.castShadow = true;
sun.shadow.camera.left = sun.shadow.camera.bottom = -60;
sun.shadow.camera.right = sun.shadow.camera.top = 60;
scene.add(sun);

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

// ---------- terrain ----------
// ponytail: inline value noise, no noise library; swap for simplex if terrain gets boring
const SIZE = 100, SEGS = 128;
function noise2(x, y) {
  const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return s - Math.floor(s);
}
function valueNoise(x, y) {
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const a = noise2(xi, yi), b = noise2(xi + 1, yi), c = noise2(xi, yi + 1), d = noise2(xi + 1, yi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
function baseHeight(x, z) {
  return valueNoise(x * 0.03 + 10, z * 0.03 + 10) * 6 + valueNoise(x * 0.1, z * 0.1) * 1.5 - 3;
}

const terrainGeo = new THREE.PlaneGeometry(SIZE, SIZE, SEGS, SEGS);
terrainGeo.rotateX(-Math.PI / 2);
const pos = terrainGeo.attributes.position;
for (let i = 0; i < pos.count; i++) pos.setY(i, baseHeight(pos.getX(i), pos.getZ(i)));
terrainGeo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(pos.count * 3), 3));

const grass = new THREE.Color(0x5c8a3a), dirt = new THREE.Color(0x8a6d4a), rock = new THREE.Color(0x888888);
function recolorTerrain() {
  const col = terrainGeo.attributes.color;
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const h = pos.getY(i);
    if (h < 0.5) c.copy(dirt);
    else if (h > 4) c.copy(rock);
    else c.copy(grass);
    c.offsetHSL(0, 0, (noise2(i, 7) - 0.5) * 0.05);
    col.setXYZ(i, c.r, c.g, c.b);
  }
  col.needsUpdate = true;
}
recolorTerrain();
terrainGeo.computeVertexNormals();

const terrain = new THREE.Mesh(terrainGeo, new THREE.MeshLambertMaterial({ vertexColors: true }));
terrain.receiveShadow = true;
scene.add(terrain);

function terrainHeightAt(x, z) {
  // nearest-vertex sample; good enough for characters on gentle terrain
  const gx = Math.round((x / SIZE + 0.5) * SEGS), gz = Math.round((z / SIZE + 0.5) * SEGS);
  const cx = Math.max(0, Math.min(SEGS, gx)), cz = Math.max(0, Math.min(SEGS, gz));
  return pos.getY(cz * (SEGS + 1) + cx);
}

// ---------- day/night clock ----------
let dayTime = 8; // hours, 0..24
const GAME_HOURS_PER_SEC = 0.2; // 2-minute full day
function updateSun() {
  const angle = ((dayTime - 6) / 24) * Math.PI * 2; // sunrise at 6
  sun.position.set(Math.cos(angle) * 60, Math.sin(angle) * 60, 20);
  const dayness = Math.max(0, Math.sin(angle));
  sun.intensity = 1.6 * dayness;
  hemi.intensity = 0.15 + 0.55 * dayness;
  const skyCol = new THREE.Color().lerpColors(new THREE.Color(0x0b1026), new THREE.Color(0x87b5d9), dayness);
  scene.background = skyCol;
  scene.fog.color = skyCol;
}

// ---------- building modules ----------
const MODULE_DEFS = {
  wall:  { size: [2, 2.4, 0.25], yOff: 1.2,  color: 0xd9c8a9 },
  floor: { size: [2, 0.2, 2],    yOff: 0.1,  color: 0x9a7b52 },
  roof:  { size: [2.2, 0.3, 2.2], yOff: 2.7, color: 0x8a3b2e },
};
const GRID = 2;
const modules = []; // {type, x, z, mesh}
const moduleGroup = new THREE.Group();
scene.add(moduleGroup);

function makeModuleMesh(type, ghost = false) {
  const d = MODULE_DEFS[type];
  const mat = new THREE.MeshLambertMaterial({ color: d.color, transparent: ghost, opacity: ghost ? 0.5 : 1 });
  const m = new THREE.Mesh(new THREE.BoxGeometry(...d.size), mat);
  m.castShadow = m.receiveShadow = !ghost;
  return m;
}
function placeModule(type, x, z) {
  const mesh = makeModuleMesh(type);
  mesh.position.set(x, terrainHeightAt(x, z) + MODULE_DEFS[type].yOff, z);
  moduleGroup.add(mesh);
  modules.push({ type, x, z, mesh });
}
function removeModuleByMesh(mesh) {
  const i = modules.findIndex(m => m.mesh === mesh);
  if (i >= 0) { moduleGroup.remove(mesh); modules.splice(i, 1); }
}

// starter cabin so the scene isn't empty
[[0, 0], [2, 0], [0, 2], [2, 2]].forEach(([x, z]) => placeModule('floor', x, z));
[[-1, 0], [-1, 2], [3, 0], [3, 2]].forEach(([x, z]) => placeModule('wall', x, z));
[[0, 0], [2, 0], [0, 2], [2, 2]].forEach(([x, z]) => placeModule('roof', x, z));

// ---------- NPCs ----------
// ponytail: waypoint FSM, no navmesh/Yuka; add three-pathfinding when obstacles matter
const TASK_POINTS = {
  field: new THREE.Vector3(-20, 0, 15),
  hives: new THREE.Vector3(18, 0, -18),
  home: new THREE.Vector3(1, 0, 1),
  pond: new THREE.Vector3(-15, 0, -20),
};
const npcs = [
  { name: 'Alice', role: 'farmer', color: 0xc94f7c, tasks: ['field', 'pond', 'field', 'home'], awake: [6, 18] },
  { name: 'Bob', role: 'beekeeper', color: 0x4f7cc9, tasks: ['hives', 'home', 'hives', 'pond'], awake: [7, 19] },
].map((n, i) => {
  const mesh = new THREE.Mesh(
    new THREE.CapsuleGeometry(0.4, 0.9, 4, 8),
    new THREE.MeshLambertMaterial({ color: n.color })
  );
  mesh.castShadow = true;
  scene.add(mesh);
  return { ...n, mesh, x: 1 + i * 2, z: 1, state: 'idle', taskIdx: 0, workTimer: 0 };
});

function updateNPC(n, dt) {
  const awake = dayTime >= n.awake[0] && dayTime < n.awake[1];
  const targetName = awake ? n.tasks[n.taskIdx] : 'home';
  const target = TASK_POINTS[targetName];
  const dx = target.x - n.x, dz = target.z - n.z;
  const dist = Math.hypot(dx, dz);

  if (n.state === 'work') {
    n.workTimer -= dt;
    if (n.workTimer <= 0) { n.taskIdx = (n.taskIdx + 1) % n.tasks.length; n.state = 'idle'; }
  } else if (dist > 0.5) {
    n.state = 'walk';
    const speed = 3;
    n.x += (dx / dist) * speed * dt;
    n.z += (dz / dist) * speed * dt;
    n.mesh.rotation.y = Math.atan2(dx, dz);
  } else if (awake) {
    n.state = 'work';
    n.workTimer = 3;
  } else {
    n.state = 'idle'; // asleep at home
  }
  n.mesh.position.set(n.x, terrainHeightAt(n.x, n.z) + 1.05, n.z);
  n.status = awake ? `${n.state === 'work' ? 'working at' : 'heading to'} ${targetName}` : 'sleeping';
}

// ---------- input: modes, sculpt, build ----------
let mode = 'view';
let brushDir = 1;
let buildType = 'wall';
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
let ghost = null;
let sculpting = false;

const $ = id => document.getElementById(id);
function setMode(m) {
  mode = m;
  ['view', 'sculpt', 'build'].forEach(x => $('mode-' + x).classList.toggle('active', x === m));
  $('sculpt-opts').hidden = m !== 'sculpt';
  $('build-opts').hidden = m !== 'build';
  controls.enableRotate = m === 'view';
  controls.enablePan = m === 'view';
  if (ghost) { scene.remove(ghost); ghost = null; }
  if (m === 'build') { ghost = makeModuleMesh(buildType, true); scene.add(ghost); }
}
$('mode-view').onclick = () => setMode('view');
$('mode-sculpt').onclick = () => setMode('sculpt');
$('mode-build').onclick = () => setMode('build');
$('brush-raise').onclick = () => { brushDir = 1; $('brush-raise').classList.add('active'); $('brush-lower').classList.remove('active'); };
$('brush-lower').onclick = () => { brushDir = -1; $('brush-lower').classList.add('active'); $('brush-raise').classList.remove('active'); };
for (const t of ['wall', 'floor', 'roof']) {
  $('mod-' + t).onclick = () => {
    buildType = t;
    ['wall', 'floor', 'roof'].forEach(x => $('mod-' + x).classList.toggle('active', x === t));
    if (ghost) { scene.remove(ghost); ghost = makeModuleMesh(t, true); scene.add(ghost); }
  };
}

function pickTerrain(e) {
  pointer.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
  raycaster.setFromCamera(pointer, camera);
  return raycaster.intersectObject(terrain)[0] || null;
}

function sculptAt(point) {
  const radius = 5, strength = 3;
  for (let i = 0; i < pos.count; i++) {
    const d = Math.hypot(pos.getX(i) - point.x, pos.getZ(i) - point.z);
    if (d < radius) {
      const falloff = Math.cos((d / radius) * Math.PI * 0.5) ** 2;
      pos.setY(i, pos.getY(i) + brushDir * strength * falloff * 0.05);
    }
  }
  pos.needsUpdate = true;
  terrainGeo.computeVertexNormals();
  recolorTerrain();
  // keep placed modules and NPCs glued to the ground
  for (const m of modules) m.mesh.position.y = terrainHeightAt(m.x, m.z) + MODULE_DEFS[m.type].yOff;
}

renderer.domElement.addEventListener('pointerdown', e => {
  if (mode === 'sculpt' && e.button === 0) {
    sculpting = true;
    const hit = pickTerrain(e);
    if (hit) sculptAt(hit.point);
  } else if (mode === 'build') {
    if (e.button === 0) {
      const hit = pickTerrain(e);
      if (hit) placeModule(buildType, Math.round(hit.point.x / GRID) * GRID, Math.round(hit.point.z / GRID) * GRID);
    } else if (e.button === 2) {
      pointer.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
      raycaster.setFromCamera(pointer, camera);
      const hit = raycaster.intersectObjects(moduleGroup.children)[0];
      if (hit) removeModuleByMesh(hit.object);
    }
  }
});
addEventListener('pointerup', () => (sculpting = false));
renderer.domElement.addEventListener('pointermove', e => {
  if (mode === 'sculpt' && sculpting) {
    const hit = pickTerrain(e);
    if (hit) sculptAt(hit.point);
  } else if (mode === 'build' && ghost) {
    const hit = pickTerrain(e);
    if (hit) {
      const x = Math.round(hit.point.x / GRID) * GRID, z = Math.round(hit.point.z / GRID) * GRID;
      ghost.position.set(x, terrainHeightAt(x, z) + MODULE_DEFS[buildType].yOff, z);
    }
  }
});
renderer.domElement.addEventListener('contextmenu', e => { if (mode === 'build') e.preventDefault(); });

// ---------- save / load ----------
// ponytail: localStorage only; swap for a backend/Firebase when cloud sync is real
const SAVE_KEY = 'homestead-save';
$('save').onclick = () => {
  const heights = Array.from({ length: pos.count }, (_, i) => Math.round(pos.getY(i) * 100) / 100);
  const data = {
    heights,
    modules: modules.map(m => ({ type: m.type, x: m.x, z: m.z })),
    npcs: npcs.map(n => ({ x: n.x, z: n.z, taskIdx: n.taskIdx })),
    dayTime,
  };
  localStorage.setItem(SAVE_KEY, JSON.stringify(data));
  $('status').textContent = 'Saved.';
};
$('load').onclick = () => {
  const raw = localStorage.getItem(SAVE_KEY);
  if (!raw) { $('status').textContent = 'No save found.'; return; }
  const data = JSON.parse(raw);
  data.heights.forEach((h, i) => pos.setY(i, h));
  pos.needsUpdate = true;
  terrainGeo.computeVertexNormals();
  recolorTerrain();
  while (modules.length) removeModuleByMesh(modules[0].mesh);
  data.modules.forEach(m => placeModule(m.type, m.x, m.z));
  data.npcs.forEach((s, i) => Object.assign(npcs[i], s));
  dayTime = data.dayTime;
  $('status').textContent = 'Loaded.';
};

// ---------- main loop ----------
const clock = new THREE.Clock();
function tick() {
  requestAnimationFrame(tick);
  const dt = Math.min(clock.getDelta(), 0.1);
  dayTime = (dayTime + dt * GAME_HOURS_PER_SEC) % 24;
  updateSun();
  for (const n of npcs) updateNPC(n, dt);
  const hh = String(Math.floor(dayTime)).padStart(2, '0');
  const mm = String(Math.floor((dayTime % 1) * 60)).padStart(2, '0');
  $('status').textContent =
    `Time ${hh}:${mm}\n` + npcs.map(n => `${n.name} (${n.role}): ${n.status}`).join('\n');
  controls.update();
  renderer.render(scene, camera);
}
setMode('view');
tick();
