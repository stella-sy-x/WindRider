import { BIOMES } from "./biomes";
import type { Biome } from "./biomes/types";
import type { Palette } from "./palette";

// How a map looks, beyond its colours: every rule and number that decides the picture and is
// not a thing's own design (how a pine tapers or a jellyfish beats stays with the pine and the
// jellyfish). Three layers: LOOK_DEFAULTS is what every map starts from (the numbers the game
// was built with), a biome's `look` overrides what it writes, a mood's `look` overrides that.
// A mood that writes nothing looks exactly as it did before there were layers. Looks only:
// nothing here moves the land, the water's surface or a collider.
//
// The colours and the sun are the mood's palette (palette.ts); this is the rest. The tune panel
// (?tune) edits a copy per mood (`lookEdited`), seen with LOOK_TUNING.override on; "Copy" writes
// the difference from the layers below as JSON, to paste into the mood.

/** A colour as the shader has it, linear r g b, allowed over 1 (a flash brighter than white) */
export type Linear = [number, number, number];

export interface AirLook {
  // The far haze: where it begins and where it hides everything, metres from the camera
  fogNear: number;
  fogFar: number;
  /** Its colour, and the background's; left out, the mood's horizon colour */
  fogColor?: string;
  /** The sky's gradient: the horizon's colour climbs this far (an exponent on height: smaller keeps it higher) */
  skyCurve: number;
  /** The sun's glow across the sky and the haze: a wide disc (its exponent and strength) and a bright core */
  glowWidth: number;
  glowStrength: number;
  glowCore: number;
  glowCoreStrength: number;
  /** The sun's (moon's) disc, times white: over 1 it blooms */
  sunDisc: number;
  moonDisc: number;
  /** The far land painted on the dome: how far its three layers go towards the zenith, and how dark they are (1: as built) */
  silhouetteSky: number;
  silhouetteShade: number;
  /** Clouds painted on the dome: their brightness (1: as built) */
  cloudBright: number;
  // The mist below you (over a sea of clouds; in a valley the biome's `mist` says where it pools)
  mistDrop: number; // metres under the camera where it begins
  mistThickness: number; // metres over which it thickens
  mistRange: number; // metres of distance over which it builds up
  mistCap: number; // the most of a thing it may hide, 0..1
  // The light
  /** The hemisphere light's sky colour: the horizon this far towards the zenith */
  hemiSky: number;
  /** Its ground colour (what shade facing down sees); left out, the mood's cloud colour */
  hemiGround?: string;
  /** Edges seen against the sun catch its light this much */
  rim: number;
  // The sea of clouds and the puffs
  seaEmissive: number; // the sea's own light as a share of its colour
  seaFacets: number; // brightness spread across its facets, 0..1
  puffShadowSky: number; // a puff's shaded side: cloud colour this far towards the horizon's…
  puffShadow: number; // …and this bright
  puffLit: number; // its lit side, times the cloud colour
  puffGlow: number; // the sun's light through its edge
  // The painted look's tints (paint.ts)
  tintSky: number; // the sky tint: the horizon this far towards the zenith
  tintGround: number; // the bounce tint: the cloud colour this far towards the sun's
}

export interface LandLook {
  snowLine: number; // metres added to the biome's snow line
  coverSlope: number; // added to the slope where the cover (grass, moss, sand…) gives way to rock
  texture: number; // strength of the painted noise on cliffs
  textureScale: number;
  glow: number; // glowing cracks and spots
  strata: number; // the soft horizontal bands on cliffs
  coverBand: number; // how wide the slope band is where cover fades into soil and rock
  soilBand: number; // how far below that the soil reaches
  soil: number; // how much the soil shows against the rock
  wetDark: number; // how dark wet steep rock goes at the water's edge
  snowFade: number; // metres over which snow fades in around the snow line
  paintScale: number; // the painted noise's scale on cliffs
  crystalEdge: Linear; // crystal surfaces: the pale tint of their edges…
  crystalSheen: Linear; // …and of their sheen
  underShade: number; // undersides (faces looking down) when the surface names no colour: the rock this dark
  rockJitter: number; // brightness scattered across rock faces
  coverJitter: number; // and across the cover
}

export interface WaterLook {
  glitter: number; // sun glitter on the water
  glow: number; // bioluminescent pools
  spray: number; // spray when skimming the water, mist at the foot of falls
  fallBlend: number; // metres below the lip before the curtain is fully foamy
  fallSpeed: number; // foam flows downward, accelerating as it falls
  lipFoam: number; // subtle broken foam along outgoing waterfall edges
  lipFoamWidth: number; // maximum upstream reach of edge foam, in metres
  sprayColor: string; // the fine spray at the foot of a fall
  mistColor: Linear; // the mist there
  nightDim: number; // how much less light falls into the water at night
  fallNightDim: number; // and into a falling curtain
  reflectBody: number; // the sky's reflection tinted this far by the water's own colour
}

export interface PlantLook {
  wind: number; // how hard the wind moves leaves and grass
  glow: number; // self-lit mushroom caps and crystals
  fringe: number; // far trees (impostors): the colour behind them, the horizon this dark
}

export interface StructureLook {
  lights: number; // windows and lanterns (dim by day, glowing at night)
  sails: number; // how fast windmill sails turn
  lit: number; // how bright a lit window is (over 1 blooms at night)
  wood: string; // the colours a structure takes when its spec names none
  cloth: string;
  trim: string;
  light: string;
}

export interface GateLook {
  crystals: number; // crystals per gate (the finish gets 1.5×); applies to the next map
  drift: number; // metres each crystal bobs
  driftRate: number;
  spin: number; // how fast the cohort turns around the gate (rad/s)
  selfSpin: number; // how fast each crystal turns on its own axis
  glow: number; // inner glow of the lit gates
  gateGlow: number; // 0..1, how brightly a gate you haven't taken yet glows in a race
  motes: number; // glowing motes that trace each gate's ring; applies to the next map
  moteSize: number; // metres across, for a 13 m ring
  moteDrift: number; // metres each mote wanders from its place on the ring
  shatter: number; // particles when you pass through
  passTime: number; // seconds of the pass animation
  finishBeam: number; // brightness of the finish gate's gold pillar
  finishBeamHeight: number; // its height, in 700 m units; applies to the next map
  stone: string; // the gates' stone…
  stoneAccent: number; // …tinted this far towards the biome's accent
  lit: string; // a lit gate's colour…
  litAccent: number; // …tinted this far towards the accent
  flash: Linear; // the flash on passing through
}

export interface DeepLook {
  caustics: number; // ripples of light running over the seabed
  shafts: number; // shafts of light slanting down from the surface
  surface: number; // how bright the water's surface is from below
  life: number; // how brightly fish and jellyfish glow
  zapGlow: number; // how much brighter a jellyfish burns while discharging
  zapColor: Linear; // the electric light of a discharge
  jellyFill: number; // the bell's opacity
  jellyTentacle: number; // the tentacles' length as a share of the model's
  fishSun: number; // how far the fish take the sun's colour
  nightDim: number; // caustics and shafts this much dimmer by moonlight
}

export type ParticleKind = "fireflies" | "motes" | "glitter" | "spores" | "snow" | "starfall" | "bubbles" | "leaves" | "petals";

/** Each kind of particle in the air: its size and brightness, 1 as built */
export type ParticleLook = Record<ParticleKind, { size: number; bright: number }>;

/** The painted look's grade and light; the meaning of each number is with LOOK_DEFAULTS.paint */
export interface PaintLook {
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

export interface Look {
  air: AirLook;
  land: LandLook;
  water: WaterLook;
  plants: PlantLook;
  structures: StructureLook;
  gates: GateLook;
  deep: DeepLook;
  particles: ParticleLook;
  paint: PaintLook;
}

/** What a biome or a mood writes: any part of a Look */
export type LookPatch = { [G in keyof Look]?: Partial<Look[G]> };

const particle = () => ({ size: 1, bright: 1 });

/** What every map starts from: the numbers the game was built with, before any map had its own */
export const LOOK_DEFAULTS: Look = {
  air: {
    fogNear: 200,
    fogFar: 900,
    skyCurve: 0.6,
    glowWidth: 6,
    glowStrength: 0.35,
    glowCore: 48,
    glowCoreStrength: 0.5,
    sunDisc: 2.6,
    moonDisc: 1.4,
    silhouetteSky: 1,
    silhouetteShade: 1,
    cloudBright: 1,
    mistDrop: 40,
    mistThickness: 120,
    mistRange: 280,
    mistCap: 0.85,
    hemiSky: 0.25,
    rim: 0.45,
    seaEmissive: 0.35,
    seaFacets: 0.1,
    puffShadowSky: 0.45,
    puffShadow: 0.72,
    puffLit: 1.05,
    puffGlow: 1.2,
    tintSky: 0.3,
    tintGround: 0.5,
  },
  land: {
    snowLine: 0,
    coverSlope: 0,
    texture: 1,
    textureScale: 1,
    glow: 1,
    strata: 0.35,
    coverBand: 0.14,
    soilBand: 0.2,
    soil: 0.85,
    wetDark: 0.32,
    snowFade: 14,
    paintScale: 0.07,
    crystalEdge: [0.8, 0.88, 1.0],
    crystalSheen: [0.85, 0.92, 1.0],
    underShade: 0.6,
    rockJitter: 0.18,
    coverJitter: 0.2,
  },
  water: {
    glitter: 1,
    glow: 1,
    spray: 1,
    fallBlend: 0.2,
    fallSpeed: 3,
    lipFoam: 0.45,
    lipFoamWidth: 0.9,
    sprayColor: "#e6f6ff",
    mistColor: [0.92, 0.92, 0.92],
    nightDim: 0.32,
    fallNightDim: 0.4,
    reflectBody: 0.3,
  },
  plants: { wind: 1, glow: 1, fringe: 0.5 },
  structures: { lights: 1, sails: 1, lit: 2.3, wood: "#6b4a2f", cloth: "#f1e6cf", trim: "#f2c761", light: "#ffd58a" },
  gates: {
    crystals: 16,
    drift: 0.6,
    driftRate: 0.55,
    spin: 0.08,
    selfSpin: 0.6,
    glow: 1,
    gateGlow: 0.15,
    motes: 28,
    moteSize: 0.7,
    moteDrift: 0.25,
    shatter: 1,
    passTime: 1.4,
    finishBeam: 1.6,
    finishBeamHeight: 2,
    stone: "#c8d8e0",
    stoneAccent: 0.08,
    lit: "#e8d8c0",
    litAccent: 0.15,
    flash: [3.2, 3.0, 2.6],
  },
  deep: {
    caustics: 1,
    shafts: 1,
    surface: 1,
    life: 1,
    zapGlow: 1.5,
    zapColor: [0.78, 0.96, 1.0],
    jellyFill: 0.85,
    jellyTentacle: 0.6,
    fishSun: 0.5,
    nightDim: 0.5,
  },
  particles: {
    fireflies: particle(),
    motes: particle(),
    glitter: particle(),
    spores: particle(),
    snow: particle(),
    starfall: particle(),
    bubbles: particle(),
    leaves: particle(),
    petals: particle(),
  },
  // The painted (storybook) look: a colour grade over the finished frame (paint.ts), the banded
  // light in every flat-shaded material, and a vertical wash on every thing. Off as built (grade,
  // ramp and gradient 0): a mood that wants it writes its own numbers
  paint: {
    grade: 0, // 0..1: how much of the grade below is applied (0 skips the pass)
    lift: 0.06, // black level lifted to a deep version of the mood's sky: ink on paper, never pure black
    warmth: 0.5, // highlights pushed towards the mood's sun colour
    shadowTint: 0.5, // shadows pushed towards the mood's sky colour
    contrast: 1.05,
    saturation: 1.1,
    vignette: 0.4, // the corners darkened, the middle untouched
    grain: 0, // screen grain. Off: nostalgia is a feeling (soft colour, warm light), never an aged or dirty picture
    ramp: 0, // 0..1: how far from Lambert's linear light to the banded one
    steps: 3, // bands of light, dark to lit
    soft: 0.12, // 0..0.5: how soft each band's edge is (0 hard, like cel shading)
    warmLight: 0.5, // the lit side pushed towards the mood's sun colour
    coolShade: 0.2, // the shade pushed towards the mood's sky colour, gently: a cool tint on warm rock mixes to grey
    bounce: 0.7, // shade facing down against shade facing up: under 1 a painter's darker underside
    shade: 0.85, // brightness of shade against Lambert's: a painter's shade is darker
    gradient: 0, // 0..1: the vertical wash, bottom towards the bounce light's colour, top towards the sun's
  },
};

/** A copy of a Look, with nothing shared */
export function cloneLook(look: Look): Look {
  return JSON.parse(JSON.stringify(look)) as Look;
}

/** `patch` written over `into`, group by group (a group's colours and numbers; a particle kind is replaced whole) */
function apply(into: Look, patch: LookPatch | undefined) {
  if (!patch) return;
  for (const group of Object.keys(patch) as (keyof Look)[]) {
    const part = patch[group];
    if (!part) continue;
    Object.assign(into[group], JSON.parse(JSON.stringify(part)));
  }
}

const biomes = new WeakMap<Palette, Biome>();

/** The biome a mood belongs to (each mood object is written in exactly one biome) */
export function biomeOf(palette: Palette): Biome | undefined {
  let biome = biomes.get(palette);
  if (!biome) {
    biome = Object.values(BIOMES).find((b) => b.moods.includes(palette));
    if (biome) biomes.set(palette, biome);
  }
  return biome;
}

/** A mood's look as written: the defaults, under its biome's look, under its own */
export function resolveLook(palette: Palette, biome: Biome | undefined = biomeOf(palette)): Look {
  const look = cloneLook(LOOK_DEFAULTS);
  apply(look, biome?.look);
  apply(look, palette.look);
  return look;
}

/** The written looks, one per mood, and the tune panel's edited copies */
const written = new WeakMap<Palette, Look>();
const edited = new WeakMap<Palette, Look>();

/** Whether the picture takes the tune panel's edited numbers (on) or the looks as written (off, the default) */
export const LOOK_TUNING = { override: false };

export function lookWritten(palette: Palette): Look {
  let look = written.get(palette);
  if (!look) written.set(palette, (look = resolveLook(palette)));
  return look;
}

/** The tune panel's numbers for a mood: a copy of the written ones until moved */
export function lookEdited(palette: Palette): Look {
  let look = edited.get(palette);
  if (!look) edited.set(palette, (look = cloneLook(lookWritten(palette))));
  return look;
}

/** The look in use for a mood: the edited one with LOOK_TUNING.override on, else as written */
export function lookFor(palette: Palette): Look {
  return LOOK_TUNING.override ? lookEdited(palette) : lookWritten(palette);
}

/** The edited numbers back to the written ones */
export function resetLook(palette: Palette): Look {
  const look = cloneLook(lookWritten(palette));
  edited.set(palette, look);
  return look;
}

/** What a mood's edited look changes against the layers below it, as the JSON to paste into the mood */
export function lookDiff(palette: Palette): LookPatch {
  const base = resolveLook({ ...palette, look: undefined }, biomeOf(palette));
  const look = lookEdited(palette);
  const diff: LookPatch = {};
  for (const group of Object.keys(look) as (keyof Look)[]) {
    const a = base[group] as Record<string, unknown>;
    const b = look[group] as Record<string, unknown>;
    const part: Record<string, unknown> = {};
    for (const key of Object.keys(b)) if (JSON.stringify(a[key]) !== JSON.stringify(b[key])) part[key] = b[key];
    if (Object.keys(part).length) (diff as Record<string, unknown>)[group] = part;
  }
  return diff;
}
