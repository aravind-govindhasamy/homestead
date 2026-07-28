// logic smoke test — run with `npm test`; no browser or WebGL needed
import { terrainHeightAt, SPOTS } from '../src/terrain.js';
import { createFarm, plots, updateFarm, interactFarm } from '../src/farm.js';
import { createPlayer, updatePlayer } from '../src/player.js';
import { npcs, updateNPC } from '../src/npcs.js';
import { createDog, updateDog } from '../src/dog.js';
import assert from 'node:assert';

assert(Number.isFinite(terrainHeightAt(0, 0)), 'terrain height finite');
assert(Math.abs(terrainHeightAt(SPOTS.house.x, SPOTS.house.z) - SPOTS.house.h) < 0.3, 'house pad flat');

createFarm();
assert.equal(plots.length, 12, '12 plots');
assert.equal(interactFarm(plots[0].x, plots[0].z), 'Planted a crop 🌱');
updateFarm(30);
assert.equal(plots[0].state, 2, 'crop ready after grow time');
assert.equal(interactFarm(plots[0].x, plots[0].z), 'harvest');

const p = createPlayer();
const z0 = p.z;
for (let i = 0; i < 60; i++) updatePlayer(p, 1 / 60, { fwd: 1, side: 0, run: false }, 0);
assert(p.z < z0 - 3, 'player walks forward');

for (let i = 0; i < 3600; i++) npcs.forEach(n => updateNPC(n, 1 / 60, 12));
assert(npcs.every(n => n.status.length > 0), 'npcs have status');
assert(npcs[0].status.includes('lunch'), 'Alice takes a lunch break at noon');
npcs.forEach(n => updateNPC(n, 1 / 60, 23));
assert(npcs.every(n => n.status.includes('sleep') || n.status.includes('walking')), 'npcs head to bed at night');

const dog = createDog();
const d0 = Math.hypot(dog.x - p.x, dog.z - p.z);
for (let i = 0; i < 120; i++) updateDog(dog, 1 / 60, p, i / 60);
assert(Math.hypot(dog.x - p.x, dog.z - p.z) < Math.max(3, d0), 'dog follows the player');

console.log('logic smoke test: OK');
