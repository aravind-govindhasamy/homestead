import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { SMAAPass } from 'three/addons/postprocessing/SMAAPass.js';
import { terrain, terrainHeightAt, sculptAt, SPOTS } from './terrain.js';
import {
  sky, sun, moon, hemi, updateDay, configureRenderer, buildScenery, updateEnvironment,
  CAMPFIRE, weather, getSeason, SEASONS,
} from './environment.js';
import { createHouse, groundAt } from './house.js';
import { createFarm, updateFarm, interactFarm, plots } from './farm.js';
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
composer.addPass(new SMAAPass(innerWidth * renderer.getPixelRatio(), innerHeight * renderer.getPixelRatio()));

const house = createHouse();
const player = createPlayer();
const playerTorch = new THREE.PointLight(0xffc98a, 0, 7, 2);
playerTorch.position.set(0.4, 1.7, 0);
player.group.add(playerTorch);
const dog = createDog();
// fishing bobber: red/white float that bobs on the pond while casting
const bobber = new THREE.Mesh(
  new THREE.SphereGeometry(0.09, 8, 6),
  new THREE.MeshStandardMaterial({ color: 0xef4444, emissive: 0xff2222, emissiveIntensity: 0.4 })
);
bobber.visible = false;
scene.add(sky, sun, moon, hemi, terrain, moduleGroup, house, createFarm(), buildScenery(),
  player.group, dog.group, bobber, ...npcs.map(n => n.group));

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
let farmSkill = 0, fishSkill = 0;
let stepTimer = 0;
let dayness = 0; // kept module-level so keydown handler and gamepad can read it
let gpEWasDown = false, gpRun = false, gpIndex = -1; // gamepad state
let lastNpcToast = -60, lastWildlifeMin = -1, lastFestSeason = -1, lastGiftDay = 0;
let lastDogFeed = -99; // in-game hours; can feed every 2 hours
let dailyHarvests = 0, dailyCatches = 0, dailyTalks = 0;
const npcGifts = []; // {x, z, name, claimed}
const particleBursts = []; // {pts, geo, mat, vel, life}
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

function addBurst(x, y, z, color) {
  const count = 18;
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) pos.set([x, y, z], i * 3);
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const mat = new THREE.PointsMaterial({ color, size: 6, sizeAttenuation: false, transparent: true, depthWrite: false });
  const vel = Array.from({ length: count }, () => new THREE.Vector3((Math.random() - .5) * 5, Math.random() * 5 + 2, (Math.random() - .5) * 5));
  scene.add(new THREE.Points(geo, mat));
  particleBursts.push({ pts: scene.children[scene.children.length - 1], geo, mat, vel, life: 0 });
}

// start audio on first interaction (browsers block AudioContext before gesture)
renderer.domElement.addEventListener('pointerdown', () => { if (!muted) initAudio(); }, { once: true });

// ---------- modes ----------
const HINTS = {
  play: 'WASD / left stick move · Shift / RB run · drag / right stick look · E / A button interact',
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
$('save').onclick = () => { saveGame({ dayTime, player, harvested, day, energy, hunger, farmSkill, fishSkill }); toast('Game saved'); };
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
  if (s.fishSkill !== undefined) fishSkill = s.fishSkill;
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
  else if (e.code === 'KeyE' && mode === 'play') doEAction();
});

function doEAction() {
    const isNight = dayTime >= 20 || dayTime < 5;
    const friend = npcs.find(n => Math.hypot(n.x - player.x, n.z - player.z) < 2.5);
    const nearDog = Math.hypot(player.x - dog.x, player.z - dog.z) < 2.2;
    const nearPond = Math.hypot(player.x - SPOTS.pond.x, player.z - SPOTS.pond.z) < SPOTS.pond.r + 3;
    const nearKitchen = Math.hypot(player.x - (SPOTS.house.x + 3.8), player.z - (SPOTS.house.z - 4.5)) < 3;
    const nearBench = Math.hypot(player.x + 15, player.z + 10.6) < 3;
    const nearBookshelf = Math.hypot(player.x - (SPOTS.house.x - 3.8), player.z - (SPOTS.house.z + 2.8)) < 2.5;
    if (fishing) {
      toast('Patience… waiting for a bite 🎣');
    } else if (friend) {
      friend.rel = Math.min(5, (friend.rel || 0) + 0.4); dailyTalks++;
      if (friend.rel >= 1 && !achievements.has('friends')) achieve('friends', `Friends with ${friend.name}!`);
      toast(getGreeting(friend));
    } else if (nearKitchen && hunger < 95) {
      const [mealName, hungerBonus, energyBonus] =
        dayTime < 10 ? ['a hearty breakfast 🍳', 40, 28] :
        dayTime < 16 ? ['a fresh salad lunch 🥗', 38, 22] :
        dayTime < 21 ? ['a home-cooked dinner 🍲', 50, 20] :
                       ['a late-night snack 🫙', 22, 10];
      hunger = Math.min(100, hunger + hungerBonus); energy = Math.min(100, energy + energyBonus);
      toast(`Ate ${mealName} — feeling great!`);
    } else if (!isNight && Math.hypot(player.x - CAMPFIRE.x, player.z - CAMPFIRE.z) < 4 && dayness < 0.45 && hunger < 90) {
      hunger = Math.min(100, hunger + 35); energy = Math.min(100, energy + 15);
      toast('Cooked at the campfire 🍲 — the smell draws everyone closer!');
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
    } else if (nearDog && (day - 1) * 24 + dayTime - lastDogFeed >= 2) {
      lastDogFeed = (day - 1) * 24 + dayTime;
      energy = Math.min(100, energy + 6);
      toast('Biscuit wags his tail happily! 🐕');
    } else if (nearBench) {
      energy = Math.min(100, energy + 15); hunger = Math.min(100, hunger + 5);
      toast('Sat by the pond and watched the water. 🪷');
    } else if (nearBookshelf) {
      const quotes = [
        '🪔 You light the lamp and feel a quiet peace settle…',
        '🙏 A moment of gratitude for this beautiful life.',
        '🪔 The flame flickers — a reminder to stay present.',
        '🌸 You offer a flower to the puja lamp.',
        '🙏 Inner peace restored. +10 energy',
      ];
      energy = Math.min(100, energy + 5);
      toast(quotes[Math.floor(Math.random() * quotes.length)]);
    } else if (nearPond) {
      fishing = true;
      fishTimer = Math.max(2.5, 13 - fishSkill * 1.1) * Math.random() + 2;
      toast('Casting line… 🎣');
    } else if (isNight && Math.hypot(player.x, player.z) < 9) {
      const parts = [];
      if (dailyHarvests) parts.push(`${dailyHarvests} harvest${dailyHarvests > 1 ? 's' : ''} 🌾`);
      if (dailyCatches) parts.push(`${dailyCatches} fish 🐟`);
      if (dailyTalks) parts.push(`chatted ${dailyTalks}× 💬`);
      const summary = parts.length ? `Today: ${parts.join(', ')}` : 'A peaceful day 🌿';
      toast(`🌙 Goodnight! ${summary}`, 2600);
      day++; dayTime = 6; energy = 100; hunger = Math.min(100, hunger + 20);
      dailyHarvests = dailyCatches = dailyTalks = 0;
      const dreams = ['💭 You dream of fields stretching to the horizon…', '💭 You dream of golden fish leaping in the sunlight…', '💭 You dream of fireflies dancing over the pond…', '💭 You dream of the smell of bread from the kitchen…'];
      setTimeout(() => toast(dreams[day % dreams.length], 2200), 2800);
      setTimeout(() => toast(`Good morning! ☀️ Day ${day} — ${SEASONS[getSeason(day)]}`), 5200);
    } else if (energy < 3) {
      toast('Too tired to work… rest by the fire or sleep at home');
    } else {
      const msg = interactFarm(player.x, player.z);
      if (msg && msg.startsWith('harvest:')) {
        harvested++; dailyHarvests++; energy -= 3; toast(`Harvested ${msg.slice(8)}! 🎃`);
        addBurst(player.x, groundAt(player.x, player.z) + 0.5, player.z, 0xf3a712);
        if (harvested === 1) achieve('harvest', 'First Harvest!');
        const prevLevel = Math.floor(farmSkill);
        farmSkill = Math.min(10, farmSkill + 0.5);
        const levelUp = { 1: 'Farmer in Training! 🌱', 3: 'Getting the Hang of It 🌾', 5: 'Skilled Farmer! 🎃', 7: 'Expert Grower! 🌻', 10: 'Master of the Land! 👑' };
        if (Math.floor(farmSkill) > prevLevel && levelUp[Math.floor(farmSkill)]) achieve('farm' + Math.floor(farmSkill), levelUp[Math.floor(farmSkill)]);
      }
      else if (msg) { if (msg.startsWith('Planted')) energy -= 2; toast(msg); }
    }
}
addEventListener('keyup', e => {
  if (e.code in KEYMAP) {
    const k = KEYMAP[e.code];
    input[k.slice(0, -1)] -= k.endsWith('+') ? 1 : -1;
  } else if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') input.run = false;
});
addEventListener('blur', () => { input.fwd = 0; input.side = 0; input.run = false; });
addEventListener('gamepadconnected', e => {
  gpIndex = e.gamepad.index;
  toast(`🎮 Controller connected! Use left stick to move, A to interact.`, 2500);
  $('gp-status').textContent = '🎮';
});
addEventListener('gamepaddisconnected', e => {
  if (e.gamepad.index === gpIndex) { gpIndex = -1; $('gp-status').textContent = ''; }
});

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
    // milestones
    const dayMilestones = { 7: 'One week on the homestead! 🌱', 30: 'First full month! 🌕', 100: 'Hundred days! 🏆' };
    if (dayMilestones[day]) setTimeout(() => achieve('day' + day, dayMilestones[day]), 2800);
    // seasonal festivals at day 15 of each season
    const curSeason = getSeason(day), dayOfSeason = (day - 1) % 30;
    if (dayOfSeason === 14 && curSeason !== lastFestSeason) {
      lastFestSeason = curSeason;
      const fests = ['🌸 Spring Bloom Festival!', '☀️ Midsummer Solstice!', '🍂 Harvest Festival!', '❄️ Winter Solstice!'];
      setTimeout(() => achieve('fest' + curSeason, fests[curSeason]), 3200);
    }
  }
  dayness = updateDay(dayTime, scene);
  const { sawStar } = updateEnvironment(dt, t, dayness, day);
  if (sawStar) { const wishes = ['🌠 A shooting star! Make a wish…', '🌠 A streak across the heavens!', '🌠 Quick — wish upon a star!']; toast(wishes[Math.floor(Math.random() * 3)], 2200); }
  const lampOn = dayness < 0.25;
  house.userData.light.intensity = lampOn ? 2.2 : 0;
  playerTorch.intensity = dayness < 0.2 ? 1.4 : 0;
  house.userData.lampShade.material.emissiveIntensity = lampOn ? 1.6 : 0.15;
  if (weather.target === 1 && !wasRaining && weather.rain > 0.1) {
    wasRaining = true;
    toast('Rain is rolling in — the crops will love this ☔');
  } else if (weather.target === 0 && weather.rain < 0.1) wasRaining = false;

  // ── Gamepad (standard mapping) ─────────────────────────────────────
  const gpads = navigator.getGamepads ? navigator.getGamepads() : [];
  // use tracked index, or scan all slots (handles index != 0 and late connections)
  const gp = gpIndex >= 0 ? gpads[gpIndex] : Array.from(gpads).find(Boolean) ?? null;
  if (!gp) { gpRun = false; }
  if (gp) {
    const dead = v => Math.abs(v) > 0.15 ? v : 0;
    const lx = dead(gp.axes[0]), ly = dead(gp.axes[1]);
    if (lx || ly) { input.fwd = -ly; input.side = lx; }
    else if (!lx && !ly) { input.fwd = 0; input.side = 0; }
    // right stick → camera look
    camYaw -= dead(gp.axes[2]) * 2.0 * dt;
    camPitch = Math.max(-0.1, Math.min(1.1, camPitch + dead(gp.axes[3]) * 1.5 * dt));
    // RB (5) or RT (7) → run (tracked separately; OR'd with keyboard Shift below)
    gpRun = gp.buttons[5]?.pressed || gp.buttons[7]?.pressed || false;
    // A/Cross (0) → E action (fire once per press)
    const gpEDown = gp.buttons[0]?.pressed;
    if (gpEDown && !gpEWasDown && mode === 'play') doEAction();
    gpEWasDown = gpEDown;
    // D-pad movement
    const dup = gp.buttons[12]?.pressed, ddown = gp.buttons[13]?.pressed;
    const dleft = gp.buttons[14]?.pressed, dright = gp.buttons[15]?.pressed;
    if (dup || ddown || dleft || dright) {
      input.fwd = dup ? 1 : ddown ? -1 : 0;
      input.side = dright ? 1 : dleft ? -1 : 0;
    }
  }

  let speed = 0;
  if (mode === 'play') {
    const canRun = energy > 5;
    speed = updatePlayer(player, dt, { ...input, run: (input.run || gpRun) && canRun }, camYaw);
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
  const thunder = updateAudio(dt, t, dayness, weather.rain, nearFire);
  if (thunder) { scene.fog.color.set(0xffffff); setTimeout(() => { /* fog color restored by updateDay next frame */ }, 80); }
  const nearFriend = npcs.some(n => Math.hypot(n.x - player.x, n.z - player.z) < 4);
  if (speed > 5) energy -= 3.2 * dt;
  else if (speed > 0.1) energy -= 1.1 * dt;
  else energy += (nearFire ? 6 : 2) * dt;
  energy = Math.max(0, Math.min(100, energy));

  // bobber floats at pond surface while casting; bobs urgently near catch time
  bobber.visible = fishing;
  if (fishing) {
    const urgency = Math.max(0, 1 - fishTimer / 3);
    bobber.position.set(SPOTS.pond.x + 1.5, -0.75 + Math.sin(t * (2.5 + urgency * 8)) * (0.06 + urgency * 0.12), SPOTS.pond.z + 1.5);
    fishTimer -= dt;
    if (fishTimer <= 0) {
      fishing = false; fishCount++; dailyCatches++;
      const catches = ['a trout', 'a sunfish', 'a perch', 'a tiny bass'];
      toast(`Caught ${catches[(fishCount - 1) % 4]}! 🎣 Total: ${fishCount}`);
      energy = Math.min(100, energy + 8);
      if (fishCount === 1) achieve('fish', 'First Catch! 🎣');
      const prevFishLevel = Math.floor(fishSkill);
      fishSkill = Math.min(10, fishSkill + 0.4);
      const fishLevels = { 1: 'Learning the Waters 🎣', 3: 'Patient Fisher 🐟', 6: 'Skilled Angler! 🐠', 10: 'Master Angler! 🏆' };
      if (Math.floor(fishSkill) > prevFishLevel && fishLevels[Math.floor(fishSkill)]) achieve('fish' + Math.floor(fishSkill), fishLevels[Math.floor(fishSkill)]);
    }
  }
  hunger -= 0.18 * dt;
  hunger = Math.max(0, Math.min(100, hunger));
  const wellFed = hunger > 50;
  const mood = energy > 65 && wellFed ? (nearFriend || nearFire ? '😄' : '🙂')
    : energy > 65 ? '😊'
    : energy > 35 ? (wellFed ? '🙂' : '😐')
    : energy > 12 ? '😐' : '😫';

  // particle burst animation
  for (let i = particleBursts.length - 1; i >= 0; i--) {
    const b = particleBursts[i];
    b.life += dt;
    if (b.life > 1.2) { scene.remove(b.pts); b.geo.dispose(); b.mat.dispose(); particleBursts.splice(i, 1); continue; }
    const pp = b.pts.geometry.attributes.position;
    for (let j = 0; j < b.vel.length; j++) {
      b.vel[j].y -= 9.8 * dt;
      pp.setXYZ(j, pp.getX(j) + b.vel[j].x * dt, pp.getY(j) + b.vel[j].y * dt, pp.getZ(j) + b.vel[j].z * dt);
    }
    pp.needsUpdate = true;
    b.mat.opacity = Math.max(0, 1 - b.life * 1.3);
  }

  // NPC gifts: Alice/Bob leave a surprise once per day (40% chance)
  if (day > lastGiftDay) {
    lastGiftDay = day;
    if (Math.random() < 0.4) {
      const isAlice = Math.random() < 0.5;
      npcGifts.push({ x: isAlice ? SPOTS.farm.x : SPOTS.hives.x, z: isAlice ? SPOTS.farm.z : SPOTS.hives.z, name: isAlice ? 'crops from Alice 🌾' : 'honey from Bob 🍯', claimed: false });
    }
  }
  for (const gift of npcGifts.filter(g => !g.claimed)) {
    if (Math.hypot(player.x - gift.x, player.z - gift.z) < 3.5) {
      gift.claimed = true; harvested++;
      toast(`Found ${gift.name}! 🎁`);
      addBurst(gift.x, terrainHeightAt(gift.x, gift.z) + 0.4, gift.z, 0xffd700);
    }
  }

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

  // contextual E-key hint
  if (mode === 'play') {
    const isNightHint = dayTime >= 20 || dayTime < 5;
    let eCtx = null;
    if (fishing) eCtx = '🎣 Waiting…';
    else if (npcs.some(n => Math.hypot(n.x - player.x, n.z - player.z) < 2.5)) eCtx = '💬 Talk';
    else if (Math.hypot(player.x - dog.x, player.z - dog.z) < 2.2) {
      const h = (day - 1) * 24 + dayTime - lastDogFeed;
      eCtx = h >= 2 ? '🐕 Feed Biscuit' : '🐕 Biscuit is full';
    }
    else if (npcGifts.some(g => !g.claimed && Math.hypot(player.x - g.x, player.z - g.z) < 3.5)) eCtx = '🎁 Collect gift';
    else if (!isNightHint && Math.hypot(player.x - CAMPFIRE.x, player.z - CAMPFIRE.z) < 4 && dayness < 0.45 && hunger < 90) eCtx = '🍲 Cook at fire';
    else if (isNightHint && Math.hypot(player.x - CAMPFIRE.x, player.z - CAMPFIRE.z) < 5) eCtx = '⭐ Gaze at stars';
    else if (Math.hypot(player.x + 15, player.z + 10.6) < 3) eCtx = '🪷 Sit by pond';
    else if (Math.hypot(player.x - (SPOTS.house.x - 3.8), player.z - (SPOTS.house.z + 2.8)) < 2.5) eCtx = '🪔 Pray at puja';
    else if (Math.hypot(player.x - SPOTS.pond.x, player.z - SPOTS.pond.z) < SPOTS.pond.r + 3) eCtx = '🎣 Fish';
    else if (Math.hypot(player.x - (SPOTS.house.x + 3.8), player.z - (SPOTS.house.z - 4.5)) < 3 && hunger < 95) eCtx = '🍲 Cook';
    else if (isNightHint && Math.hypot(player.x, player.z) < 9) eCtx = '💤 Sleep';
    else {
      const np = plots.reduce((b, p) => Math.hypot(p.x-player.x,p.z-player.z) < Math.hypot(b.x-player.x,b.z-player.z) ? p : b, plots[0]);
      if (Math.hypot(np.x - player.x, np.z - player.z) < 2.4) eCtx = np.state === 0 ? '🌱 Plant' : np.state === 2 ? '🎃 Harvest' : '👀 Growing…';
    }
    const eEl = $('e-hint');
    eEl.textContent = eCtx ? `[E] ${eCtx}` : '';
    eEl.style.opacity = eCtx ? '1' : '0';
  }

  const hh = String(Math.floor(dayTime)).padStart(2, '0');
  const mm = String(Math.floor((dayTime % 1) * 60)).padStart(2, '0');
  $('clock').textContent = `${hh}:${mm}`;
  $('day-label').childNodes[0].textContent = `Day ${day} · `;
  const moonPhases = '🌑🌒🌓🌔🌕🌖🌗🌘';
  const curSeasonIdx = getSeason(day);
  $('season-label').textContent = `${SEASONS[curSeasonIdx]} ${moonPhases[day % 8]}`;
  // seasonal accent color
  const seasonAccents = ['#ff85a1', '#6fcf5f', '#f3a712', '#7ec8e3'];
  document.documentElement.style.setProperty('--accent', seasonAccents[curSeasonIdx]);
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
