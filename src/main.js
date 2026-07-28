import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { terrain, terrainHeightAt, sculptAt, SPOTS } from './terrain.js';
import {
  sky, sun, moon, hemi, updateDay, configureRenderer, buildScenery, updateEnvironment,
  CAMPFIRE, weather, getSeason, SEASONS,
} from './environment.js';
import { createHouse, groundAt } from './house.js';
import { createFarm, updateFarm, interactFarm } from './farm.js';
import { createPlayer, updatePlayer } from './player.js';
import { createDog, updateDog } from './dog.js';
import {
  MODULE_DEFS, snap, moduleGroup, makeModuleMesh,
  placeModule, removeModuleByMesh, reglueModules,
} from './buildings.js';
import { npcs, updateNPC, getGreeting } from './npcs.js';
import { saveGame, loadGame } from './save.js';
import { initAudio, updateAudio, setMuted, playStep } from './audio.js';

// ---------- scene core ----------
const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0xbfd4e0, 90, 320);

const camera = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, 0.1, 1000);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(innerWidth, innerHeight);
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
configureRenderer(renderer);
document.body.appendChild(renderer.domElement);

// subtle bloom so the sun, fire and fireflies glow
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
composer.addPass(new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.3, 0.55, 0.85));
composer.addPass(new OutputPass());

const house = createHouse();
const player = createPlayer();
const dog = createDog();
scene.add(sky, sun, moon, hemi, terrain, moduleGroup, house, createFarm(), buildScenery(),
  player.group, dog.group, ...npcs.map(n => n.group));

const controls = new OrbitControls(camera, renderer.domElement);
controls.maxPolarAngle = Math.PI / 2.05;
controls.maxDistance = 180;
controls.enabled = false;

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
  composer.setSize(innerWidth, innerHeight);
});

// ---------- state ----------
let dayTime = 8; // hours, 0..24
const GAME_HOURS_PER_SEC = 0.1; // 4-minute full day
let harvested = 0;
let day = 1;
let energy = 100;
let mode = 'play';
let brushDir = 1;
let buildType = 'wall';
let camYaw = 0.6, camPitch = 0.42, camDist = 9;
let wasRaining = false;
let hunger = 100, fishing = false, fishTimer = 0, fishCount = 0;
let farmSkill = 0;
let stepTimer = 0;
let lastNpcToast = -60, lastWildlifeMin = -1;
let muted = false;
const achievements = new Set();
const input = { fwd: 0, side: 0, run: false };
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
let ghost = null;
let sculpting = false;
let dragging = false;

const $ = id => document.getElementById(id);
function toast(msg, duration = 1600) {
  const el = $('toast');
  el.textContent = msg;
  el.style.opacity = 1;
  el.style.color = '';
  clearTimeout(el._t);
  el._t = setTimeout(() => (el.style.opacity = 0), duration);
}
function achieve(id, msg) {
  if (achievements.has(id)) return;
  achievements.add(id);
  const el = $('toast');
  el.textContent = `🏆 ${msg}`;
  el.style.opacity = 1;
  el.style.color = '#ffd700';
  clearTimeout(el._t);
  el._t = setTimeout(() => { el.style.opacity = 0; el.style.color = ''; }, 3800);
}

// start audio on first interaction (browsers block AudioContext before gesture)
renderer.domElement.addEventListener('pointerdown', () => { if (!muted) initAudio(); }, { once: true });

// ---------- modes ----------
const HINTS = {
  play: 'WASD move · Shift run · drag look · E: talk to friends · fish at pond · cook at kitchen · farm · sleep at home when dark',
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
$('mute').onclick = () => { muted = !muted; setMuted(muted); $('mute').textContent = muted ? '🔇' : '🔊'; };
$('save').onclick = () => { saveGame({ dayTime, player, harvested, day, energy, hunger, farmSkill }); toast('Game saved'); };
$('load').onclick = () => {
  const s = loadGame();
  if (!s) { toast('No valid save found'); return; }
  dayTime = s.dayTime;
  player.x = s.player.x; player.z = s.player.z;
  harvested = s.harvested;
  day = s.day;
  energy = s.energy;
  if (s.hunger !== undefined) hunger = s.hunger;
  if (s.farmSkill !== undefined) farmSkill = s.farmSkill;
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
    const isNight = dayTime >= 20 || dayTime < 5;
    const friend = npcs.find(n => Math.hypot(n.x - player.x, n.z - player.z) < 2.5);
    const nearPond = Math.hypot(player.x - SPOTS.pond.x, player.z - SPOTS.pond.z) < SPOTS.pond.r + 3;
    const nearKitchen = Math.hypot(player.x - (SPOTS.house.x + 2.2), player.z - (SPOTS.house.z - 3.6)) < 3;
    const nearBench = Math.hypot(player.x + 15, player.z + 10.6) < 3;
    const nearBookshelf = Math.hypot(player.x + 5.55, player.z + 1.5) < 2.5;
    if (fishing) {
      toast('Patience… waiting for a bite 🎣');
    } else if (friend) {
      friend.rel = Math.min(5, (friend.rel || 0) + 0.4);
      if (friend.rel >= 1 && !achievements.has('friends')) achieve('friends', `Friends with ${friend.name}!`);
      toast(getGreeting(friend));
    } else if (nearKitchen && hunger < 95) {
      hunger = Math.min(100, hunger + 45); energy = Math.min(100, energy + 20);
      toast('Ate a home-cooked meal 🍲 — feeling great!');
    } else if (isNight && Math.hypot(player.x - CAMPFIRE.x, player.z - CAMPFIRE.z) < 5 && !nearKitchen) {
      const stars = [
        '⭐ Orion stands tall, sword gleaming.',
        '⭐ The Big Dipper pours starlight over the homestead.',
        '⭐ Cassiopeia traces its W above the horizon.',
        '🌟 A shooting star streaks across the meadow!',
        '⭐ The Pleiades cluster shimmers in the east.',
        '🌟 Jupiter burns bright near the horizon tonight.',
      ];
      energy = Math.min(100, energy + 3);
      toast(stars[Math.floor(Math.random() * stars.length)], 2800);
    } else if (nearBench) {
      energy = Math.min(100, energy + 15); hunger = Math.min(100, hunger + 5);
      toast('Sat by the pond and watched the water. 🪷');
    } else if (nearBookshelf) {
      const quotes = [
        '"The earth laughs in flowers." — Emerson 🌸',
        '"In every walk with nature, one receives far more than he seeks." — Muir 🌿',
        '"Home is where the heart is." — Pliny the Elder 🏡',
        '"A quiet garden is a refuge for the spirit." 📖',
        '"Tend your garden and it will tend to you." 🌱',
      ];
      energy = Math.min(100, energy + 5);
      toast(quotes[Math.floor(Math.random() * quotes.length)]);
    } else if (nearPond) {
      fishing = true; fishTimer = 5 + Math.random() * 8;
      toast('Casting line… 🎣');
    } else if (isNight && Math.hypot(player.x, player.z) < 9) {
      day++; dayTime = 6; energy = 100; hunger = Math.min(100, hunger + 20);
      toast(`Good morning! ☀️ Day ${day} — ${SEASONS[getSeason(day)]}`);
    } else if (energy < 3) {
      toast('Too tired to work… rest by the fire or sleep at home');
    } else {
      const msg = interactFarm(player.x, player.z);
      if (msg && msg.startsWith('harvest:')) {
        harvested++; energy -= 3; toast(`Harvested ${msg.slice(8)}! 🎃`);
        if (harvested === 1) achieve('harvest', 'First Harvest!');
        const prevLevel = Math.floor(farmSkill);
        farmSkill = Math.min(10, farmSkill + 0.5);
        const levelUp = { 1: 'Farmer in Training! 🌱', 3: 'Getting the Hang of It 🌾', 5: 'Skilled Farmer! 🎃', 7: 'Expert Grower! 🌻', 10: 'Master of the Land! 👑' };
        if (Math.floor(farmSkill) > prevLevel && levelUp[Math.floor(farmSkill)]) achieve('farm' + Math.floor(farmSkill), levelUp[Math.floor(farmSkill)]);
      }
      else if (msg) { if (msg.startsWith('Planted')) energy -= 2; toast(msg); }
    }
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
  camTarget.set(player.x, groundAt(player.x, player.z) + 1.6, player.z);
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
  const t = clock.elapsedTime;
  const prevTime = dayTime;
  dayTime = (dayTime + dt * GAME_HOURS_PER_SEC) % 24;
  if (dayTime < prevTime) {
    day++;
    const forecast = weather.target > 0 ? '🌧️ Rain in the forecast.' : (Math.random() < 0.2 ? '⛅ Partly cloudy.' : '☀️ Clear skies ahead!');
    toast(`Day ${day} begins — ${forecast}`, 2500);
  }
  const dayness = updateDay(dayTime, scene);
  updateEnvironment(dt, t, dayness, day);
  const lampOn = dayness < 0.25;
  house.userData.light.intensity = lampOn ? 2.2 : 0;
  house.userData.lampShade.material.emissiveIntensity = lampOn ? 1.6 : 0.15;
  if (weather.target === 1 && !wasRaining && weather.rain > 0.1) {
    wasRaining = true;
    toast('Rain is rolling in — the crops will love this ☔');
  } else if (weather.target === 0 && weather.rain < 0.1) wasRaining = false;

  let speed = 0;
  if (mode === 'play') {
    const canRun = energy > 5;
    speed = updatePlayer(player, dt, { ...input, run: input.run && canRun }, camYaw);
    if (speed > 0.5) {
      stepTimer -= dt;
      if (stepTimer <= 0) { playStep(); stepTimer = input.run ? 0.27 : 0.44; }
    } else stepTimer = 0;
  } else {
    player.group.position.set(player.x, groundAt(player.x, player.z), player.z);
  }
  updateDog(dog, dt, player, t);
  for (const n of npcs) {
    const prev = n.status;
    updateNPC(n, dt, dayTime);
    if (n.status !== prev && !n.status.startsWith('walk') && t - lastNpcToast > 55) {
      toast(`${n.name} is ${n.status}`);
      lastNpcToast = t;
    }
  }
  updateFarm(dt * (1 + weather.rain) * (1 + farmSkill * 0.08)); // rain + skill boost growth

  // work-life balance: moving costs energy, resting restores it —
  // faster by the campfire or with company
  const nearFire = Math.hypot(player.x - CAMPFIRE.x, player.z - CAMPFIRE.z) < 4;
  updateAudio(t, dayness, weather.rain, nearFire);
  const nearFriend = npcs.some(n => Math.hypot(n.x - player.x, n.z - player.z) < 4);
  if (speed > 5) energy -= 3.2 * dt;
  else if (speed > 0.1) energy -= 1.1 * dt;
  else energy += (nearFire ? 6 : 2) * dt;
  energy = Math.max(0, Math.min(100, energy));

  if (fishing) {
    fishTimer -= dt;
    if (fishTimer <= 0) {
      fishing = false; fishCount++;
      const catches = ['a trout', 'a sunfish', 'a perch', 'a tiny bass'];
      toast(`Caught ${catches[(fishCount - 1) % 4]}! 🎣 Total: ${fishCount}`);
      energy = Math.min(100, energy + 8);
      if (fishCount === 1) achieve('fish', 'First Catch! 🎣');
    }
  }
  hunger -= 0.18 * dt;
  hunger = Math.max(0, Math.min(100, hunger));
  const wellFed = hunger > 50;
  const mood = energy > 65 && wellFed ? (nearFriend || nearFire ? '😄' : '🙂')
    : energy > 65 ? '😊'
    : energy > 35 ? (wellFed ? '🙂' : '😐')
    : energy > 12 ? '😐' : '😫';

  // rare wildlife sighting once per minute, only outdoors in daylight
  const curMin = Math.floor(t / 60);
  if (curMin !== lastWildlifeMin && Math.random() < 0.25 && dayness > 0.15 && t > 20) {
    lastWildlifeMin = curMin;
    const wildlife = [
      '🦌 A deer grazes at the edge of the meadow.',
      '🐇 A rabbit hops past the farm fence.',
      '🦊 A fox trots by at the edge of the woods.',
      '🦅 A hawk soars high overhead.',
      '🦔 A hedgehog snuffles through the garden.',
    ];
    toast(wildlife[Math.floor(Math.random() * wildlife.length)], 2400);
  }

  const hh = String(Math.floor(dayTime)).padStart(2, '0');
  const mm = String(Math.floor((dayTime % 1) * 60)).padStart(2, '0');
  $('clock').textContent = `${hh}:${mm}`;
  $('day-label').childNodes[0].textContent = `Day ${day} · `;
  const moonPhases = '🌑🌒🌓🌔🌕🌖🌗🌘';
  $('season-label').textContent = `${SEASONS[getSeason(day)]} ${moonPhases[day % 8]}`;
  $('mood').textContent = mood;
  $('energy-fill').style.width = `${energy}%`;
  $('hunger-fill').style.width = `${hunger}%`;
  $('harvest').textContent = harvested;
  $('fish-count').textContent = fishCount;
  $('farm-level').textContent = `Lv.${Math.floor(farmSkill) + 1}`;
  $('npc-status').textContent =
    npcs.map(n => {
      const rel = n.rel || 0;
      const heart = rel >= 4 ? '💖' : rel >= 2 ? '❤️' : rel >= 1 ? '🤍' : '  ';
      return `${n.name} ${heart} (${n.role}): ${n.status}`;
    }).join('\n') + '\nBiscuit 🐕: right beside you';

  if (mode === 'play') updateCamera();
  else controls.update();
  composer.render();
}
setMode('play');
tick();

// dev/testing hook (used by test/e2e.mjs)
window.homestead = { setTime: h => { dayTime = h; }, getState: () => ({ dayTime, day, energy }) };
