import type { Biome } from "./types";

// Glacier Peaks: a glacier valley between jagged ridged peaks, stepping down in
// icefalls past frozen lakes, crossed by crevasses, ice spires and arches,
// snow-laden firs low down, and the land falling away into a sea of clouds.
// Polar day, a pink dawn on the summit, or night under the aurora and falling
// stars, with rings of ancient crystal floating around the line and, on some
// courses, one colossal spire (the old Aurora Summit, folded in here).

export const GLACIER: Biome = {
  id: "glacier",
  name: "Glacier Peaks",
  tagline: "Icefalls, crevasses and jagged peaks above a sea of clouds",
  moods: [
    {
      name: "Polar day",
      // Draft brief (Claude, 2026-10-24): not yet judged against the picture
      brief: "A high, cold, clear polar noon: white light, blue shadow, a blue sky; the ice does the colouring.",
      horizon: "#e2edf7",
      zenith: "#4a82c4",
      grass: "#f4f8fc",
      forest: "#24493f",
      trunk: "#4a3a30",
      rock: "#7d8fa3",
      snow: "#fbfdff",
      cloud: "#ffffff",
      accent: "#d98090",
      sun: "#ffffff",
      sunIntensity: 2.4,
      ambient: 1.6,
      sunElevation: 30,
      sunAzimuth: 25,
      night: 0,
      mist: "#eef4fb",
      look: { air: { mistDensity: 0.55 } },
      glow: 1.3,
    },
    {
      // A low sun just over the ridge, pink on the snow
      name: "Summit dawn",
      // Draft brief (Claude, 2026-10-24): not yet judged against the picture
      brief: "The first minutes of a summit sunrise: a low pink-orange sun straight down the course, a violet-blue sky, long shadows.",
      horizon: "#ffc8b0",
      zenith: "#4a6ac0",
      grass: "#f6f8ff",
      forest: "#24493f",
      trunk: "#4a3a30",
      rock: "#6a6a80",
      snow: "#fff8f6",
      cloud: "#fff0ea",
      accent: "#8a94d9",
      sun: "#ffd8c0",
      sunIntensity: 2.2,
      ambient: 1.5,
      sunElevation: 6,
      sunAzimuth: 0,
      night: 0.15,
      mist: "#ffd8c8",
      look: { air: { mistDensity: 0.45 } },
      glow: 1.2,
      aurora: 0.3,
    },
    {
      // Curtains of light over the peaks, stars falling
      name: "Aurora night",
      // Draft brief (Claude, 2026-10-24): not yet judged against the picture
      brief: "Deep polar night under the aurora: a near-black sky, moonlit snow, the curtains of light the only warmth.",
      horizon: "#1a2a4a",
      zenith: "#03061a",
      grass: "#d8e0f0",
      forest: "#1a3530",
      trunk: "#3a2e28",
      rock: "#3a3a4a",
      snow: "#e6ecff",
      cloud: "#2a3a60",
      accent: "#8fd9b8",
      sun: "#d8e4ff",
      sunIntensity: 1.4,
      ambient: 1.5,
      sunElevation: 30,
      sunAzimuth: 20,
      night: 1,
      mist: "#1f3360",
      look: { air: { mistDensity: 0.5 } },
      glow: 0.85,
      aurora: 1,
    },
  ],
  terrain: {
    kind: "v2",
    ground: {
      depth: 30,
      steps: { length: [220, 380], clearance: 30 },
      river: {
        kind: "ice",
        colors: { deep: "#4f8fbf", shallow: "#cfe9f7", foam: "#ffffff" },
        width: [22, 40],
        lakes: 0.45,
        meander: 18,
        bank: 2,
        bed: 3,
      },
      valley: 60,
      wall: 0.55,
      wallCurve: 0.0002,
      floorHills: 3,
      hills: { amp: 80, scale: 140 },
      mountains: { amp: 520, scale: 420, warp: 1.1, sharpness: 3, from: 240, ramp: 260 },
      terraces: null,
      crevasses: { spacing: 60, width: 5, depth: 12 },
      overhang: 5,
      roughness: 2,
      falloff: { from: 900, drop: 420 },
      level: null,
      extent: 1400,
    },
    groundSurface: 0,
    surfaces: [
      // 0: snowfields over blue-grey rock and ice cliffs
      { rock: "#7d8fa3", rock2: "#9fbfd6", under: "#4d5f73", top: "#f4f8fc", top2: "#dce8f3", snow: true },
      // 1: ice: spires, arches, seracs
      { rock: "#a9dcf2", rock2: "#6fb7dc", under: "#3f7fa6", top: "#eef7fc", snow: true, bare: true },
      // 2: dark rock outcrops
      { rock: "#4f5864", rock2: "#606a78", under: "#2f353d", top: "#e8eef5", snow: true },
      // 3: ancient crystal, glowing (the rings)
      { rock: "#9a7aff", rock2: "#c8b0ff", under: "#5a40c0", top: "#e0d0ff", snow: false, glow: 0.35, crystal: true, bare: true },
    ],
    layers: { dirt: "#a9b8c8", sand: "#c8d4de", snow: "#fbfdff", snowLine: -60, topSlope: 0.66, texture: 1.1, glow: "#9fe4ff" },
    land: {
      gates: { arch: 3, shards: 3, pillars: 2, overhang: 1, spur: 2 },
      gateSurface: 1,
      features: [
        // On half the courses, one colossal spire late in the run, with lesser ones around it
        { kind: "summit", chance: 0.5, along: 0.82, lateral: 260, radius: 90, rise: 520, surface: 2 },
        { kind: "rings", count: 6, radius: [16, 30], lateral: [50, 100], rise: [-30, 90], surface: 3 },
        { kind: "shards", count: 12, radius: [6, 12], rise: [40, 150], lateral: [60, 100], tilt: 0.35, surface: 1 },
        { kind: "pillars", count: 5, radius: [10, 18], rise: [60, 200], lateral: [60, 100], surface: 2 },
        { kind: "boulders", count: 75, size: [2, 5], lateral: [20, 100], surface: 2 },
        { kind: "arches", count: 1, radius: [14, 26], lateral: [60, 100], surface: 1 },
      ],
    },
  },
  vegetation: {
    kind: "flora",
    spacing: 9,
    density: 0.5,
    openDensity: 0.03,
    forest: { scale: 220, cover: 0.35 },
    treeline: 70,
    minUp: 0.75,
    species: [
      { id: "snowFir", weight: 6, height: [8, 15], foliage: "#24493f", foliage2: "#2d5a4c", trunk: "#4a3a30" },
      // Crystals in two colours: ice blue, and the violet of the rings
      { id: "crystal", weight: 1.2, height: [2, 4.5], foliage: "#9fe8ff", foliage2: "#d8f6ff", where: { forest: false } },
      { id: "crystal", weight: 1.2, height: [2, 5], foliage: "#b89aff", foliage2: "#8af0ff", where: { forest: false } },
      { id: "boulder", weight: 1, height: [1.2, 3], foliage: "#e8eef5", foliage2: "#8a96a6", where: { forest: false } },
    ],
    grass: null,
  },
  structures: [
    // A monastery or an observatory above the valley (about one of the two per stretch); prayer flags and pylons
    // on the shoulders of the hills, bell pavilions and star altars on the valley floor, huts on its sides, lanterns in the snow
    { id: "monastery", landmark: 1100, spacing: 60, chance: 0.5, height: [32, 38], colors: { stone: "#f1ece2", stone2: "#8d95a3", roof: "#b98a2e", cloth: "#9c3b2f", snow: "#fbfdff" }, where: { above: [5, 150], lateral: [90, 380], facing: true } },
    { id: "observatory", landmark: 1100, spacing: 60, chance: 0.5, height: [26, 32], colors: { stone: "#dfe6f2", stone2: "#8f9ab3", roof: "#8f9ab3", cloth: "#c9a8ff", light: "#9fe8ff", trim: "#f2d37a" }, where: { above: [0, 150], lateral: [80, 360], facing: true } },
    { id: "prayerPole", spacing: 90, chance: 0.8, height: [7, 10], colors: { stone: "#8d95a3", roof: "#b98a2e" }, where: { above: [-25, 120], lateral: [30, 500], hilltop: true } },
    { id: "pylon", spacing: 110, chance: 0.4, height: [8, 13], colors: { stone: "#b9c3d6", stone2: "#8f9ab3", roof: "#8f9ab3", cloth: "#d8c8ff", light: "#9fe8ff", trim: "#f2d37a" }, where: { lateral: [30, 450], hilltop: true } },
    { id: "bellPavilion", spacing: 60, chance: 0.6, height: [6, 8], colors: { stone: "#c9d1dc", stone2: "#8d95a3", roof: "#8f3a30", wood: "#7a3128", light: "#bfefff", snow: "#fbfdff" }, where: { above: [-34, 5], lateral: [20, 220] } },
    { id: "starAltar", spacing: 70, chance: 0.4, height: [3, 4], colors: { stone: "#b9c3d6", stone2: "#8f9ab3", roof: "#8f9ab3", cloth: "#ffffff", light: "#ffe9a8" }, where: { above: [-36, 90], lateral: [20, 320] } },
    { id: "stoneHut", spacing: 60, chance: 0.7, height: [4.5, 6], colors: { stone: "#aab3bf", stone2: "#7f8896", roof: "#5a4a40", snow: "#fbfdff" }, where: { above: [-30, 60], lateral: [30, 400] } },
    { id: "stoneLantern", spacing: 30, chance: 0.3, height: [2.6, 3.4], colors: { stone: "#c9d1e0", stone2: "#8f9ab3", roof: "#6f7a96", light: "#d8c8ff" }, where: { lateral: [0, 260] } },
  ],
  sky: { cloudSea: { depth: 300 }, puffs: 40, puffsBelow: false, puffLift: 300, mist: { mode: "valley", above: 14, thickness: 40 } },
  particles: {
    ambient: [
      { kind: "snow", rate: 90, colors: ["#ffffff", "#eef6ff"] },
      { kind: "glitter", rate: 14, colors: ["#ffffff", "#bfeaff"] },
      { kind: "starfall", rate: 1.2, colors: ["#ffffff", "#c8f0ff"], night: 1 },
    ],
  },
};
