import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { terrain, terrainHeightAt, sculptAt } from './terrain.js';
import { sky, sun, hemi, updateDay, configureRenderer, buildScenery } from './environment.js';
import { createHouse } from './house.js';
import { createFarm, updateFarm, interactFarm } from './farm.js';
import { createPlayer, updatePlayer } from './player.js';
import {
  MODULE_DEFS, snap, moduleGroup, makeModuleMesh,
  placeModule, removeModuleByMesh, reglueModules,
} from './buildings.js';
import { npcs, updateNPC } from './npcs.js';
import { saveGame, loadGame } from './save.js';

// ---------- scene core ----------
const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0xbfd4e0, 90, 320);

const camera = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, 0.1, 1000);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(innerWidth, innerHeight);
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
configureRenderer(renderer);
document.body.appendChild(renderer.domElement);

const house = createHouse();
const player = createPlayer();
scene.add(sky, sun, hemi, terrain, moduleGroup, house, createFarm(), buildScenery(),
  player.group, ...npcs.map(n => n.group));

const controls = new OrbitControls(camera, renderer.domElement);
controls.maxPolarAngle = Math.PI / 2.05;
controls.maxDistance = 180;
controls.enabled = false;

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

// ---------- state ----------
let dayTime = 8; // hours, 0..24
const GAME_HOURS_PER_SEC = 0.1; // 4-minute full day
let harvested = 0;
let mode = 'play';
let brushDir = 1;
let buildType = 'wall';
let camYaw = 0.6, camPitch = 0.42, camDist = 9;
const input = { fwd: 0, side: 0, run: false };
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
let ghost = null;
let sculpting = false;
let dragging = false;

const $ = id => document.getElementById(id);
function toast(msg) {
  const el = $('toast');
  el.textContent = msg;
  el.style.opacity = 1;
  clearTimeout(el._t);
  el._t = setTimeout(() => (el.style.opacity = 0), 1600);
}

// ---------- modes ----------
const HINTS = {
  play: 'WASD move · Shift run · drag to look · scroll zoom · E plant/harvest at the farm',
  orbit: 'Drag to orbit · scroll zoom · right-drag pan',
  sculpt: 'Left-drag to sculpt terrain · scroll zoom',
  build: 'Click to place · right-click to remove · scroll zoom',
};
function setMode(m) {
  mode = m;
  ['play', 'orbit', 'sculpt', 'build'].forEach(x => $('mode-' + x).classList.toggle('active', x === m));
  $('sculpt-opts').hidden = m !== 'sculpt';
  $('build-opts').hidden = m !== 'build';
  $('hint').textContent = HINTS[m];
  controls.enabled = m !== 'play';
  controls.enableRotate = m === 'orbit';
  controls.enablePan = m === 'orbit';
  if (m !== 'play') controls.target.set(player.x, terrainHeightAt(player.x, player.z) + 1, player.z);
  if (ghost) { scene.remove(ghost); ghost = null; }
  if (m === 'build') { ghost = makeModuleMesh(buildType, true); scene.add(ghost); }
}
$('mode-play').onclick = () => setMode('play');
$('mode-orbit').onclick = () => setMode('orbit');
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
$('save').onclick = () => { saveGame(dayTime, player, harvested); toast('Game saved'); };
$('load').onclick = () => {
  const s = loadGame();
  if (!s) { toast('No valid save found'); return; }
  dayTime = s.dayTime;
  player.x = s.player.x; player.z = s.player.z;
  harvested = s.harvested;
  toast('Game loaded');
};

// ---------- input ----------
const KEYMAP = { KeyW: 'fwd+', KeyS: 'fwd-', KeyD: 'side+', KeyA: 'side-' };
addEventListener('keydown', e => {
  if (e.repeat) return;
  if (e.code in KEYMAP) {
    const k = KEYMAP[e.code];
    input[k.slice(0, -1)] += k.endsWith('+') ? 1 : -1;
  } else if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') input.run = true;
  else if (e.code === 'KeyE' && mode === 'play') {
    const msg = interactFarm(player.x, player.z);
    if (msg === 'harvest') { harvested++; toast('Harvested! 🎃'); }
    else if (msg) toast(msg);
  }
});
addEventListener('keyup', e => {
  if (e.code in KEYMAP) {
    const k = KEYMAP[e.code];
    input[k.slice(0, -1)] -= k.endsWith('+') ? 1 : -1;
  } else if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') input.run = false;
});
addEventListener('blur', () => { input.fwd = 0; input.side = 0; input.run = false; });

function pickTerrain(e) {
  pointer.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
  raycaster.setFromCamera(pointer, camera);
  return raycaster.intersectObject(terrain)[0] || null;
}

renderer.domElement.addEventListener('pointerdown', e => {
  if (mode === 'play' && e.button === 0) dragging = true;
  else if (mode === 'sculpt' && e.button === 0) {
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
addEventListener('pointerup', () => { sculpting = false; dragging = false; });
renderer.domElement.addEventListener('pointermove', e => {
  if (mode === 'play' && dragging) {
    camYaw -= e.movementX * 0.0055;
    camPitch = Math.max(0.08, Math.min(1.25, camPitch + e.movementY * 0.0045));
  } else if (mode === 'sculpt' && sculpting) {
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
renderer.domElement.addEventListener('wheel', e => {
  if (mode === 'play') camDist = Math.max(4, Math.min(18, camDist + e.deltaY * 0.01));
});
renderer.domElement.addEventListener('contextmenu', e => { if (mode === 'build') e.preventDefault(); });

// ---------- third-person camera ----------
const camTarget = new THREE.Vector3();
function updateCamera() {
  camTarget.set(player.x, terrainHeightAt(player.x, player.z) + 1.6, player.z);
  const cp = Math.cos(camPitch);
  camera.position.set(
    camTarget.x + Math.sin(camYaw) * cp * camDist,
    camTarget.y + Math.sin(camPitch) * camDist,
    camTarget.z + Math.cos(camYaw) * cp * camDist
  );
  const floor = terrainHeightAt(camera.position.x, camera.position.z) + 0.5;
  if (camera.position.y < floor) camera.position.y = floor;
  camera.lookAt(camTarget);
}

// ---------- main loop ----------
const clock = new THREE.Clock();
function tick() {
  requestAnimationFrame(tick);
  const dt = Math.min(clock.getDelta(), 0.1);
  dayTime = (dayTime + dt * GAME_HOURS_PER_SEC) % 24;
  const dayness = updateDay(dayTime, scene);
  house.userData.light.intensity = dayness < 0.25 ? 2.2 : 0;

  if (mode === 'play') updatePlayer(player, dt, input, camYaw);
  else player.group.position.set(player.x, terrainHeightAt(player.x, player.z), player.z);
  for (const n of npcs) updateNPC(n, dt, dayTime);
  updateFarm(dt);

  const hh = String(Math.floor(dayTime)).padStart(2, '0');
  const mm = String(Math.floor((dayTime % 1) * 60)).padStart(2, '0');
  $('clock').textContent = `${hh}:${mm}`;
  $('harvest').textContent = harvested;
  $('npc-status').textContent = npcs.map(n => `${n.name} (${n.role}): ${n.status}`).join('\n');

  if (mode === 'play') updateCamera();
  else controls.update();
  renderer.render(scene, camera);
}
setMode('play');
tick();
