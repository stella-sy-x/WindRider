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

// Every sun kept between 22° and 34° up and 25°–40° off the course so it never
// sits straight ahead of the pilot.
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
    // Soft grey-blue, lower sun, the pines fading into haze
    name: "Misty pines",
    horizon: "#e2e9d6",
    zenith: "#9fbcac",
    grass: "#6e8e55",
    forest: "#355a3e",
    trunk: "#5a4634",
    rock: "#b3ab8e",
    snow: "#eeeee2",
    cloud: "#f4f6ee",
    accent: "#d9956a",
    sun: "#fff8e8",
    sunIntensity: 2.0,
    ambient: 1.7,
    sunElevation: 22,
    sunAzimuth: -35,
    night: 0,
    mist: "#e9eee0",
    mistDensity: 0.75,
    glow: 1.2,
  },
  {
    // Amber light, warm gold horizon
    name: "Autumn",
    horizon: "#ffe2bd",
    zenith: "#5f9bd6",
    grass: "#a9a24c",
    forest: "#c4642c",
    trunk: "#5a3b25",
    rock: "#8a6b58",
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
    mistDensity: 0.45,
    glow: 1.2,
  },
  {
    // Warm pink horizon under a purple zenith, golden sun low over the clouds
    name: "Dusk",
    horizon: "#ffb894",
    zenith: "#5a4fc0",
    grass: "#6f8a4c",
    forest: "#36503c",
    trunk: "#4a3530",
    rock: "#8a5c5e",
    snow: "#ffe8e2",
    cloud: "#ffd6cc",
    accent: "#6fc9d0",
    sun: "#ffe0c8",
    sunIntensity: 2.0,
    ambient: 1.5,
    sunElevation: 22,
    sunAzimuth: -28,
    night: 0.2,
    mist: "#ffc4a3",
    mistDensity: 0.55,
    glow: 1.1,
  },
  {
    // The valley's moonlit night, carried over: Alpine's land shifted as Verdant's Morning was to its Moonlit
    name: "Moonlit",
    horizon: "#2d3c60",
    zenith: "#0a1130",
    grass: "#5c7b54",
    forest: "#2f4d38",
    trunk: "#4a3529",
    rock: "#6b4e4e",
    snow: "#d6e0ff",
    cloud: "#55658c",
    accent: "#d9c07a",
    sun: "#c4d6ff",
    sunIntensity: 1.25,
    ambient: 1.45,
    sunElevation: 32,
    sunAzimuth: -40,
    night: 0.9,
    mist: "#3a4d78",
    mistDensity: 0.65,
    glow: 0.9,
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
      { rock: "#93694a", rock2: "#a47a58", bands: 0, under: "#5e4330", top: "#8cb648", top2: "#9ec255", snow: false },
      // 1: the gates: the same rock a touch greyer so they read against the islands
      { rock: "#8a7360", rock2: "#9a836e", bands: 0, under: "#55423a", top: "#8cb648", snow: false },
    ],
    layers: { dirt: "#7a5538", sand: "#c9b48c", snow: "#ffffff", snowLine: 9999, topSlope: 0.45, texture: 0.5, glow: "#ffd98a" },
    land: {
      gates: { arch: 3, pillars: 2, needles: 1, spur: 1 },
      gateSurface: 1,
      features: [
        // Clean teardrops along the line, no holes, the default soft noise
        { kind: "islands", count: 60, size: [14, 55], lateral: [25, 100], rise: [-80, 120], surface: 0, holes: 0 },
      ],
    },
    islandFalls: { chance: 0.15, colors: { deep: "#3f8fb0", shallow: "#9fdff0", foam: "#ffffff" } },
    // Ponds on the tops of nearly half the islands (apart from the falls: those stay rare, they are for gameplay later)
    islandPonds: { chance: 0.45, colors: { deep: "#2a6a8a", shallow: "#8fd4dc", foam: "#ffffff" } },
  },
  vegetation: {
    kind: "flora",
    spacing: 5,
    density: 0.8,
    openDensity: 0.3,
    forest: { scale: 100, cover: 0.6 },
    treeline: 400,
    minUp: 0.75,
    species: [
      // Pine over most island tops; oaks and birches among them, bushes and the odd boulder in the open
      { id: "pine", weight: 5, height: [8, 15], foliage: "#3f7a3a", foliage2: "#4d8a40", trunk: "#6b4a2f" },
      { id: "oak", weight: 3, height: [7, 13], foliage: "#4f8f37", foliage2: "#6aa342", trunk: "#5b4330" },
      { id: "birch", weight: 2, height: [8, 13], foliage: "#8cbf4a", foliage2: "#a9cd57", trunk: "#e8e4da" },
      { id: "bush", weight: 2, height: [1.4, 2.6], foliage: "#4d8a35", foliage2: "#6a9d3d", where: { forest: false } },
      { id: "boulder", weight: 0.3, height: [1.2, 2.6], foliage: "#a47a58", foliage2: "#93694a", where: { forest: false } },
    ],
    grass: { spacing: 2.6, height: [0.5, 0.9], color: "#7aa848", tip: "#c8d070", flowers: ["#ffffff", "#ffd84a", "#c58cff", "#ff7a9c"], flowerShare: 0.25 },
  },
  structures: [
    // Everything stands on island rock (`on`): a great watchtower on an island per stretch; a bust of Albert Einstein (an Easter egg, in about one level in
    // three) close by the line; mills on bare island tops, shrine gates turned to the line, lanterns here and there
    { id: "watchtower", landmark: 1100, spacing: 60, chance: 1, height: [18, 24], colors: { stone: "#cfc6b4", stone2: "#9aa784", roof: "#3f6f8f", cloth: "#d84a4a" }, where: { above: [-15, 150], lateral: [50, 300], on: "rock" } },
    { id: "einsteinBust", landmark: 2400, spacing: 30, chance: 0.3, height: [6, 7], colors: { stone: "#c9c2b2", stone2: "#a39c8c", roof: "#a07c4c", cloth: "#f3f0e8", wood: "#3a2c20" }, where: { above: [-26, 25], lateral: [25, 140], facing: true, on: "rock" } },
    { id: "windmill", spacing: 130, chance: 0.9, height: [15, 19], colors: { stone: "#d9cfbb", stone2: "#b9b59a", roof: "#b5533c", cloth: "#f6ecd6" }, where: { above: [-10, 150], lateral: [40, 300], forest: false, hilltop: true, on: "rock" } },
    { id: "shrineGate", spacing: 130, chance: 0.6, height: [8, 11], colors: { stone: "#bdb6a6", stone2: "#93a07c", roof: "#3a3a44", cloth: "#d84a3a" }, where: { above: [-18, 120], lateral: [30, 300], facing: true, on: "rock" } },
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
