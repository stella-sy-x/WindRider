# Wind Rider: Next Steps

## Current State

Electric wingsuit racer: solo time trials, multiplayer rooms, 8 biomes,
seeded courses, optional gate boosts, free-route to finish. Low-poly
flat-shaded art. Cosmetics system removed; fixed pilot livery.

---

## Controls

- **Playtesting**: tuning was done via automated tests, never with a
  human on mouse/gamepad in a focused window. Needs real sessions.
- **Gamepad**: can't press Enter (start race) or pause; no haptics
- **Mobile**: touch works. iOS Chrome fullscreen fixed. Tilt not supported.
- **Mouse sensitivity**: default 2x, untested across devices/DPIs
- **Dead zone**: gamepad stick dead zone needs real-controller validation

---

## Gameplay

### Race format (done)
- Gates are optional acceleration rings (+8 m/s on pass), any order
- Finish line (last ring) is the only mandatory target
- Gold finish beacon visible from start (1400m tall, breathing pulse)
- Canyon walls: the ground either side of the line rises into a wall from
  60m out (WALLS in tuning.ts, per biome); hitting it is a crash. Silent
  hard limit at 150m as a last resort (FLIGHT.lateralClamp)

### Race format (TODO)
- **Wind currents / thermals**: visible columns in the world, fly
  through for lift/speed. Creates route choices.
- **Proximity boost feedback**: currently invisible reward. Add visual
  punch (color shift, speed line burst, camera pull), sound cue,
  HUD bar more prominent. This is the core risk/reward mechanic.
- **Speed-feel markers**: small posts along the track sides that rush
  past at speed, providing motion reference without real terrain.

### Flight model
- Boost kept (re-themed as jetpack exhaust)
- Speed sources: boost, diving, proximity, gate pass, thermals (TODO)
- Per-biome physics (TODO):
  - Canyons (Verdant, Ember): standard gravity, thermals over hot spots
  - Floating islands (Archipelago): low gravity, floaty/forgiving
  - Ice/aurora (Glacier, Aurora): standard gravity + strong crosswinds
  - Underwater (Reef): buoyancy replaces gravity, high drag, can ascend
  - Mushroom forest (Twilight): thermals above mushroom caps
  - Implementation: `biome.physics?: { gravity, drag, ... }` in flight.ts
  - Leaderboards scoped per biome (different physics = different records)

### Progression
- No unlockables, no ranks, no reason to come back after beating your
  own time. Options:
  - Global/daily leaderboards (backend needs new endpoints)
  - Weekly challenges
- **Matchmaking**: rooms are manual. "Quick Race" with auto-matching
  would dramatically improve multiplayer.
- **Iconic tracks**: procedural courses = variety but no mastery.
  Featured seeds as the competitive standard.

---

## Graphics

### Avatar (in progress)
- Kenney Mini Characters base model (CC0) + OpenGameArt jetpack (CC0)
- Arms removed; thick rigid wings cover the arm area
- Big wings = dominant silhouette from chase camera
- Jetpack on back with exhaust nozzles (boost glow)
- Fixed livery: cream wings, charcoal hardware, gold accents
- Cosmetics system deleted; no player color customization

### Effects overhaul (TODO)
- **Wingtip trails → particles**: replace flat ribbon strips with
  particle streams (bubbles/wisps scattering from wing tips, like
  cutting through air). NOT a solid ribbon.
- **Exhaust trails**: two cylindrical/conical plumes from jetpack
  nozzles. Solid trails, round cross-section. Brighter/longer on boost.
- **Trail colors**: light gold `#f2d27a` (done: `PLAYER_COLOR` and the
  first room colour in `rooms.py`). Still to consider:
  - Exhaust: gold → white (matching accent trim)
  - Wingtip particles: pale white/transparent wisps
- **Gate colors**: muted (done). Verify across all biomes.

### Performance (done)
- LOD 3 removed (viewDistance 700m, sky silhouettes fill far distance)
- Freeze zone 80m (no pop-in near player)
- Prefetch to 1200m, lateral priority (racing line first)
- Hot-path: 91% of course.distance calls eliminated
- Decoration capped at LOD 2, scenery lateral ≤100m
- HiDPI: bloomResolution 1.5x

---

## Quick Wins

1. Backend daily/all-time leaderboard endpoints
2. Gamepad Enter/Pause mapping
3. One focused-window playtest session logging real frame times
4. "Quick Race" matchmaking (random seed, wait for 2-4 players, go)
5. 3-5 "classic" seeds curated as the competitive track pool

---

## Dropped Ideas

- ~~Segment timing~~ — real-time leaderboard is enough
- ~~Player color customization~~ — fixed livery is cleaner
- ~~Cloth membrane wings~~ — poor readability; rigid slabs better
- ~~Dorsal fin on helmet~~ — looked like an antenna
- ~~Thick fog to hide loading~~ — made scene dirty
- ~~Loading curtain plane~~ — visible as a wall
- ~~Dither dissolve for LOD~~ — looked like ash on bright skies
