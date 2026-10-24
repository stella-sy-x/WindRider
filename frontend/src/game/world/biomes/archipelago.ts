import type { Palette } from "../palette";
import type { Biome } from "./types";

// Sky Archipelago: the look of the old Sky Isles, rebuilt on the v2 terrain.
// Clean teardrop islands crowned with woods (pine over most of them, oak,
// birch and bushes between), a two-tone palette of warm rock and green cap,
// clouds drifting above and below the islands, and a sea of clouds far
// beneath. Nothing fancy on the rock: no strata, no holes, no arches carved
// through it; the islands read as simple soft shapes and the forests, the
// mills and towers on them, and the clouds do the talking. The green valley
// biome (Verdant Highlands) was folded in here: its trees, flowers, mills,
// towers, shrine gates and the Einstein bust; its river and bridges could not
// come, there is no ground for them.
//
// The surfaces and species below are authored in the first mood's colors
// (Alpine: its rock, grass, forest and trunk are the island rock, its cap, the
// pine and its trunk). Every other mood repaints them by its palette as the
// land is meshed and the trees are built (World.mood, palette.ts), besides the
// mood's light, sky, mist and clouds.

// Two moods: Alpine and Autumn (Misty pines, Dusk, Moonlit, Winter and Starlight
// were tried and trimmed). Every sun kept between 22° and 34° up and 25°–40° off
// the course so it never sits straight ahead of the pilot.
const MOODS: readonly Palette[] = [
  {
    // Bright blue sky, green grass, warm brown rock: the archipelago at its crispest
    name: "Alpine",
    horizon: "#cdeaf6",
    zenith: "#3f8fd2",
    grass: "#8cb648",
    forest: "#3f7a3a",
    trunk: "#6b4a2f",
    rock: "#93694a",
    snow: "#f4f6f8",
    cloud: "#ffffff",
    accent: "#d9849c",
    sun: "#fffaf0",
    sunIntensity: 2.4,
    ambient: 1.5,
    sunElevation: 28,
    sunAzimuth: 35,
    night: 0,
    mist: "#e6f4fb",
    mistDensity: 0.45,
    glow: 1.25,
  },
  {
    // Amber light, warm gold horizon
    name: "Autumn",
    horizon: "#ffe2bd",
    zenith: "#5f9bd6",
    grass: "#a9a24c",
    forest: "#c4642c",
    trunk: "#5a3b25",
    rock: "#96674a", // warm and as saturated as Alpine's: the mood shifts every rock by the difference, and a greyer value greyed them all
    snow: "#fffaf2",
    cloud: "#fff8ee",
    accent: "#6f98d9",
    sun: "#fff1d6",
    sunIntensity: 2.3,
    ambient: 1.5,
    sunElevation: 26,
    sunAzimuth: 40,
    night: 0,
    mist: "#ffe8cc",
    mistDensity: 0.3, // was 0.45: with the painted look's warmth on top, far islands melted into the sky
    glow: 1.2,
    // Judged 2026-10-23/24 (Stella, in ?tune): grade 0.82, gradient 1.2; lift and warmth eased on the 24th against a yellow veil
    paint: { grade: 0.82, lift: 0.06, warmth: 0.3, shadowTint: 0.5, contrast: 1.05, saturation: 1.1, vignette: 0.4, grain: 0, ramp: 1, steps: 3, soft: 0.12, warmLight: 0.5, coolShade: 0.15, bounce: 0.7, shade: 0.85, gradient: 1.2 },
  },
];

export const ARCHIPELAGO: Biome = {
  id: "archipelago",
  name: "Sky Archipelago",
  tagline: "Wooded islands adrift in a sea of clouds",
  moods: MOODS,
  terrain: {
    kind: "v2",
    ground: null,
    groundSurface: 0,
    surfaces: [
      // 0: the islands: warm brown rock, green cap, no strata
      { rock: "#93694a", rock2: "#a47a58", bands: 0, under: "#7a4e2c", top: "#8cb648", top2: "#9ec255", snow: false },
      // 1: the gates: a paler sandstone, so they read against the islands by lightness, not by greyness
      { rock: "#b89468", rock2: "#c8a677", bands: 0, under: "#7a5a3c", top: "#8cb648", snow: false },
      // 2: worked stone (the bridges): courses of warm limestone, a paved top (the paper's cream family, never grey)
      { rock: "#d9c7a3", rock2: "#c9b48c", bands: 2.5, under: "#a88a62", top: "#d4c29b", top2: "#c4af84", snow: false, bare: true },
    ],
    layers: { dirt: "#7a5538", sand: "#c9b48c", snow: "#ffffff", snowLine: 9999, topSlope: 0.45, texture: 0.5, glow: "#ffd98a" },
    land: {
      gates: { arch: 3, pillars: 2, bridge: 2, needles: 1, spur: 1 },
      gateSurface: 1,
      named: { bridge: 2 },
      features: [
        // Clean teardrops along the line, no holes, the default soft noise. Dense enough that most islands have a
        // neighbour a bridge's length away (120: about 30 level pairs 12 to 50 m apart per course; 60 gave 8)
        { kind: "islands", count: 120, size: [14, 55], lateral: [25, 100], rise: [-80, 120], surface: 0, holes: 0 },
      ],
    },
    islandFalls: { chance: 0.15, colors: { deep: "#3f8fb0", shallow: "#9fdff0", foam: "#ffffff" } },
    // Ponds on the tops of nearly half the islands (apart from the falls: those stay rare, they are for gameplay later)
    islandPonds: { chance: 0.45, colors: { deep: "#2a6a8a", shallow: "#8fd4dc", foam: "#ffffff" } },
    // Stone bridges between neighbouring islands off the line (the `bridge` gate makes the ones you fly under)
    islandBridges: { chance: 0.8, surface: 2 },
  },
  vegetation: {
    kind: "flora",
    spacing: 5,
    density: 0.8,
    openDensity: 0.1, // between the woods, the odd tree
    forest: { scale: 100, cover: 0.45 },
    treeline: 400,
    minUp: 0.75,
    species: [
      // Pine, oak and birch woods, each in groves of its own (placement.ts), bushes and the odd boulder in the open
      { id: "pine", weight: 3, height: [8, 15], foliage: "#3f7a3a", foliage2: "#4d8a40", trunk: "#6b4a2f" },
      { id: "oak", weight: 3, height: [7, 13], foliage: "#4f8f37", foliage2: "#6aa342", trunk: "#5b4330" },
      { id: "birch", weight: 2.5, height: [8, 13], foliage: "#8cbf4a", foliage2: "#a9cd57", trunk: "#e8e4da" },
      { id: "bush", weight: 2, height: [1.4, 2.6], foliage: "#4d8a35", foliage2: "#6a9d3d", where: { forest: false } },
      { id: "boulder", weight: 0.3, height: [1.2, 2.6], foliage: "#a47a58", foliage2: "#93694a", where: { forest: false } },
    ],
    // No grass tufts: the flat cards read as paper cut-outs against the painted look
    grass: null,
  },
  structures: [
    // Everything stands on island rock (`on`): a great watchtower on an island per stretch; a bust of Albert Einstein (an Easter egg, in about one level in
    // three) close by the line; mills on bare island tops, shrine gates turned to the line, lanterns here and there
    { id: "watchtower", landmark: 1100, spacing: 60, chance: 1, height: [18, 24], colors: { stone: "#dcc7a0", stone2: "#c4a97a", roof: "#3f6f8f", cloth: "#d84a4a" }, where: { above: [-15, 150], lateral: [50, 300], on: "rock" } },
    { id: "einsteinBust", landmark: 2400, spacing: 30, chance: 0.3, height: [6, 7], colors: { stone: "#d6c39c", stone2: "#b39a74", roof: "#a07c4c", cloth: "#f3f0e8", wood: "#3a2c20" }, where: { above: [-26, 25], lateral: [25, 140], facing: true, on: "rock" } },
    { id: "windmill", spacing: 130, chance: 0.9, height: [15, 19], colors: { stone: "#dccba0", stone2: "#c9b48c", roof: "#b5533c", cloth: "#f6ecd6" }, where: { above: [-10, 150], lateral: [40, 300], forest: false, hilltop: true, on: "rock" } },
    { id: "shrineGate", spacing: 130, chance: 0.6, height: [8, 11], colors: { stone: "#d9c7a3", stone2: "#b0a070", roof: "#5a2a2e", cloth: "#d84a3a" }, where: { above: [-18, 120], lateral: [30, 300], facing: true, on: "rock" } },
    { id: "stoneLantern", spacing: 24, chance: 0.4, height: [2.6, 3.4], colors: { stone: "#efe6d2", stone2: "#b8c79a", roof: "#3f7fb8" }, where: { lateral: [0, 300], on: "rock" } },
    // Lanterns gather around the ponds
    { id: "stoneLantern", spacing: 10, chance: 0.7, height: [2.6, 3.4], colors: { stone: "#efe6d2", stone2: "#b8c79a", roof: "#3f7fb8" }, where: { lateral: [0, 300], on: "rock", wet: true } },
  ],
  sky: { cloudSea: { depth: 260 }, puffs: 65, puffsBelow: true, puffLift: 200, mist: { mode: "camera" }, fog: [80, 1400] },
  particles: {
    ambient: [
      { kind: "motes", rate: 12, colors: ["#ffe9b0", "#fff6dc"] },
      { kind: "petals", rate: 3, colors: ["#ffffff", "#ffd6e8"] },
      { kind: "fireflies", rate: 3, colors: ["#fff2a0"], night: 4 },
    ],
  },
};
