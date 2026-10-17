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

### Avatar redesign (in progress)
- Kenney Mini Characters base model (CC0) + OpenGameArt jetpack (CC0)
- Arms removed; thick rigid wings cover the arm area
- Big wings are the dominant silhouette from the chase camera
- Jetpack on back with exhaust nozzles (boost glow)
- Fixed livery: cream wings, charcoal hardware, gold accents
- No player color customization (cosmetics system deleted)

### Flight model: electric wingsuit with boost
- Keep boost (re-themed as jetpack exhaust, not a button)
- Boost animation: exhaust nozzles glow, acceleration particles
- Speed sources:
  - Boost (electric fans, keep current mechanic)
  - Diving (already works: pitch down = accelerate)
  - Proximity boost (already exists — key tradeoff: risky but fast)
  - Wind currents / thermals (visible columns, fly through for lift/speed)
  - Gate boost (brief speed pulse on clean ring pass)

### Race format: free-route to finish
- Remove mandatory sequential gate checkpoints
- Terminal light pillar (finish line) is the permanent navigation beacon
- Gates become OPTIONAL acceleration rings — pass through for a speed
  boost, skip if your route doesn't cross them
- Route choice IS the gameplay: tight canyon with gates+proximity vs
  open sky that's safe but slow
- Proximity boost is the cost/reward mechanic that prevents players
  from always picking the easiest wide-open route
- Add environmental obstacles and acceleration zones (wind currents,
  thermals) to create distinct route options through the terrain

### Effects overhaul (TODO)
- **Wingtip trails → wingtip particles**: the two wing-tip trails are
  currently flat ribbon strips (Trail class). Replace with particle
  streams — small bubbles/wisps that scatter from the wing tips like
  cutting through air/water. NOT a solid ribbon trail.
- **Exhaust trails**: two cylindrical/conical trail ribbons from the
  jetpack exhaust nozzles (one per nozzle). These ARE solid trails,
  shaped like round exhaust plumes, not flat strips. Brighter/longer
  on boost.
- **Trail colors**: currently using PLAYER_COLOR (#ff5d73 neon pink),
  completely wrong. Change to:
  - Exhaust trails: gold→white (matching gold accent trim)
  - Wingtip particles: pale white/transparent wisps
- **PLAYER_COLOR cleanup**: `fx.setColor()` and `debris.setColor()`
  still pass neon pink to pilotfx and effects. Update to use the
  fixed livery accent color (gold `#f3c869`).
- **Gate colors**: already muted (commit da0b12c). Verify they look
  natural across all biomes; adjust per-biome tinting if needed.

### Boundary and navigation clarity
- Visible boundary markers along the racing corridor (glowing pillars
  every 50-100m, or energy-field particle wall near the air wall)
- Current soft air wall (60m) is invisible — players don't know if
  they're out of bounds or about to crash
- Strengthen proximity boost feedback: visual punch (color shift,
  speed line burst, camera pull), sound cue, HUD bar more prominent

### Dropped ideas
- ~~Segment timing~~ — not needed; real-time leaderboard is enough
- ~~Player color customization~~ — deleted; fixed livery is cleaner
- ~~Cloth membrane wings~~ — too complex, poor readability; rigid slabs
- ~~Dorsal fin on helmet~~ — looked like an antenna
- Show per-segment times so players know which sections to improve
- Compare against ghost/personal best per segment

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
