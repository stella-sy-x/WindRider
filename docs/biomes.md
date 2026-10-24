# Biomes and their assets

What each of the five biomes is made of, as of 2026-10-18 (Ember Wastes
removed; Aurora Summit folded into Glacier Peaks; Verdant Highlands folded
into the Sky Archipelago). Everything here is
generated from the seed at load time except two glTF models (the pilot and the
reef jellyfish). The source of truth is `frontend/src/game/world/biomes/<id>.ts`;
this page is the map of it.

A seed picks a biome and one of its lighting moods (`biomes/index.ts`,
`seedMap`). Solo time trials and rooms fly the same pool.

## The asset kinds

| Kind | Where it is built | What it is |
|:-----|:------------------|:-----------|
| Terrain surfaces | `terrain/material.ts`, recipe `surfaces` | Painted rock types (cliff colour, top cover, strata, glow). Every land feature and gate picks one by index |
| Ground | `terrain/ground.ts` | The heightfield under the course: valley, river, canyon walls (`WALLS`). Null for the Archipelago |
| Land features | `terrain/recipes.ts`, recipe `features` | Scenery sculpted around the line: pillars, boulders, arches, islands, mesas, shards, trunks, mushrooms, islets, rings, bridges, a summit |
| Gates | `terrain/recipes.ts`, recipe `gates`; glow in `crystals.ts` | What each crystal gate makes you thread, by weight: arch, pillars, needles, shards, spur, overhang, tunnel, squeeze, mushroom, roots |
| Flora species | `flora/meshes.ts`, `flora/species.ts` | Trees, bushes, boulders, corals: one mesh builder per id, coloured per biome |
| Grass | `flora/` tufts | Blades and flowers between the plants, optional glow |
| Structures | `structures/models.ts`, `structures/kinds.ts` | Buildings and monuments. A *landmark* is placed at most once per N metres of course on the best site; the rest are scattered on a jittered grid |
| Sky | `atmosphere.ts`, `clouds.ts` | Sky dome, sun, stars, aurora, cloud sea, puffs, mist, fog |
| Particles | `particles.ts`, recipe `particles` | Ambient drift: fireflies, motes, snow, spores, glitter, petals, starfall, bubbles |
| Water | `water.ts`, recipe `river`, `sea`, `islandPonds`, `islandFalls` | River in the valley steps (water, ice, glow), a sea level, ponds on and waterfalls off floating islands |
| Sea life | `deep.ts` | Light shafts, fish schools, jellyfish (Reef only) |
| Music | `music.ts` | One track per biome; two biomes play tracks written for retired ones |

Flora and structure placement rules (`where`) use `above` (metres over the
racing line), `lateral` (metres off it), `forest`, `hilltop`, `wet`, `water`,
`on` (rock/any) and `facing` (turned towards the line).

## The look of a map

Beyond its colours (the mood's palette), how a map looks is its **look**
(`world/look.ts`): every rule and number that decides the picture and is
not a thing's own design, in three layers. `LOOK_DEFAULTS` is what every
map starts from (the numbers the game was built with); a biome's `look`
writes over what it changes; a mood's `look` writes over that. A mood that
writes nothing looks as the game did before there were layers. The groups,
with every number explained beside it in `look.ts`:

- **air**: the haze (where it begins and ends, its colour, by default the
  horizon's), the sky gradient's curve, the sun's glow and discs, the far
  silhouettes, the dome clouds, the mist under the camera, the hemisphere
  light's colours, the backlit rims, the sea of clouds and the puffs, and
  the painted look's tints.
- **land**: the snow line, the cover slope, the painted noise, the strata,
  the slope bands of cover and soil, wet rock, the snow's fade, the crystal
  surfaces' tints, and what the mesher bakes (undersides, rock and cover
  brightness and jitter; these reach the next map).
- **water**: glitter, glow, spray, the falls' foam, the mist and spray
  colours, the night dimming, the reflection's tint.
- **plants**: wind, glow, the colour behind the far trees.
- **structures**: lights, sails, how bright a lit window is, the wood,
  cloth, trim and lamp colours a spec leaves out (built once per map).
- **gates**: how the crystals and motes move and glow, the stone and lit
  colours and how far they lean to the accent, the flash on passing.
- **deep**: caustics, shafts, the surface from below, how the life glows,
  the discharge's brightness and colour, the jellyfish's shape.
- **particles**: each kind's size and brightness.
- **paint**: the painted look's grade and light.

What is written so far: the Archipelago's haze begins at 80 m and is
complete by 1400 m, the Reef's at 30 and 640 m; Autumn's painted look.
In `?tune` the `Look: <mood>` folder edits a copy of the mood on screen
(`docs/debug-mode.md`). Every mood also has a `brief`, one sentence saying
what it is, listed with the moods below; a brief marked a draft has not
been judged against the picture yet.

## Shared catalogue

**Flora species** (`flora/meshes.ts`): pine, fir, snowFir, oak, birch, bush,
palm, jungle, mushroom (glows), crystal (glows), boulder, redwood, kelp,
coral (glows), seaFan, anemone (glows), sponge (glows).

**Structures** (`structures/models.ts`): watchtower, stoneLantern, windmill,
monastery, bellPavilion, stoneHut, prayerPole, lighthouse, stiltHut,
ruinColumn, shrineGate, spiritStatue, observatory, pylon, starAltar,
einsteinBust (Easter egg), shipwreck.

**External models** (`frontend/public/models/`, credits in `CREDITS.md`):
`pilot.glb` (the paper airplane, rebuilt in Blender), `jellyfish.glb` with
`jellyfish-bell.png` and `jellyfish-tentacle.png` (chinabazooka, CC BY 4.0,
decimated to 3.4k triangles).

**Music** (`frontend/public/audio/music/`): five tracks, three of them named
for their biome. The Reef plays Dewdrop Stream (written for the retired
Verdant Highlands) and the Lagoon plays Red Orange Embers (written for the
retired Ember Wastes) until they get their own.

## Glacier Peaks

*Icefalls, crevasses and jagged peaks above a sea of clouds.* The one
mountain canyon. Aurora Summit was folded in here on 2026-10-18: its dawn and
night moods, crystal rings, summit and observatory.

- **Moods**: Polar day; Summit dawn (low pink sun, night 0.15, aurora 0.3); Aurora night (night 1, aurora 1). Briefs (drafts): a high, cold, clear polar noon, white light and blue shadow, the ice does the colouring; the first minutes of a summit sunrise, a low pink-orange sun down the course, long shadows; deep polar night under the aurora, moonlit snow, the curtains the only warmth.
- **Ground**: valley with an ice river; snow line −60 m (snow everywhere). No walls yet.
- **Surfaces**: 0 snowfields over blue-grey rock and ice cliffs; 1 ice (spires, arches, seracs); 2 dark rock outcrops; 3 ancient crystal, glowing (the rings).
- **Features**: on half the courses a summit spire at 82 % of the course, 260 m off the line, 520 m high; 6 crystal rings to fly through; 12 leaning ice shards; 5 pillars; 75 boulders; 1 arch.
- **Gates**: arch 3, shards 3, pillars 2, spur 2, overhang 1.
- **Flora**: snowFir, crystal in ice blue and violet (glow), boulder. No grass.
- **Structures**: monastery or observatory (landmarks, each on half the stretches, facing), prayerPole and pylon (hilltops), bellPavilion and starAltar (low, lit), stoneHut, stoneLantern.
- **Sky**: cloud sea 300 m below, 40 puffs, valley mist. **Particles**: snow, glitter, starfall at night.
- **Music**: Blue Shadows over Cold Peaks.

## Sky Archipelago

*Wooded islands adrift in a sea of clouds.* The default test world, and the
one biome with no ground: the course threads floating islands, so the canyon
walls do not apply here and it will need a boundary scheme of its own.
Verdant Highlands was folded in here on 2026-10-18: its trees, flowers,
mills, towers, shrine gates and the Einstein bust; its river could not come,
so the islands got ponds and bridges of their own instead (2026-10-18/19).

- **Moods**: Alpine; Autumn. (No night mood: the islands are a daytime biome.) Briefs: Alpine (draft), a crisp alpine morning high over the sea of clouds, a white sun, a clean blue sky, green islands; Autumn (Stella, 2026-10-24), a clean autumn afternoon about three o'clock, the autumn in the orange trees and the dry grass, the light itself clear (its sky, haze and sun are still amber: not there yet).
- **Ground**: none. Ponds on 45 % of islands 20 m and up (a bowl carved into the top under a flat rock lip, the island's grain smoothed around it; the water is solid like a river pool; `World.islandPonds`). Waterfalls off 15 % of big islands, kept rare for gameplay later; the two are independent.
- **Surfaces**: 0 the islands (warm brown rock, green cap); 1 the gates (same rock, greyer); 2 worked stone (the bridges).
- **Features**: 120 floating islands (14 to 55 m) without holes, dense enough that most have a neighbour within a bridge's reach.
- **Gates**: arch 3, pillars 2, bridge 2 (a stone bridge between two islands either side of the line, its arch centred on the line), needles 1, spur 1.
- **Bridges** (`World.findIslandBridges`): stone bridges between neighbouring islands off the line, 80 % of the pairs 10 to 50 m apart rim to rim, each island in one at most, ramped where one island stands higher (up to about 24 degrees), the gap under the arch checked empty; solid like the land.
- **Flora**: pine, oak and birch in groves of their own (a patch of noise per species, 90 m across; forest cover 0.45, the odd tree between), bush, boulder. No grass tufts (the flat cards looked like paper cut-outs; removed 2026-10-23).
- **Structures** (all on island rock): watchtower (landmark, 18 to 24 m), einsteinBust (landmark, about one level in three, beside the line), windmill (bare island tops), shrineGate (facing), stoneLantern sparse everywhere and dense around the ponds (`wet`).
- **Sky**: cloud sea 260 m below, 65 puffs above and below, camera mist; the haze from 80 to 1400 m (the biome's `look.air`). **Particles**: motes, petals, a few fireflies (both moods are day, so they never swarm).
- **Music**: Soaring Above the Clouds (file still named `sky-isles_`).

## Coral Lagoon

*Sea stacks, palm islets and turquoise shallows.*

- **Moods**: Tropical noon; Moonlit lagoon (night 0.85). Briefs (drafts): tropical noon with the sun nearly overhead, white light, turquoise water, a bright pale sky; a warm tropical night under a bright moon, deep blue all round, the water lit from within.
- **Ground**: valley, no river; a sea 24 m below the lowest point of the line; island waterfalls on 30 % of big islands. No walls yet.
- **Surfaces**: 0 sandy floor and sandbars; 1 limestone karst, streaked, jungle on top; 2 sandy islets; 3 coral arches.
- **Features**: 12 sea-stack pillars, 16 islands with holes, 5 islets, 2 coral arches.
- **Gates**: pillars 3, arch 2, tunnel 1, needles 1, squeeze 1.
- **Flora**: palm, jungle, bush (pink-tinged), boulder. Grass with pink, yellow, white and orange flowers.
- **Structures**: lighthouse (landmark, on rock by the water), stiltHut (in the shallows), ruinColumn (in the water), stoneLantern (on rock).
- **Sky**: 45 puffs, valley mist. **Particles**: motes, petals, fireflies at night.
- **Music**: Red Orange Embers (written for the retired Ember Wastes).

## Twilight Forest

*Giant trees, glowing mushrooms and bioluminescent ponds.*

- **Moods**: Gloaming (night 0.45); Midnight bloom (night 1, aurora 0.25). Briefs (drafts): the last of the light in a glowing forest, a violet sky, a low amber sun, the plants beginning to shine; midnight in the glowing forest, a near-black violet sky, everything lit by what grows there.
- **Ground**: valley with a glowing river. No walls yet.
- **Surfaces**: 0 forest floor (purple stone, teal moss with glowing specks); 1 bark of the giant trees and roots; 2 giant mushroom stems; 3 giant mushroom caps, gills glowing underneath; 4 the giant trees' crowns.
- **Features**: 20 giant trunks with canopies, 14 giant mushrooms, 3 arches.
- **Gates**: mushroom 3, roots 2, pillars 2, needles 1, arch 1.
- **Flora**: mushroom in two colourways (glow), fir, redwood, crystal (glow). Grass with glowing cyan, violet and gold flowers.
- **Structures**: shrineGate as a 22 to 26 m landmark and again small, spiritStatue, stoneLantern (all lit cyan).
- **Sky**: 30 puffs, valley mist. **Particles**: fireflies (many), spores.
- **Music**: Blue Hour Fireflies.

## Sunken Reef

*Coral gardens, kelp forests and a galleon asleep on the seabed.* Underwater:
the sky is the water's surface 130 m above the line, seen from below. The only
biome with canyon walls so far (`terrain.walls`), and the one where the
jellyfish discharge is being turned into gameplay.

- **Moods**: Sunlit shallows (night 0.12); Moonlit deep (night 0.85). Briefs (drafts): bright shallows at midday, sunlight through the water, a turquoise haze, ripples of light on the sand; the reef by night, deep blue-black water, moonlight from above, the life glowing by itself.
- **Ground**: seabed valley, no river. Canyon walls from 90 m (`WALLS`), above the water surface past 275 m, so nothing is generated beyond 280 m.
- **Surfaces**: 0 the seabed (blue-grey rock, pale sand, algae); 1 reef limestone crusted with pink and orange coral; 2 table-coral stems; 3 their plates, glowing underneath; 4 brain corals; 5 violet coral arches.
- **Features**: 15 pillars, 18 table corals (the mushrooms feature), 4 arches, 38 brain-coral boulders, 8 mesas (220 to 700 m out).
- **Gates**: arch 3, mushroom 3, pillars 2, roots 2, spur 2, needles 1, overhang 1.
- **Flora**: kelp (forests), coral in two colourways (glow), seaFan, anemone (glow), sponge (glow), boulder. Seagrass with glowing pink, gold and cyan blooms.
- **Structures**: shipwreck (landmark, a galleon on the reef), ruinColumn, shrineGate (facing), spiritStatue, stoneLantern (all lit cyan).
- **Sky**: no puffs, valley mist, fog 30 to 640 m; light shafts from the surface.
- **Sea life** (`deep.ts`): 70 schools of fish in six colours; 110 jellyfish in four colours, most beside the line (`DEEP.jellyNear`), on a seeded 4 s discharge cycle (0.5 s telegraph, 1 s shock hoop), collapsing past 200 m. Model: chinabazooka's Jellyfish.
- **Particles**: bubbles, plankton motes (more at night), spores.
- **Music**: Dewdrop Stream (written for the retired Verdant Highlands).

## Gaps worth knowing

- Canyon walls exist on the Reef only; Glacier, Lagoon and Twilight still have the
  150 m hard clamp (`FLIGHT.lateralClamp`) as their boundary, and the Archipelago
  has no ground to build walls from.
- Lagoon and Reef play tracks written for retired biomes.
- No biome has its own gameplay element yet; the Reef jellyfish is the first
  candidate (its discharge is visual only so far).
- Biome `accent` colours are reserved for the gates and future biome gameplay
  pieces (see `CLAUDE.md`, Art direction).
