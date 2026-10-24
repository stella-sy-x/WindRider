import { Color, type ColorRepresentation, MathUtils, Vector3 } from "three";
import type { LookPatch } from "./look";

export interface Palette {
  name: string;
  /**
   * One sentence saying what this mood is (the time of day, the light, where its colour lives):
   * what every number below and in its look is judged against. A mood whose brief is marked a
   * draft has not been judged against it yet
   */
  brief: string;
  horizon: string; // sky at the horizon, also the fog color
  zenith: string; // sky straight up
  grass: string; // the islands' grassy tops
  forest: string; // pine needles, and the darker ground under them
  trunk: string;
  rock: string; // steep faces and the bare slopes below the snow
  snow: string;
  cloud: string;
  accent: string; // the biome's own things: the gates' glow (the finish is gold), future biome gameplay pieces. Never the pilot or its effects, and never neon: muted, mid-saturation
  sun: string;
  sunIntensity: number;
  ambient: number;
  // Lighting mood
  sunElevation: number; // degrees above the horizon
  sunAzimuth: number; // degrees; 0 = straight down the course (ahead of you), so low suns backlight the run
  night: number; // 0 = day … 1 = night: stars, glowing trims, stronger bloom
  mist: string; // haze that thickens below you, towards the sea of clouds
  mistDensity: number; // 0..1
  glow: number; // brightness of particles and trails; bright scenes need more to read
  aurora?: number; // 0..1: curtains of light across the night sky
  /**
   * This mood's painted-look grade (paint.ts), judged one mood at a time: any of PAINT's
   * numbers, the rest from PAINT's defaults. Left out, the mood takes PAINT as it is (off by
   * default). PAINT.override puts the ?tune sliders over every mood while tuning
   */
  paint?: Partial<PaintGrade>;
  /** This mood's own rules and numbers (look.ts), over its biome's and the defaults */
  look?: LookPatch;
}

/** The painted look's grade and light: PAINT in tuning.ts has the meaning of each number */
export interface PaintGrade {
  grade: number;
  lift: number;
  warmth: number;
  shadowTint: number;
  contrast: number;
  saturation: number;
  vignette: number;
  grain: number;
  ramp: number;
  steps: number;
  soft: number;
  warmLight: number;
  coolShade: number;
  bounce: number;
  shade: number;
  gradient: number;
}

/** Unit vector towards the sun (or moon) */
export function sunDirection(palette: Palette): Vector3 {
  const el = MathUtils.degToRad(palette.sunElevation);
  const az = MathUtils.degToRad(palette.sunAzimuth);
  return new Vector3(Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el));
}

/**
 * How far a mood's land and plant colors sit from the biome's baked look, per channel. A biome's
 * surfaces and species are authored in the colors of its first mood (whose `rock`, `grass`,
 * `forest` and `trunk` are the ground, its cover, the main tree and its trunk); every other mood
 * repaints them by its palette's distance from that one, when the land is meshed and the plants
 * are built, so a seed's mood is baked into its vertices. The same whole-palette repaint the
 * legacy Sky Isles made per mood: a surface or species that differs from the ground or the main
 * tree (greyer gates, strata, a second shade of needles) keeps that difference. The shifts are
 * in sRGB, the space the hex colors are written in: there a step reads the same on dark and
 * bright colors, where in linear light it would crush the dark ones to black
 */
export interface MoodShift {
  rock: Color;
  grass: Color;
  forest: Color;
  trunk: Color;
}

/** The repaint that takes `baked` (a biome's first mood) to `mood` */
export function moodShift(baked: Palette, mood: Palette): MoodShift {
  const between = (from: string, to: string) => {
    // Color.sub clamps at zero; the shift is signed
    const a = new Color(from).convertLinearToSRGB();
    const b = new Color(to).convertLinearToSRGB();
    return new Color(b.r - a.r, b.g - a.g, b.b - a.b);
  };
  return {
    rock: between(baked.rock, mood.rock),
    grass: between(baked.grass, mood.grass),
    forest: between(baked.forest, mood.forest),
    trunk: between(baked.trunk, mood.trunk),
  };
}

/**
 * `color` moved by `shift` (a MoodShift channel), as a linear color like any other, every channel
 * kept in 0..1: a vertex color below zero would be pow()ed by the sRGB encode
 */
export function shifted(color: ColorRepresentation, shift: Color, out = new Color()): Color {
  out.set(color).convertLinearToSRGB();
  out.r = MathUtils.clamp(out.r + shift.r, 0, 1);
  out.g = MathUtils.clamp(out.g + shift.g, 0, 1);
  out.b = MathUtils.clamp(out.b + shift.b, 0, 1);
  return out.convertSRGBToLinear();
}
