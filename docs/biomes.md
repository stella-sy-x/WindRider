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

- **Moods**: Polar day; Summit dawn (low pink sun, night 0.15, aurora 0.3); Aurora night (night 1, aurora 1).
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
mills, towers, shrine gates, Moonlit mood and the Einstein bust; its river,
bridges and lakeside lanterns could not come.

- **Moods**: Alpine; Autumn. (No night mood: the islands are a daytime biome.)
- **Ground**: none. Ponds on 45 % of islands 20 m and up (a bowl carved into the top under a flat rock lip, the island's grain smoothed around it; the water is solid like a river pool; `World.islandPonds`). Waterfalls off 15 % of big islands, kept rare for gameplay later; the two are independent.
- **Surfaces**: 0 the islands (warm brown rock, green cap); 1 the gates (same rock, greyer); 2 worked stone (the bridges).
- **Features**: 120 floating islands (14 to 55 m) without holes, dense enough that most have a neighbour within a bridge's reach.
- **Gates**: arch 3, pillars 2, bridge 2 (a stone bridge between two islands either side of the line, its arch centred on the line), needles 1, spur 1.
- **Bridges** (`World.findIslandBridges`): stone bridges between neighbouring islands off the line, 80 % of the pairs 10 to 50 m apart rim to rim, each island in one at most, ramped where one island stands higher (up to about 24 degrees), the gap under the arch checked empty; solid like the land.
- **Flora**: pine (dominant), oak, birch, bush, boulder. Grass with white, yellow, violet and pink flowers.
- **Structures** (all on island rock): watchtower (landmark, 18 to 24 m), einsteinBust (landmark, about one level in three, beside the line), windmill (bare island tops), shrineGate (facing), stoneLantern sparse everywhere and dense around the ponds (`wet`).
- **Sky**: cloud sea 260 m below, 65 puffs above and below, camera mist, fog 80 to 1400 m. **Particles**: motes, petals, fireflies at night.
- **Music**: Soaring Above the Clouds (file still named `sky-isles_`).

## Coral Lagoon

*Sea stacks, palm islets and turquoise shallows.*

- **Moods**: Tropical noon; Moonlit lagoon (night 0.85).
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

- **Moods**: Gloaming (night 0.45); Midnight bloom (night 1, aurora 0.25).
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

- **Moods**: Sunlit shallows (night 0.12); Moonlit deep (night 0.85).
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
