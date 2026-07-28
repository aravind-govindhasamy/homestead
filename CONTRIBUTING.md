# Contributing

## Setup

Node 20.19+, then `npm install` and `npm run dev`.

## Before committing

- `npm run build` must pass (CI runs it on every push).
- No new dependencies without a clear need — check for a `ponytail:` comment
  first; the upgrade path for most missing features is already mapped there
  and in [deep-research-report.md](deep-research-report.md).
- Anything read from localStorage (or any future external input) must be
  validated before it touches the scene — see `isValidSave` in
  [src/save.js](src/save.js), and keep it in sync with schema changes.

## Layout

One module per domain under `src/` (terrain, buildings, npcs, save), wired
together by `main.js`. State lives in the module that owns it. Architecture
notes and conventions: [CLAUDE.md](CLAUDE.md).

## Verifying changes

Run the app and walk the checklist in
[.claude/skills/run-app/SKILL.md](.claude/skills/run-app/SKILL.md):
terrain sculpts, modules place/remove with snapping, NPCs walk their
schedule, save → reload → load restores the world.
