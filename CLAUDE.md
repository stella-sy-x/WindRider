# CLAUDE.md

This file is Claude's memory for Wind Rider. Read it before touching code.

## Art direction

Low-poly flat shading, chibi proportions, soft silhouettes, warm colors,
gold trims, capes and feathers. Painted skies, bloom, particles, glass UI.
No realistic assets or photo textures.

## The game

Wind Rider is a browser wingsuit racer. Seeded procedural courses through
floating islands and eight biomes, crystal gates, multiplayer race rooms.
React + Three.js frontend, FastAPI backend behind Caddy, `docker compose`.

### Modes

- **Solo**: time trials on any seed. Practice mode — no progression.
- **Multiplayer rooms**: race the same map at the same time. Up to 12 pilots.
- **Test** (`/?test`): free flight through any biome with debug shortcuts
  (Shift+P/O/S, N/B/V world switching). Not exposed to players.

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
7. Models: Opus 4.6 (1M context) as main agent, Fable 5.1 for subagents.

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
| `game/world/terrain/ground.ts` | Ground heightfield, incl. the canyon walls that bound the course |
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

### 2026-10-17: Canyon walls replace the air wall (Claude, Sunken Reef first)

- The course's boundary is now the land: `Ground.heightAt` has a floor either
  side of the racing line (`WALLS` in tuning.ts: foot at 90 m, a 70 m scree
  slope and cliff up to +50 m over the line, then +0.8 m/m on up; the first
  cut at 60/40 felt cramped). Noise only
  adds to the floor, never digs below it; the tube still carves the line.
  Per-biome opt-in/override via `TerrainRecipe.walls`; only `reef` has it so
  far, the other seven follow one at a time. Archipelago (no ground) needs
  its own scheme. Reload workers after editing `WALLS`.
- `FLIGHT.lateralClamp` (150 m, a silent hard hold in `Game.lateralClamp`)
  stays only as the last resort behind the land.
- Removed the wind push (`lateralLimit/lateralWall/lateralPush`, `airWall`)
  and the corridor marker posts (`world/corridor.ts`, `CORRIDOR` tuning).
- Reef triangles per 400 m of course (seed 2): LOD 0 within ±80 m
  unchanged (~43k), LOD 1 within ±150 m ~29k → ~34k, LOD 2 within ±300 m
  ~15k → ~16k.
- New mesh test: wall floor, tube clearance, and horizontal rays from the
  line hitting the drawn wall at LOD 0.

### 2026-10-12: Unify visual style (Claude)

- Removed external IP references (Genshin Impact, Sky)
- Replaced cel-shading with low-poly flat shading (deleted toon gradient,
  rim light, ink outlines; unified to MeshLambertMaterial + flatShading)
- Applied Plan B poly budget: avatar ≤2400 verts, wings ≤1500/pair,
  pets ≤1500, hats/shoes ≤400, items ≤600, trees ≤400. Max 12 segments.
- Deleted Sky Isles biome and legacy terrain renderer (islands.ts,
  mesher.ts, legacy branches in WorldView/World/worker). Unified to v2
  renderer only. Biome count 9 → 8. Existing Sky Isles ghosts/leaderboards
  invalidated.
- Improved Archipelago: sun 9°→28°, island noise 0.16→0.08, holes 35%→10%,
  vegetation density 6%→25%, pine-dominant, added 3 day moods.
- Fixed iOS Chrome fullscreen (webkit prefix fallback).
- Build and lint pass. Backend untouched.

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
