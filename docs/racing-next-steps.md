# Wind Rider: next steps

The backlog. `CLAUDE.md` says what the game is and how we work; this file
says what we are doing now and what comes after. Every window reads both
before touching code, and updates this one at commit time: finished items
move to "Done lately", what the work turned up goes under "Now" or "Next".
Keep "Now" short: it is what is actually in flight.

Last updated 2026-10-24.

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

0. **Autumn, step 1: the air of a clean autumn afternoon.** Autumn's brief
   (Stella, 2026-10-24): a clean autumn afternoon about three o'clock, the
   autumn in the orange trees and the dry grass, the light itself clear.
   Its numbers are not there yet: the sky's horizon, the haze, the mist
   and the sun are all amber (copied from the old Sky Isles with the
   repository's first commit, never chosen), so from 400 m out the cloud
   sea, the far islands and the sky melt into one amber mass ("黄沙漫天":
   the middle and far distance carry no information). Only the five
   atmosphere colours change in step 1 (horizon to a pale blue-white,
   zenith a little deeper than Alpine's, sun warm white, mist and cloud
   with them), on the `look-per-mood` branch once its PR is in; same-frame
   before/after for Stella. Then, judged one at a time: the haze's start
   (80 m is early) and the sun glow's width; the cloud sea's own relief
   and shading so it reads as cloud; tone mapping (none today: everything
   over 1 clips per channel to a flat amber-white, the cloud sea under a
   2.3 sun included; a global decision, not a mood's).
1. **The painted look**, one step at a time, judged on Autumn first, each
   step its own numbers in the mood's `look.paint` (branch `paint-look`,
   PR #13; the numbers moved from `PAINT`/`palette.paint` into the look on
   2026-10-24). Step 1 in: a colour grade over the finished frame (lifted
   blacks, shadows towards the sky, highlights towards the sun, vignette;
   `paint.ts`, a pass after the bloom, High quality only). Step 2 in: the
   sun's light banded into three soft steps in every flat-shaded material,
   the lit side towards the sun's colour, the shade towards the sky's
   (`PAINT_LAMBERT_GLSL` inside `atmospheric()`); each face keeps one band,
   never smoothed normals. Step 3 in: a vertical wash per thing
   (`gradient`, the mesher's `rise` per vertex). Judged so far: Autumn at
   grade 0.82, ramp 1, gradient 1.2. Silhouette ornament is next, after
   Autumn's air is right. Order after that: the day moods (Alpine, Lagoon
   noon, Glacier polar day and dawn, Gloaming), then the nights, the Reef
   last with its own grade (Glacier's snow is the stress test for cool
   shadows).
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

- **The sun follows the course's heading** (TFT's light-for-the-camera, taken
  all the way): each frame the mood's sun azimuth is measured from the
  course's direction at the pilot, smoothed through bends, so every stretch
  is lit from behind the pilot. One uniform and a light position per frame.
  Only if play testing finds the fixed 150° (Autumn, 2026-10-24) leaves too
  many bends backlit; racers all head for the finish, so it may never be
  needed. The sun disc would drift across the sky on hard turns.

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
- **Start and finish portals** (Stella's idea, 2026-10-24, parked: not
  worth the effort yet). The start and the finish each become a portal
  and nothing exists before the one or past the other (the land cut is
  done already: `BEFORE_START` 60 m, `PAST_FINISH` 100 m in recipes.ts).
  To decide before building: (1) what crossing the finish portal does:
  vanish into it with a flash and cut to the results (Claude's pick: a
  ceremony, nothing to draw outside), or fly on over empty sky with the
  results over it (the line still runs 1000 m past the finish for the
  victory glide); (2) whether the start portal is seen at all: the chase
  camera looks ahead, so only a countdown push-out through the portal, a
  crash look-back or a waiting lobby would show it; (3) its look: a
  giant crystal gate with a glowing membrane (cheapest, one family with
  the gates), a worked-stone arch, or one per biome (five assets). Gold
  for the frame (the finish beam's and the trail's gold), the membrane
  in the biome's accent; bloom allowed, it is magic.
- **The abyss line** (`ABYSS` 240 m under the racing line) sits 20 m above
  the Archipelago's cloud sea (260 m): a dive crashes in the air just over
  the clouds. Lower it to the floor, or make the clouds the crash.
- **Wind currents or thermals** as visible columns that make route choices.
  Speed-feel posts along the track are no longer needed: the walls give the
  motion reference.
- **Landmarks** (the one big structure per biome) are parked: nothing to do
  there until the gameplay pieces are in.

## Known breakage

- The crystal surfaces' sheen (`terrain/material.ts`) is lit from a fixed
  direction (0.35, 0.8, 0.45), not the sun: it reads the same at dawn and
  noon. Found 2026-10-24 while inventorying the look; left as it was.
- Every mood's `brief` except Autumn's is a draft (Claude, 2026-10-24):
  judge each against its picture and rewrite in Stella's words.

- None in the tests (59 pass). `docs/audit-2026-10-11.md` is a snapshot and
  is not kept up to date; `CREDITS.md` and `docs/biomes.md` are current as
  of 2026-10-19.

## Done lately

- 2026-10-24: no land before the start or past the finish: features
  scatter from 60 m before the start to 100 m past the finish (was 300
  either way) and the land's root nodes follow. Archipelago seed 1: 15
  islands and 52k triangles behind the start became 2 and 8k; the 120
  islands now stand a quarter denser along the course.

- 2026-10-24: ponds no longer crash you under their islands (the water
  was a column all the way down; now the body in the bowl); dev builds
  log every crash with its cause and distances (`window.__crashes`).

- 2026-10-24: Archipelago Autumn loads the whole map at 3 m before the
  start and never swaps a level (`look.view` past the course's end,
  `decorationMaxLod` 0; `readyRadius` and `decorationMaxLod` are the
  mood's now). Desktop first; device budgets later.

- 2026-10-24: the view distance is the mood's (`look.view`: the LOD
  tiers, view and prefetch distances left `TERRAIN`), as is the mist's
  density (`look.air.mistDensity`, out of the palette); both have sliders.
  Archipelago Autumn draws to 1400 m at 12 m cells (7k to 15k triangles
  more), no mist under the camera, the cloud sea's floor 60 % haze.

- 2026-10-24: the Archipelago's sea of clouds is the haze floor alone.
  Tried and dropped on Autumn: a faceted floor (dunes, ice, crumpled
  paper), puff clusters on it (a grey/white patchwork from above: the
  puffs are shaded by height and drawn unsorted), hard-edged and square
  puffs (scales), one cut-out card per cloud (boats), low-poly hull
  clouds (white rock, 50k triangles). Kept: the puffs' shade can lean
  towards the zenith (`look.air.puffShadowZenith`, Autumn 0.5) and the
  clouds' sizes, proportions and puff counts are scattered wide.

- 2026-10-24: every map's look in three layers (`world/look.ts`:
  defaults, biome, mood; about 110 numbers and colours out of shaders,
  builders and tuning groups; `paint` folded in), a `brief` per mood, the
  `Look: <mood>` folder in `?tune` with override and JSON copy, and a
  frame harness that proved every step picture-equal (branch
  `look-per-mood`, on top of PR #13). The map's look and the player's
  (tuning.ts) are now apart.

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
