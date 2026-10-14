# WindRacer: Racing Game Next Steps

## Current State (post adventure-mode strip)

Pure browser wingsuit racer: solo time trials, multiplayer race rooms, 8 biomes with seeded courses. Low-poly flat-shaded art style. Test mode for debugging.

## Priority 1: Controls (hand-feel is the lifeline)

- **Real playtesting needed**: almost all tuning was done via automated tests in hidden tabs, never with a human on mouse/gamepad in a focused window
- **Gamepad gaps**: can't press Enter (start race) or pause; no haptics
- **Mobile**: tested on real devices, touch controls work. iOS Chrome fullscreen fixed (webkit prefix fallback). Tilt (gyroscope/accelerometer) not yet supported
- **Mouse sensitivity**: default 2x, never tested across different devices/DPIs
- **Dead zone tuning**: gamepad stick dead zone needs real-controller validation

## Priority 2: Gameplay (what keeps people racing)

- **Progression system**: no unlockables, no ranks, no reason to come back after beating your own time. Options:
  - Global/daily leaderboards (backend needs new endpoints)
  - Cosmetic unlocks tied to milestones (X gates in a row, sub-Y time)
  - Seasonal/weekly challenges
- **Matchmaking**: rooms are manual create/join only. For a browser game, "Quick Race" with auto-matching would dramatically improve multiplayer
- **Iconic tracks**: procedural courses are great for variety but bad for mastery. Consider "featured tracks" with hand-tuned seeds that become the competitive standard
- **Comeback mechanics**: a player 10 seconds behind in multiplayer has no way back. Options: drafting/slipstream behind other players, speed boost rings on alternate paths, risk/reward shortcuts through tight gaps
- **Spectator / replay**: after finishing, watch others or rewatch your run

## Priority 3: Graphics (speed sensation)

- **Speed feel**: speed lines and FOV kick exist, but need assessment at focused-window frame rates. Consider: radial blur at high speed, camera shake scaling, tunnel vision effect, particle density with speed
- **Track readability at speed**: crystal gates guide the path, but in narrow canyons or at night, is the next gate always visible enough? Consider a racing line ghost or stronger gate glow at distance
- **60fps verification**: all perf measurements were in hidden/throttled tabs. Need real integrated-GPU benchmarks at Medium and High quality
- **HiDPI**: High quality draws at 1x even on HiDPI screens; with the cheaper bloom (no MSAA), 1.25-1.5x might be affordable now

## Future: Wingsuit Identity Overhaul (new branch)

### Avatar redesign
- Replace bird-wing avatar with wingsuit motif: membrane between arms and
  torso (flying squirrel style), leg membrane, helmet/goggles
- Spread/tuck animation maps to decelerate/accelerate (no flapping)
- Cosmetics become: helmet styles, suit patterns, goggle types

### Flight model: remove jetpack, add environment
- Delete rechargeable boost (feels like a jetpack, not a wingsuit)
- Speed comes from environment interaction:
  - Diving (already works: pitch down = accelerate)
  - Proximity boost (already exists, strengthen it)
  - Wind currents / thermals (visible columns in the world, fly through for lift/speed)
  - Gate boost (brief speed pulse on clean ring pass)
- Default state is always descending; gaining height requires skill
  (flare from a dive, catch a thermal)

### Per-biome physics (biggest gameplay differentiator)
- Each biome defines optional physics overrides:
  - Canyons (Verdant, Ember): standard gravity, thermals over hot spots
  - Floating islands (Archipelago): low gravity, floaty/forgiving
  - Ice/aurora (Glacier, Aurora): standard gravity + strong crosswinds
  - Underwater (Reef): buoyancy replaces gravity, high drag, can ascend
  - Mushroom forest (Twilight): thermals above mushroom caps
- Implementation: `biome.physics?: { gravity, drag, ... }` read by flight.ts
- Biomes become distinct gameplay experiences, not just skins
- Leaderboards scoped per biome (different physics = different records)

## Quick Wins

1. Backend leaderboard endpoints (daily/all-time per seed)
2. Gamepad Enter/Pause mapping
3. One focused-window playtest session logging real frame times
4. "Quick Race" matchmaking (random seed, wait for 2-4 players, go)
5. 3-5 "classic" seeds curated as the competitive track pool
