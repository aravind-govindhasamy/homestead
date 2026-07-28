# Homestead

An editable 3D dream home in the browser — sculptable terrain, modular building,
and a small NPC family living out their day. Built with [Three.js](https://threejs.org/)
and [Vite](https://vite.dev/), vanilla JavaScript, no framework.

Inspired by the "Last of John's Home" concept; design research lives in
[deep-research-report.md](deep-research-report.md).

## Features

- **Third-person play** — WASD + camera-orbit control of a stylized character with walk/run animation
- **Modern home** — flat-roof house with glass front, wood accent wall, deck, and a warm interior light that comes on at dusk
- **Farming** — plant crops with E, watch them grow, harvest when ready; harvest counter in the HUD
- **Terrain** — procedural value-noise heightmap with blended coloring, flattened pads for house/farm/pond, sculptable with a raise/lower brush
- **Environment** — atmospheric sky (three.js Sky + ACES tone mapping), day/night cycle, instanced trees, rocks, flowers, a pond, and beehives
- **Building** — grid-snapped wall/floor/roof modules with ghost preview
- **NPCs** — Alice (farmer) and Bob (beekeeper) walk between farm, hives, pond, and home on a schedule with awake hours
- **Save/Load** — world state persists to localStorage (validated on load)

## Quickstart

Requires Node 20.19+ (Vite 8).

```sh
npm install
npm run dev      # http://localhost:5173
npm run build    # production build to dist/
npm run preview  # serve the built dist/
```

## Controls

| Mode | Action |
| ---- | ------ |
| **Play** | WASD move, Shift run, left-drag look, wheel zoom, E plant/harvest |
| **Orbit** | Free camera: drag orbit, right-drag pan, wheel zoom |
| **Sculpt** | Left-drag to raise/lower terrain (Raise/Lower toggle in panel) |
| **Build** | Click to place the selected module, right-click to remove one |
| Any | Save / Load buttons persist and restore the world |

## Project structure

```text
index.html          HUD overlay + canvas host
src/main.js         scene assembly, input modes, third-person camera, render loop
src/terrain.js      heightmap generation, flattened pads, sculpting, height sampling
src/environment.js  sky, sun/day cycle, renderer config, instanced scenery, pond, fence
src/player.js       character factory (shared with NPCs), third-person movement
src/house.js        modern house composition
src/farm.js         plots, crop growth, plant/harvest interaction
src/buildings.js    build-mode module definitions, snapping, place/remove
src/npcs.js         NPC roster and waypoint state machine
src/save.js         localStorage persistence with validation (schema v2)
```

More detail in [CLAUDE.md](CLAUDE.md) (architecture and conventions) and
[CONTRIBUTING.md](CONTRIBUTING.md).

## Roadmap

The full feature roadmap (glTF assets, navmesh pathfinding, physics, cloud sync,
LOD/instancing) is mapped in [deep-research-report.md](deep-research-report.md).
Deliberate shortcuts in the code are marked with `ponytail:` comments naming
their upgrade path.

## License

[MIT](LICENSE)
