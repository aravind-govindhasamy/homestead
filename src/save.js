import { pos, refreshTerrain, SIZE } from './terrain.js';
import { MODULE_DEFS, modules, placeModule, clearModules } from './buildings.js';
import { npcs } from './npcs.js';
import { plots } from './farm.js';

// ponytail: localStorage only; swap for a backend/Firebase when cloud sync is real
const SAVE_KEY = 'homestead-save';
const VERSION = 3;
const HALF = SIZE / 2;

// localStorage is a trust boundary: another tab/extension can write anything here,
// so validate shape and clamp values before feeding it to the scene
function isValidSave(d) {
  return (
    d && typeof d === 'object' && d.v === VERSION &&
    Array.isArray(d.heights) && d.heights.length === pos.count &&
    d.heights.every(h => Number.isFinite(h) && Math.abs(h) <= 100) &&
    Array.isArray(d.modules) && d.modules.length <= 10000 &&
    d.modules.every(m => m && MODULE_DEFS[m.type] &&
      Number.isFinite(m.x) && Math.abs(m.x) <= HALF &&
      Number.isFinite(m.z) && Math.abs(m.z) <= HALF) &&
    Array.isArray(d.npcs) && d.npcs.length >= 2 &&
    d.npcs.every(s => s && Number.isFinite(s.x) && Number.isFinite(s.z)) &&
    Array.isArray(d.plots) && d.plots.length === plots.length &&
    d.plots.every(p => p && [0, 1, 2].includes(p.s) && Number.isFinite(p.t) && p.t >= 0 && p.t <= 10000) &&
    d.player && Number.isFinite(d.player.x) && Math.abs(d.player.x) <= HALF &&
    Number.isFinite(d.player.z) && Math.abs(d.player.z) <= HALF &&
    Number.isInteger(d.harvested) && d.harvested >= 0 &&
    Number.isInteger(d.day) && d.day >= 1 && d.day <= 100000 &&
    Number.isFinite(d.energy) && d.energy >= 0 && d.energy <= 100 &&
    (d.hunger === undefined || (Number.isFinite(d.hunger) && d.hunger >= 0 && d.hunger <= 100)) &&
    (d.farmSkill === undefined || (Number.isFinite(d.farmSkill) && d.farmSkill >= 0 && d.farmSkill <= 10)) &&
    Number.isFinite(d.dayTime) && d.dayTime >= 0 && d.dayTime < 24
  );
}

export function saveGame(state) {
  const heights = Array.from({ length: pos.count }, (_, i) => Math.round(pos.getY(i) * 100) / 100);
  const data = {
    v: VERSION,
    heights,
    modules: modules.map(m => ({ type: m.type, x: m.x, z: m.z })),
    npcs: npcs.map(n => ({ x: n.x, z: n.z })),
    plots: plots.map(p => ({ s: p.state, t: Math.round(p.t * 10) / 10 })),
    player: { x: state.player.x, z: state.player.z },
    harvested: state.harvested,
    day: state.day,
    energy: Math.round(state.energy),
    hunger: Math.round(state.hunger ?? 100),
    farmSkill: Math.round((state.farmSkill ?? 0) * 10) / 10,
    dayTime: state.dayTime,
  };
  localStorage.setItem(SAVE_KEY, JSON.stringify(data));
}

// returns {dayTime, player, harvested, day, energy}, or null if there is no valid save
export function loadGame() {
  const raw = localStorage.getItem(SAVE_KEY);
  if (!raw) return null;
  let data;
  try { data = JSON.parse(raw); } catch { return null; }
  if (!isValidSave(data)) return null;

  data.heights.forEach((h, i) => pos.setY(i, h));
  refreshTerrain();
  clearModules();
  data.modules.forEach(m => placeModule(m.type, m.x, m.z));
  data.npcs.forEach((s, i) => { if (npcs[i]) Object.assign(npcs[i], { x: s.x, z: s.z }); });
  data.plots.forEach((s, i) => Object.assign(plots[i], { state: s.s, t: s.t }));
  return { dayTime: data.dayTime, player: data.player, harvested: data.harvested, day: data.day, energy: data.energy, hunger: data.hunger, farmSkill: data.farmSkill };
}
