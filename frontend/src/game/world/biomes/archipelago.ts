import type { Palette } from "../palette";
import type { Biome } from "./types";

// Sky Archipelago: the look of the old Sky Isles, rebuilt on the v2 terrain.
// Clean teardrop islands, each crowned with a dense single-species pine wood,
// a two-tone palette of warm rock and green cap, clouds drifting above and
// below the islands, and a sea of clouds far beneath. Nothing fancy on the
// rock: no strata, no holes, no arches carved through it; the islands read
// as simple soft shapes and the forests and clouds do the talking.
//
// The surfaces and species below are authored in the first mood's colors
// (Alpine: its rock, grass, forest and trunk are the island rock, its cap, the
// pine and its trunk). Every other mood repaints them by its palette as the
// land is meshed and the trees are built (World.mood, palette.ts), so Winter's
// islands come out white-capped and grey and Starlight's purple, as they did
// in Sky Isles, besides the mood's light, sky, mist and clouds.

// Moods lifted from Sky Isles, with every sun kept between 22° and 34° up and
// 25°–40° off the course so it never sits straight ahead of the pilot.
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
    // Pale blue sky, cool white light, snow-white tops
    name: "Winter",
    horizon: "#dde8f4",
    zenith: "#5e86c2",
    grass: "#e6edf4",
    forest: "#2e4f48",
    trunk: "#4d3b30",
    rock: "#7a8594",
    snow: "#ffffff",
    cloud: "#ffffff",
    accent: "#d96c7a",
    sun: "#ffffff",
    sunIntensity: 2.3,
    ambient: 1.6,
    sunElevation: 28,
    sunAzimuth: 25,
    night: 0,
    mist: "#eef4fb",
    mistDensity: 0.55,
    glow: 1.3,
  },
  {
    // Deep blue night, purple-tinged rock, a faint aurora over the islands
    name: "Starlight",
    horizon: "#4a2f6e",
    zenith: "#0e0b28",
    grass: "#3f5a6e",
    forest: "#1f3a44",
    trunk: "#3a2c3c",
    rock: "#4b3f6a",
    snow: "#cfd8ff",
    cloud: "#6a5aa0",
    accent: "#b7d98a",
    sun: "#d8c6ff",
    sunIntensity: 1.6,
    ambient: 1.7,
    sunElevation: 26,
    sunAzimuth: -28,
    night: 1,
    mist: "#5c3f8f",
    mistDensity: 0.6,
    glow: 0.9,
    aurora: 0.3,
  },
];

export const ARCHIPELAGO: Biome = {
  id: "archipelago",
  name: "Sky Archipelago",
  tagline: "Pine-crowned islands adrift in a sea of clouds",
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
      // One species: dense pine over every island top
      { id: "pine", weight: 5, height: [8, 15], foliage: "#3f7a3a", foliage2: "#4d8a40", trunk: "#6b4a2f" },
      { id: "boulder", weight: 0.3, height: [1.2, 2.6], foliage: "#a47a58", foliage2: "#93694a", where: { forest: false } },
    ],
    grass: { spacing: 2.6, height: [0.5, 0.9], color: "#7aa848", tip: "#c8d070", flowers: ["#ffffff", "#ffd84a"], flowerShare: 0.15 },
  },
  structures: [
    // The odd stone lantern on an island top, nothing more
    { id: "stoneLantern", spacing: 60, chance: 0.15, height: [2.6, 3.4], colors: { stone: "#efe6d2", stone2: "#b8c79a", roof: "#3f7fb8" }, where: { lateral: [0, 300], on: "rock" } },
  ],
  sky: { cloudSea: { depth: 260 }, puffs: 65, puffsBelow: true, puffLift: 200, mist: { mode: "camera" }, fog: [80, 1400] },
  particles: {
    ambient: [
      { kind: "motes", rate: 12, colors: ["#ffe9b0", "#fff6dc"] },
      { kind: "fireflies", rate: 3, colors: ["#fff2a0"], night: 4 },
    ],
  },
};
