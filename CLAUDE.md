# CLAUDE.md

This file is Claude's memory for Wind Rider. Read it before touching code.

## Art direction

Low-poly flat shading, soft silhouettes, warm colors, gold trims. Painted
skies, bloom, particles, glass UI. No realistic assets or photo textures.

The pilot is a paper airplane: plain cream paper (`#f6eedb`, no gold or
yellow on the paper itself), folds read through shading, a pale warm
emissive plus an unlit additive glow shell (`FX.pilotGlow`, `FX.glowShell`),
no halo. The theme colour for trails, debris, name tag, crash burst and
dissolve is light gold `#f2d27a` (`PLAYER_COLOR`, `toon.ts GOLD`, first entry
of `rooms.py` COLORS); every glowing particle uses that gold. Each biome
mood's `accent` is muted (no neon) and belongs to the biome's own things:
the gates and future biome gameplay pieces, never the pilot or its effects.

## The game

Wind Rider is a browser wingsuit racer. Seeded procedural courses through
floating islands and eight biomes, crystal gates, multiplayer race rooms.
React + Three.js frontend, FastAPI backend behind Caddy, `docker compose`.

### Modes

- **Solo**: time trials on any seed. Practice mode — no progression.
- **Multiplayer rooms**: race the same map at the same time. Up to 12 pilots.
- **Test** (`/?test`): free flight through any biome; worlds, light and
  half speed from its panel (no debug keys: they fought the flight
  bindings). Not exposed to players.

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

### Working with Stella

- No browser or in-game screenshots unless she asks: the round trips are
  slow. Blender headless renders are fine when she asks for renders.
- Before any concrete change technique (how to thicken a mesh, recolour,
  restructure, tune), list the options and each one's drawbacks and wait
  for her pick. Read-only checks that inform the options are fine.
- "成本" / "贵" means runtime performance only (frame time, draw calls,
  memory, bytes), never authoring effort or tokens. Choose by visual
  quality first, performance second.
- Verify terrain and gameplay changes with numbers (node scripts against
  the TS sources: height profiles, ray casts, triangle counts, the test
  suite), not by flying the game in the browser. Temporary scripts go
  under `frontend/tests/` so `three` resolves; delete them after.
- Tests run on Windows node 22 from `frontend`:
  `node --experimental-strip-types --import ./tests/register.mjs --test tests/*.test.mjs`
  (WSL's node 20 cannot). Lint and types: `node node_modules/eslint/bin/eslint.js`,
  `node node_modules/typescript/bin/tsc -b`.
- Chinese in chat, English in code, comments, commits and this file.

### Design principles

- Walls are not for hackers. The canyon walls keep racers inside the course
  naturally; a player who climbs over them is hacking and gets no
  performance budget. Nothing past `TERRAIN.generateLateral` is generated,
  and nothing beyond the walls needs to look right. `FLIGHT.lateralClamp`
  (150 m) is a bug guard, not a play area.
- "Decoration" in the terrain streamer is the same land as everything else,
  just more than `TERRAIN.decorationLateral` (80 m) off the racing line: it
  never splits finer than LOD 2 (12 m cells) and its requests queue last.
  The walls themselves (90 to 160 m) are decoration.
- Gameplay grows out of what is already on screen (the reef jellyfish's
  discharge first, its effect on the pilot next), not out of new abstract
  pickups.
- Terrain generators beat imported models for anything placed many times;
  imported CC BY models are for a few distinctive things (credit them in
  `CREDITS.md`).

### Architecture (frontend/src)

| Path | What |
|:-----|:-----|
| `game/Game.ts` | Frame loop, physics steps, race state, HUD, effects, rendering |
| `game/flight.ts` | Arcade flight model (`FLIGHT` constants). Physics only |
| `game/avatar.ts` | Paper-airplane pilot (`public/models/pilot.glb`), glow shell, ghosts |
| `game/camera.ts` | Chase camera, crash fall camera |
| `game/particles.ts` | GPU particle system |
| `game/pilotfx.ts` | Wingtip ribbons, motes, roll arcs, boost dust |
| `game/trail.ts` | Glowing ribbon trail |
| `game/toon.ts` | Flat material and shared light parameters |
| `game/world/` | Terrain generation, biomes, courses, trees, water, atmosphere |
| `game/world/crystals.ts` | Crystal gates |
| `game/world/deep.ts` | Underwater life: light shafts, fish, jellyfish and their discharge |
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

### 2026-10-18: Paper airplane pilot, reef jellyfish, lateral terrain cut (Claude)

- Pilot: `pilot.glb` rebuilt in Blender from the original mesh with hand-layered,
  tapered paper thickness (Solidify stair-stepped; rejected), cream paper all
  over. Emissive paper plus an unlit additive glow shell (`FX.pilotGlow`,
  `FX.glowShell`); the halo sprite is gone. Theme colour `PLAYER_COLOR`
  `#f2d27a` (light gold), also the first room colour in `rooms.py`.
- Removed pets, cosmetics, items and the gallery screen (cosmetics remnants).
  One particle gold (`toon.ts GOLD`); crash burst and dissolve take the
  pilot's colour. All 20 biome-mood accents re-tuned off neon; accent is for
  the gates and future biome gameplay pieces only, never the pilot.
- Camera: `CAMERA.fov` 58, speed stretch 0.2 up to 14 (was wider).
- Reef jellyfish (`world/deep.ts`): chinabazooka's "Jellyfish" (CC BY 4.0,
  `CREDITS.md`) decimated to 3.4k tris with bell and tentacle textures, tinted
  in four per-instance colours. Seeded discharge cycle on the race clock
  (`DEEP.zapCycle` 4 s, 0.5 s telegraph, 1 s active; `jellyCycle()` is the
  CPU copy of the shader's phase): a torus shock hoop rolls out, brightness
  capped under the bloom threshold. Most sit beside the line (`jellyNear`),
  all collapse past `jellyView` 200 m. Looks only so far: no reaction to
  touching one yet (that is the next gameplay step). COLOR_0 tags are a
  normalised uint16 attribute: read them with `getX/Y/Z`, never the raw array.
- Terrain: `TERRAIN.generateLateral` 280 m; past it no land is generated or
  drawn. On the reef the wall breaks the water surface at 275 m, so what is
  cut is above the water (mesh test pins this). On-line triangles ~145k →
  ~108k. Decoration (past `decorationLateral` 80 m) is the same land at
  LOD 2, and the wall itself is decoration. Players who climb the walls are
  not racing: nothing beyond is paid for.
- Test mode has no keys any more (Shift+S, N/B/V); worlds, light and half
  speed are panel buttons. Tests: adventure-era actions and chords dropped,
  look-ahead test rewritten on a node the line runs through.

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
