import { pos, refreshTerrain, SIZE } from './terrain.js';
import { MODULE_DEFS, modules, placeModule, clearModules } from './buildings.js';
import { npcs } from './npcs.js';

// ponytail: localStorage only; swap for a backend/Firebase when cloud sync is real
const SAVE_KEY = 'homestead-save';
const HALF = SIZE / 2;

// localStorage is a trust boundary: another tab/extension can write anything here,
// so validate shape and clamp values before feeding it to the scene
function isValidSave(d) {
  return (
    d && typeof d === 'object' &&
    Array.isArray(d.heights) && d.heights.length === pos.count &&
    d.heights.every(h => Number.isFinite(h) && Math.abs(h) <= 100) &&
    Array.isArray(d.modules) && d.modules.length <= 10000 &&
    d.modules.every(m => m && MODULE_DEFS[m.type] &&
      Number.isFinite(m.x) && Math.abs(m.x) <= HALF &&
      Number.isFinite(m.z) && Math.abs(m.z) <= HALF) &&
    Array.isArray(d.npcs) && d.npcs.length === npcs.length &&
    d.npcs.every((s, i) => s && Number.isFinite(s.x) && Number.isFinite(s.z) &&
      Number.isInteger(s.taskIdx) && s.taskIdx >= 0 && s.taskIdx < npcs[i].tasks.length) &&
    Number.isFinite(d.dayTime) && d.dayTime >= 0 && d.dayTime < 24
  );
}

export function saveGame(dayTime) {
  const heights = Array.from({ length: pos.count }, (_, i) => Math.round(pos.getY(i) * 100) / 100);
  const data = {
    heights,
    modules: modules.map(m => ({ type: m.type, x: m.x, z: m.z })),
    npcs: npcs.map(n => ({ x: n.x, z: n.z, taskIdx: n.taskIdx })),
    dayTime,
  };
  localStorage.setItem(SAVE_KEY, JSON.stringify(data));
}

// returns restored dayTime, or null if there is no valid save
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
  data.npcs.forEach((s, i) => Object.assign(npcs[i], { x: s.x, z: s.z, taskIdx: s.taskIdx }));
  return data.dayTime;
}
