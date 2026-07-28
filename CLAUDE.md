# Homestead

Editable 3D dream-home web app (Three.js + Vite, vanilla JS, no framework).
Design source: `deep-research-report.md`.

## Commands

- `npm run dev` — dev server at http://localhost:5173
- `npm run build` — production build to `dist/` (must pass before committing)
- `npm run preview` — serve the built `dist/`

## Architecture

One module per domain, all state lives in the module that owns it:

- `src/terrain.js` — value-noise heightmap plane, `terrainHeightAt`, `sculptAt`, `refreshTerrain`
- `src/buildings.js` — module defs (wall/floor/roof), grid snap, place/remove, `reglueModules` after terrain edits
- `src/npcs.js` — NPC list + waypoint FSM (`updateNPC`), task points
- `src/save.js` — localStorage save/load; **all loaded data is validated in `isValidSave` — keep that in sync with any schema change**
- `src/main.js` — scene/renderer/lights, day clock, input modes (View/Sculpt/Build), UI wiring, render loop

## Conventions

- Deliberate simplifications are marked with `ponytail:` comments naming the upgrade path (e.g. navmesh, cloud sync). Check those before adding a dependency — the upgrade may already be mapped.
- No new dependencies without need: currently only `three` (runtime) and `vite` (dev).
- localStorage is treated as untrusted input; anything read from it goes through validation before touching the scene.
