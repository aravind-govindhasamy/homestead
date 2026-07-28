import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { terrain, sculptAt } from './terrain.js';
import {
  MODULE_DEFS, snap, moduleGroup, makeModuleMesh,
  placeModule, removeModuleByMesh, reglueModules,
} from './buildings.js';
import { npcs, updateNPC } from './npcs.js';
import { saveGame, loadGame } from './save.js';

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
const sun = new THREE.DirectionalLight(0xfff2d8, 1.6);
sun.castShadow = true;
sun.shadow.camera.left = sun.shadow.camera.bottom = -60;
sun.shadow.camera.right = sun.shadow.camera.top = 60;
scene.add(hemi, sun, terrain, moduleGroup, ...npcs.map(n => n.mesh));

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

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
$('save').onclick = () => {
  saveGame(dayTime);
  $('status').textContent = 'Saved.';
};
$('load').onclick = () => {
  const t = loadGame();
  if (t === null) { $('status').textContent = 'No valid save found.'; return; }
  dayTime = t;
  $('status').textContent = 'Loaded.';
};

function pickTerrain(e) {
  pointer.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
  raycaster.setFromCamera(pointer, camera);
  return raycaster.intersectObject(terrain)[0] || null;
}

renderer.domElement.addEventListener('pointerdown', e => {
  if (mode === 'sculpt' && e.button === 0) {
    sculpting = true;
    const hit = pickTerrain(e);
    if (hit) { sculptAt(hit.point, brushDir); reglueModules(); }
  } else if (mode === 'build') {
    if (e.button === 0) {
      const hit = pickTerrain(e);
      if (hit) placeModule(buildType, snap(hit.point.x), snap(hit.point.z));
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
    if (hit) { sculptAt(hit.point, brushDir); reglueModules(); }
  } else if (mode === 'build' && ghost) {
    const hit = pickTerrain(e);
    if (hit) {
      const x = snap(hit.point.x), z = snap(hit.point.z);
      ghost.position.set(x, hit.point.y + MODULE_DEFS[buildType].yOff, z);
    }
  }
});
renderer.domElement.addEventListener('contextmenu', e => { if (mode === 'build') e.preventDefault(); });

// ---------- main loop ----------
const clock = new THREE.Clock();
function tick() {
  requestAnimationFrame(tick);
  const dt = Math.min(clock.getDelta(), 0.1);
  dayTime = (dayTime + dt * GAME_HOURS_PER_SEC) % 24;
  updateSun();
  for (const n of npcs) updateNPC(n, dt, dayTime);
  const hh = String(Math.floor(dayTime)).padStart(2, '0');
  const mm = String(Math.floor((dayTime % 1) * 60)).padStart(2, '0');
  $('status').textContent =
    `Time ${hh}:${mm}\n` + npcs.map(n => `${n.name} (${n.role}): ${n.status}`).join('\n');
  controls.update();
  renderer.render(scene, camera);
}
setMode('view');
tick();
