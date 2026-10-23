# Wind Rider: next steps

The backlog. `CLAUDE.md` says what the game is and how we work; this file
says what we are doing now and what comes after. Every window reads both
before touching code, and updates this one at commit time: finished items
move to "Done lately", what the work turned up goes under "Now" or "Next".
Keep "Now" short: it is what is actually in flight.

Last updated 2026-10-19.

## Where things stand

A browser wingsuit racer with a paper-airplane pilot: solo time trials and
rooms of up to 12, five biomes from one seeded map pool (glacier canyon,
lagoon, glowing forest, sunken reef, floating islands with ponds and stone
bridges), crystal gates as optional speed boosts (any order, the finish is
the only must), the Sunken Reef bounded by canyon walls, the other biomes
still by a silent 150 m hold.
Low-poly flat shading, cream paper and light gold. Adventure mode, pets,
cosmetics, items and the gallery are gone; the game is racing only.

## Now

0. **The painted look**, one step at a time, judged on the Archipelago's
   Autumn mood (the closest to a storybook already), each step a tuning
   group with an off switch so it can be compared and dropped. Step 1 is
   in (branch `paint-look`, PR #13): a colour grade over the finished
   frame, warm highlights, violet shadows, lifted blacks, vignette, paper
   grain (`PAINT` in tuning.ts, `paint.ts`, a pass after the bloom; High
   quality only). Each mood is judged on its own and keeps its own numbers
   (`paint` in its palette); `PAINT.override` puts the sliders over every
   mood while tuning. Judged so far: Archipelago Autumn (full strength).
   Order: the day moods (Alpine, Lagoon noon, Glacier polar day and dawn,
   Gloaming), then the nights, the Reef last with its own grade. Steps to come if step 1 reads right: ramped (two or three step)
   lighting with warm/cool shadow colours and a sky-driven ambient, in the
   flat-shaded material (never smoothed normals on the low-poly land: that
   was tried once and turned every facet into a gradient); a vertical
   vertex-colour gradient per island and tree; then silhouette ornament on
   structures and trees. Validation order over the other biomes is
   Stella's to decide (Glacier's snow is the stress test for cool shadows;
   the Reef needs its own grade under water).
1. **Jellyfish as gameplay (Reef).** The discharge exists and reads clearly:
   a seeded 4 s cycle, 0.5 s telegraph, 1 s shock hoop (`DEEP`, `deep.ts`,
   `jellyCycle()` is the CPU copy of the shader's phase). Nothing happens
   yet when you touch one. To do: a touch volume per jellyfish (bell radius
   from `home.w`), a reaction when it is discharging (bounce or a jolt; the
   earlier push attempt was not felt, so the effect must be big enough to
   read), none when it is resting, a sound, and a test on `jellyCycle`
   agreeing with the shader. Looks never decide gameplay: `jellyCycle`
   does, the shader only draws it. Waiting on Stella for jellyfish
   animation assets (the model is chinabazooka's, tentacles kept, no
   animation yet).
2. **Canyon walls for the rest of the ground biomes**, one at a time via
   `terrain.walls` in each recipe (Reef is done, `WALLS` in tuning.ts).
   Each one needs its own check of `TERRAIN.generateLateral` (280 m, set
   for the Reef where the wall breaks the water surface at 275 m): the
   reference elsewhere is the fog end or the skyline. Glacier is the one
   mountain canyon, so it goes first. The Archipelago has no ground to
   build walls from and needs its own boundary scheme: a line of tall,
   close islands either side (an island canyon), or accept it as the open
   biome with the 150 m hold.
3. **Desktop HUD into the bottom corners.** With walls on both sides the
   lower corners of the frame show only wall, so they are free for UI; the
   phone layout already uses them (flight meters bottom left, touch pad
   bottom right). Decide the desktop layout once the walls are on every
   biome, since the corners are only reliably wall then.

## Next

- **Biome gameplay pieces**, grown out of what is already on screen rather
  than new abstract pickups, coloured with the biome's `accent`. Jellyfish
  first; candidates after: thermals above Twilight's mushroom caps,
  crosswinds on the Glacier, buoyancy on the Reef, updrafts off the islands.
  Per-biome physics would mean `biome.physics?: { gravity, drag, ... }` in
  flight.ts and leaderboards scoped per biome.
- **Proximity boost feedback.** The skim reward is still nearly invisible:
  colour shift, speed-line burst, camera pull, a sound, a louder HUD bar.
  This is the core risk/reward mechanic.
- **Music** of their own for Lagoon and Reef (they play the tracks written
  for the retired Ember Wastes and Verdant Highlands).
- **Island extras, parked.** Ponds and stone bridges are done (PR #12) and
  the islands look good enough that the rest waits: streams on ordinary
  islands (a channel from the pond to the rim waterfall with a ribbon of
  water, no bridge, too small to mesh at 3 m) and rope bridges (a two-anchor
  structure that sways) for long gaps. Waterfalls stay rare: Stella means
  to hang gameplay on them (getting wet, slowing down), so they must not
  be everywhere.
- **Gamepad**: no Enter (start race) or pause mapping, no haptics.
- **Playtesting** with a human on mouse and gamepad in a focused window;
  mouse sensitivity (default 2) and gamepad dead zone (0.12) were tuned by
  tests only. Log real frame times on an integrated GPU.
- **Progression and matchmaking**: daily or all-time leaderboards (new
  backend endpoints), weekly challenges, a "Quick Race" that matches 2 to 4
  players on a random seed, 3 to 5 featured seeds as the competitive pool.
- **Wind currents or thermals** as visible columns that make route choices.
  Speed-feel posts along the track are no longer needed: the walls give the
  motion reference.
- **Landmarks** (the one big structure per biome) are parked: nothing to do
  there until the gameplay pieces are in.

## Known breakage

- None in the tests (59 pass). `docs/audit-2026-10-11.md` is a snapshot and
  is not kept up to date; `CREDITS.md` and `docs/biomes.md` are current as
  of 2026-10-19.

## Done lately

- 2026-10-19: the Archipelago rebuilt as the island biome: 120 islands,
  ponds on nearly half of them with lanterns around, a `bridge` gate kind
  the line flies under, ramped stone bridges between neighbouring islands,
  moods trimmed to Alpine and Autumn (PR #12).
- 2026-10-18: down to five biomes. Ember Wastes removed with everything only
  it used; Aurora Summit folded into Glacier Peaks (dawn and night moods,
  crystal rings, a summit on half the courses, observatory, pylons, altars);
  Verdant Highlands folded into the Sky Archipelago (oak, birch, bush,
  flowers, watchtower landmark, windmill, shrine gate, Moonlit mood, the
  Einstein bust; the ETH main building deleted). Seeds remapped.
- 2026-10-18: terrain generation cut 280 m off the line (nothing beyond the
  walls is made; on-line triangles 145k to 108k); look-ahead test rewritten;
  test mode's keys removed, panel only; biome asset inventory
  (`docs/biomes.md`); README and credits rewritten.
- 2026-10-18: Reef jellyfish on chinabazooka's model in four colours, seeded
  discharge cycle with a torus shock hoop; COLOR_0 uint16 tag bug fixed.
- 2026-10-17: canyon walls on the Reef replace the wind push and the corridor
  posts (PR #6); camera field of view narrowed to 58.
- 2026-10-17: paper airplane rebuilt with layered thickness, cream paper,
  emissive plus glow shell; theme colour light gold `#f2d27a`; pets,
  cosmetics, items and the gallery deleted; biome accents muted.
- Earlier (see `CLAUDE.md` change log): flat shading unified, Sky Isles
  biome and legacy renderer deleted, adventure mode stripped, LOD 3 skipped,
  freeze zone, prefetch, decoration capped at LOD 2.
