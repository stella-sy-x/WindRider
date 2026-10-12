# CLAUDE.md

This file is Claude's memory for Wind Rider. Read it before touching code.

## Art direction

Low-poly flat shading, chibi proportions, soft silhouettes, warm colors,
gold trims, capes and feathers. Painted skies, bloom, particles, glass UI.
No realistic assets or photo textures.

## The game

Wind Rider is a browser wingsuit racer. Seeded procedural courses through
floating islands and nine biomes, crystal gates, multiplayer race rooms.
React + Three.js frontend, FastAPI backend behind Caddy, `docker compose`.

### Modes

- **Solo**: time trials on any seed. Practice mode — no progression.
- **Multiplayer rooms**: race the same map at the same time. Up to 12 pilots.
- **Test** (`/?test`): free flight through any biome with debug shortcuts
  (Shift+P/O/S, N/B/V world switching). Not exposed to players.
- **Gallery** (`/?gallery`): item model showcase.

### Running it

```bash
docker compose up --build            # http://localhost:8080
cd backend && python app.py          # :8000
cd frontend && npm install && npm run dev  # http://localhost:5173
```

### Key rules

1. Read this file first. Record changes here at commit time (not mid-work).
2. Looks never change gameplay. Animation/particles/shaders must not alter
   flight model, collisions, ring checks or timing.
3. Performance budget: 60 fps on integrated laptop GPU at High quality.
4. Tunable looks go in `tuning.ts`, physics in `FLIGHT` (flight.ts).
5. Shader safety: never `pow()` on negatives, never divide by zero.
6. Don't add Claude as co-author on commits.

### Architecture (frontend/src)

| Path | What |
|:-----|:-----|
| `game/Game.ts` | Frame loop, physics steps, race state, HUD, effects, rendering |
| `game/flight.ts` | Arcade flight model (`FLIGHT` constants). Physics only |
| `game/avatar.ts` | Low-poly chibi pilot, animation, cloth, face |
| `game/camera.ts` | Chase camera, crash fall camera |
| `game/particles.ts` | GPU particle system |
| `game/pilotfx.ts` | Wingtip ribbons, motes, roll arcs, boost dust |
| `game/trail.ts` | Glowing ribbon trail |
| `game/toon.ts` | Flat material and shared light parameters |
| `game/world/` | Terrain generation, biomes, courses, trees, water, atmosphere |
| `game/world/crystals.ts` | Crystal gates |
| `game/world/landCollider.ts` | Collision with drawn land meshes |
| `game/cosmetics/` | Cape/hat/shoe/wing catalogs and sparkles |
| `game/pets/` | Companion pets |
| `game/items/` | Item models and gallery (cosmetic only, no mechanics) |
| `game/death.ts` | Crash animations |
| `game/autopilot.ts` | Racing-line autopilot for menu backdrop and victory |
| `game/audio.ts` | Wind, events, wingbeat sample, music player |
| `game/input.ts` | Keyboard, mouse, gamepad, touch merged input |
| `game/touch.ts` | Mobile touch controls |
| `session/` | Solo, room, explore sessions |
| `components/` | React screens: menu, HUD, lobby, results, settings |
| `net/` | Room connection (SSE down, POST up) |

Backend: `app.py` endpoints, `rooms.py` race state machine and SSE relay,
`store.py` SQLite ghosts and runs, `models.py` Pydantic models.

## Change log

### 2026-10-12: Strip adventure mode, keep pure racing (Claude)

Removed the entire roguelike adventure/run system to focus on racing:
- Deleted `game/run/` (10 files), `game/abilities/` (5 files), run-only
  items (5 files), `profile/`, `session/RunSession.ts`, run UI components
  (RunHud, Feather, CollectionPreview, ProfilePanel, kindIcons, TestCollectionPanel)
- Removed FlightMods from flight.ts (run-only flight modifications)
- Removed run stingers and portal audio from audio.ts
- Removed run tuning groups (RUN, ABILITIES_FX, ITEMS_FX, COLLECTION_FX)
- Removed run-only input actions (9 abilities/items bindings)
- Removed stance system from avatar.ts
- Removed Adventure tab from menu, run routes, profile integration
- Removed explore mode (kept test mode for debugging)
- Stubbed itemClearance.ts (always returns true for non-run levels)
- Cleaned relics from items/models.ts
- Build and lint pass. Backend untouched.
