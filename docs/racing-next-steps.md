# Wind Rider: next steps

The backlog. `CLAUDE.md` says what the game is and how we work; this file
says what we are doing now and what comes after. Every window reads both
before touching code, and updates this one at commit time: finished items
move to "Done lately", what the work turned up goes under "Now" or "Next",
and a dropped idea goes to the bottom with the reason, so it is not tried
twice. Keep "Now" short: it is what is actually in flight.

Last updated 2026-10-18.

## Where things stand

A browser wingsuit racer with a paper-airplane pilot: solo time trials and
rooms of up to 12, eight biomes from one seeded map pool, crystal gates as
optional speed boosts (any order, the finish is the only must), the Sunken
Reef bounded by canyon walls, the other biomes still by a silent 150 m hold.
Low-poly flat shading, cream paper and light gold. Adventure mode, pets,
cosmetics, items and the gallery are gone; the game is racing only.

## Now

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
   reference elsewhere is the fog end or the skyline. Ember's volcano
   (900 m out) and both Ember's and Verdant's mesas (300 to 1000 m out)
   fall past the cut and need a decision: move them in, or let them go.
   The Archipelago has no ground to build walls from and needs its own
   boundary scheme.
3. **Desktop HUD into the bottom corners.** With walls on both sides the
   lower corners of the frame show only wall, so they are free for UI; the
   phone layout already uses them (flight meters bottom left, touch pad
   bottom right). Decide the desktop layout once the walls are on every
   biome, since the corners are only reliably wall then.

## Next

- **Biome gameplay pieces**, grown out of what is already on screen rather
  than new abstract pickups, coloured with the biome's `accent`. Jellyfish
  first; candidates after: thermals over Ember's lava and above Twilight's
  mushroom caps, crosswinds on Glacier and Aurora, buoyancy on the Reef.
  Per-biome physics would mean `biome.physics?: { gravity, drag, ... }` in
  flight.ts and leaderboards scoped per biome.
- **Proximity boost feedback.** The skim reward is still nearly invisible:
  colour shift, speed-line burst, camera pull, a sound, a louder HUD bar.
  This is the core risk/reward mechanic.
- **Music** of their own for Aurora, Lagoon and Reef (they borrow Glacier's
  and Verdant's tracks).
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

- `tests/structures.test.mjs`: two assertions fail. "every run biome has a
  landmark" expects the Archipelago to have one and it has only lanterns;
  "the Einstein bust is a rare landmark" finds none on the level it checks.
  Decide whether the recipes or the test are right.
- `CREDITS.md` and the inventory are current as of 2026-10-18; `docs/audit-2026-10-11.md`
  is a snapshot and is not kept up to date.

## Done lately

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

## Dropped

- Air wall (wind push) and corridor marker posts: the land is the boundary now.
- Reef geysers, currents and bubble shield (PR #5): reverted; gameplay is
  to grow from the jellyfish first.
- Solidify for paper thickness (stair-stepped rims); gold or yellow paper
  (read as dirty yellow); the halo sprite; cloth membrane wings; the dorsal
  fin on the helmet; the chibi and jetpack pilots.
- Procedural jellyfish tentacles and n-'s moon-jelly bell (veins unreadable
  under water); a flat shock ring and a swelling shell for the discharge.
- Player colour customisation; segment timing; thick fog or a curtain plane
  to hide loading; dither dissolve between levels of detail.
