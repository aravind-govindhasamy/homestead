// logic smoke test — run with `npm test`; no browser or WebGL needed
import { terrainHeightAt, SPOTS } from '../src/terrain.js';
import { createFarm, plots, updateFarm, interactFarm } from '../src/farm.js';
import { createPlayer, updatePlayer } from '../src/player.js';
import { npcs, updateNPC } from '../src/npcs.js';
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

for (let i = 0; i < 600; i++) npcs.forEach(n => updateNPC(n, 1 / 60, 12));
assert(npcs.every(n => n.status.length > 0), 'npcs have status');

console.log('logic smoke test: OK');
