# Homestead

An editable 3D dream home in the browser — sculptable terrain, modular building,
and a small NPC family living out their day. Built with [Three.js](https://threejs.org/)
and [Vite](https://vite.dev/), vanilla JavaScript, no framework.

Inspired by the "Last of John's Home" concept; design research lives in
[deep-research-report.md](deep-research-report.md).

## Features

- **Terrain** — procedural value-noise heightmap with height-based coloring, sculptable in-app with a raise/lower brush
- **Building** — grid-snapped wall/floor/roof modules with ghost preview; starter cabin included
- **NPCs** — Alice (farmer) and Bob (beekeeper) walk between field, hives, pond, and home on a task schedule with awake hours
- **Day/night** — 2-minute full day drives sun angle, light intensity, and sky color
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
|------|--------|
| **View** | Left-drag orbit, right-drag pan, wheel zoom |
| **Sculpt** | Left-drag to raise/lower terrain (Raise/Lower toggle in panel) |
| **Build** | Click to place the selected module, right-click to remove one |
| Any | Save / Load buttons persist and restore the world |

## Project structure

```
index.html          UI overlay + canvas host
src/main.js         scene, lights, day clock, input modes, render loop
src/terrain.js      heightmap generation, sculpting, height sampling
src/buildings.js    module definitions, snapping, place/remove
src/npcs.js         NPC roster and waypoint state machine
src/save.js         localStorage persistence with validation
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
