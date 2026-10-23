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
five biomes (a glacier canyon, a lagoon, a glowing forest, a sunken reef,
floating islands with ponds and stone bridges), crystal gates, multiplayer
race rooms.
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

1. Read this file first, then `docs/racing-next-steps.md` (the backlog: what
   is in flight and what comes next). Record changes here at commit time
   (not mid-work), and update the backlog in the same commit: finished
   items to "Done lately", new findings to "Now" or "Next".
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

Docs: `docs/racing-next-steps.md` is the backlog (rule 1). `docs/biomes.md`
is the inventory of every biome's assets (surfaces, features, gates, flora,
structures, sky, particles, music); update it when a biome recipe changes.
`docs/debug-mode.md` is test mode.

## Change log

### 2026-10-23: Painted look, step 2: banded light, warm lit side, cool shade (Claude)

- `PAINT_LAMBERT_GLSL` (paint.ts) replaces three's
  `lights_lambert_pars_fragment` in every `atmospheric()` material (land,
  plants, structures): the sun's `dotNL` quantised into `steps` bands with
  `soft` edges, the lit side multiplied towards gold (`warmLight`), the
  hemisphere's share of the shade towards blue-violet (`coolShade`), all
  blended in by `ramp` (0 is Lambert exactly). Uniforms in `PAINT_LIGHT`,
  fed each frame by `updatePaintLight(palette)` at any quality. Each flat
  face takes one band; normals are never smoothed on the low-poly land.
  Judged on the Archipelago's Autumn mood, which carries the numbers.

### 2026-10-23: Painted look, step 1: colour grade, vignette, paper grain (Claude)

- `PAINT` tuning group ("Painted look" in `?tune`), off by default
  (`grade` 0): a full-screen pass (`paint.ts`, a `ShaderPass` after the
  `OutputPass` on the bloom chain, so it grades in display space like a
  LUT) with warm highlights, violet-blue shadows, lifted blacks, contrast,
  saturation, a corner vignette and a grain fixed to the screen like
  paper. Skipped entirely at grade 0; runs only with the bloom (High
  quality). An experiment towards a storybook look, judged one mood at a
  time: a judged mood carries its own numbers (`paint` in its palette,
  `PaintGrade`) over PAINT's defaults, and `PAINT.override` puts the
  sliders over every mood while tuning. Archipelago Autumn judged first,
  at full strength. The next steps (ramped lighting with warm/cool
  shadows, vertex-colour gradients, silhouette ornament) wait on how the
  grade reads across the moods.

### 2026-10-19: Archipelago moods trimmed to Alpine and Autumn (Claude)

- Misty pines, Dusk and Moonlit dropped after Stella looked at the islands:
  one crisp green day and one amber one. The Archipelago has no night mood.

### 2026-10-18: Stone bridges between the floating islands (Claude)

- A `bridge` gate kind (Archipelago only): a humped stone bridge spanning
  the line between two small islands made for it, its arch centred on the
  line and wider than the tube on every side; the tube carve keeps the
  passage clear as for every gate. Painted with the recipe's
  `named.bridge` surface (worked stone, surface 2).
- `World.findIslandBridges` (`terrain.islandBridges`): scenery bridges
  between neighbouring islands off the line, 80 % of the pairs 10 to 50 m
  apart rim to rim, one bridge per island at most, 20 m or more from the
  line, the middle of the gap checked empty (a gate's ring or ridge or a
  third island can stand there). `Bridge` gained a `slope`: the deck ramps
  where one island stands higher, up to about 24 degrees, which is what
  makes enough pairs (islands spread 200 m in height; flat decks found
  only a handful). The hump is tall because the field blends the abutments
  into the island rock over 6 m and a low arch would close.
- 120 islands instead of 60, so bridges have somewhere to go.
- Test over three seeds: deck solid under the crown, air over it, arch
  open, ends in rock, gate bridges on the line with the tube clear,
  scenery bridges 20 m from it, at least 3 gate and 15 scenery bridges.

### 2026-10-18: Ponds on the floating islands (Claude)

- `World.findIslandPonds`: on 45 % of Archipelago islands 20 m and up
  (`terrain.islandPonds`, independent of the rim waterfalls) a bowl is
  carved into the island's top under a flat rock lip (`NoiseIsland.setPond`:
  a lip disc unioned, an ellipsoid bowl carved; the island's grain fades
  out around it via `Shape.roughnessAt`, a new optional hook the field
  honours). The real top is found by marching down onto the rock; a pond
  whose bowl or lip another shape spoils is dropped (`pondIsClean`).
- The water is a still disc in `WaterView.buildPonds` with the pool shader
  (no current, shore foam from the depth), and solid for collisions like
  river pools (`World.otherDistance`). `wet` placement counts ponds, so
  lanterns gather around them (a dense lantern entry on the Archipelago).
- Test: bowls open, lips rock all round, water solid, clear of the tube,
  every wet lantern by a pond, over two seeds.

### 2026-10-18: Five biomes: Aurora into Glacier, Verdant into the Archipelago (Claude)

- Glacier Peaks absorbs Aurora Summit: moods Polar day, Summit dawn, Aurora
  night (Polar night dropped as a duplicate); the glowing crystal surface and
  the six crystal rings; the summit spire on half the courses (`summit`
  features take a `chance`); violet crystals beside the blue; observatory as
  a second landmark (each on half the stretches), pylons, star altars,
  lanterns; starfall at night.
- Sky Archipelago absorbs Verdant Highlands: moods Alpine, Misty pines,
  Autumn, Dusk, Moonlit (Winter and Starlight dropped; Moonlit is Alpine
  shifted as Verdant's Morning was to its Moonlit); oak, birch and bush
  among the pines; Verdant's four flower colours; a watchtower landmark per
  stretch, the Einstein bust (one level in three), windmills on bare tops,
  shrine gates, lanterns, petals. Everything that stood on a river stays
  out (bridges, lakeside lanterns). Island structures need `on: "rock"`:
  the default site is open ground, which islands never have.
- Deleted `biomes/aurora.ts`, `biomes/verdant.ts` and the ETH main building
  (model, collider, test). Biome count 7 → 5; seeds remapped again. The
  test world defaults to the Archipelago; the Reef plays Dewdrop Stream
  under the key `dewdrop`.
- Tests: the Einstein bust is checked over 24 island seeds (one level in
  three, never two, always 25 to 140 m off the line); the crystal-shading
  test uses the Glacier's crystal surface; the bridge test is gone.

### 2026-10-18: Remove the Ember Wastes biome (Claude)

- Deleted `biomes/ember.ts` and everything only it used: the lava water
  kind (shader branches, lava falls, spark wakes and spray), the volcano
  shape and feature and the island `crater` style, the forge temple,
  obelisk and brazier structures, the dead tree and basalt flora, the
  embers and ash particles, and the palette's `underglow`. Biome count
  8 → 7. The track `ember_red-orange-embers.mp3` stays and plays in the
  Lagoon until it gets its own.
- `seedMap` picks a biome by its place in the list, so most seeds now stand
  for a different map (there is no production data to carry over).
- Tests that used Ember as their sample biome use Glacier, Twilight or
  Aurora instead.

### 2026-10-18: Mountains stand on the canyon wall; reef's dead config pruned (Claude)

- With canyon walls on, a biome's `mountains` no longer start `from`/`ramp`
  metres out (that land was under the wall floor or past
  `TERRAIN.generateLateral`): they rise with the wall's band and sit on top
  of its floor as the ridge line. `from`/`ramp` are optional and only used
  without walls. One `Ground.mountains()` serves both paths.
- Reef: mountains `amp` 250 → 60 (the ridge varies about ±30 m around the
  wall's profile; 120 doubled the wall's height), `from`/`ramp` dropped,
  `extent` 1400 → 300, the far `mesas` feature removed, structure `lateral`
  ranges capped at 110 m (the wall's foot). Land within the foot unchanged.

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
