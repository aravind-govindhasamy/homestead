---
name: run-app
description: Run the Homestead dev server and verify the app works in a browser
---

# Run Homestead

1. Start: `npm run dev` (background) — Vite serves at http://localhost:5173.
2. Verify serving: GET http://localhost:5173/ and /src/main.js both return 200.
3. Manual/browser checks, in order of value:
   - Terrain renders with a cabin and two capsule NPCs walking between task points.
   - Sculpt mode: left-drag deforms terrain; cabin stays glued to ground.
   - Build mode: ghost preview follows cursor, click places snapped module, right-click removes.
   - Save, reload page, Load: terrain/buildings/clock restore.
4. Stop the background server when done.

Production check: `npm run build` then `npm run preview`.
