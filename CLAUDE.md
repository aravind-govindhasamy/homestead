# Homestead

Editable 3D dream-home web app (Three.js + Vite, vanilla JS, no framework).
Design source: `deep-research-report.md`.

## Commands

- `npm run dev` — dev server at http://localhost:5173
- `npm run build` — production build to `dist/` (must pass before committing)
- `npm run preview` — serve the built `dist/`

## Architecture

One module per domain, all state lives in the module that owns it:

- `src/terrain.js` — value-noise heightmap, `SPOTS` flattened pads (house/farm/pond/hives), `terrainHeightAt`, `sculptAt`
- `src/environment.js` — Sky addon + sun/hemi lights, `updateDay(dayTime)`, renderer config (ACES), instanced trees/rocks/flowers, pond water, beehives, farm fence
- `src/player.js` — `createCharacter` (shared with NPCs), `updatePlayer` (WASD relative to camera yaw), limb-swing animation
- `src/house.js` — modern house group; `userData.light` is the interior evening light
- `src/farm.js` — `plots` state machine (empty/growing/ready), `interactFarm` for E-key plant/harvest
- `src/buildings.js` — build-mode module defs (wall/floor/roof), grid snap, place/remove, `reglueModules` after terrain edits
- `src/npcs.js` — NPC list + waypoint FSM (`updateNPC`), task points derived from `SPOTS`
- `src/save.js` — localStorage save/load, schema v2; **all loaded data is validated in `isValidSave` — keep that in sync with any schema change**
- `src/main.js` — scene assembly, input modes (Play/Orbit/Sculpt/Build), third-person camera, HUD wiring, render loop

`npm test` runs `test/smoke.mjs` — a node-only logic check (terrain, farm growth,
player movement, NPC schedule). Run it after changing any of those modules.

## Conventions

- Deliberate simplifications are marked with `ponytail:` comments naming the upgrade path (e.g. navmesh, cloud sync). Check those before adding a dependency — the upgrade may already be mapped.
- No new dependencies without need: currently only `three` (runtime) and `vite` (dev).
- localStorage is treated as untrusted input; anything read from it goes through validation before touching the scene.
