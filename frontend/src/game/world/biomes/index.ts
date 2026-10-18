import { makeRng } from "../../rng";
import { ARCHIPELAGO } from "./archipelago";
import { AURORA } from "./aurora";
import { GLACIER } from "./glacier";
import { LAGOON } from "./lagoon";
import { REEF } from "./reef";
import { TWILIGHT } from "./twilight";
import { VERDANT } from "./verdant";
import type { Biome, BiomeId, Level, LevelKey } from "./types";

export type { Biome, BiomeId, Level, LevelKey } from "./types";

export const BIOMES: Record<BiomeId, Biome> = {
  verdant: VERDANT,
  glacier: GLACIER,
  archipelago: ARCHIPELAGO,
  lagoon: LAGOON,
  twilight: TWILIGHT,
  aurora: AURORA,
  reef: REEF,
};

/**
 * Every map, shared by both modes: time trials and rooms fly the same pool. A seed picks one
 * of them by its place in this list, so adding a biome changes which map most seeds stand for.
 */
export const MAPS = Object.keys(BIOMES) as BiomeId[];

/** The map a seed stands for, in every mode: which biome, and which of its moods */
export function seedMap(seed: number): { biome: BiomeId; mood: number } {
  const biome = MAPS[Math.floor(makeRng(seed, "map")() * MAPS.length)];
  const mood = Math.floor(makeRng(seed, "palette")() * BIOMES[biome].moods.length);
  return { biome, mood };
}

/** Time trials and rooms: the map the seed stands for (any biome) */
export function seedLevel(seed: number): Level {
  const { biome, mood } = seedMap(seed);
  return makeLevel({ biome, seed, mood });
}

const SEED_SEARCH = 10_000; // a seed for a given biome turns up in about as many tries as there are maps

/** The lowest seed that stands for `biome`: its showcase course in the map selects */
export function featuredSeed(biome: BiomeId): number {
  for (let seed = 1; seed < SEED_SEARCH; seed++) if (seedMap(seed).biome === biome) return seed;
  throw new Error(`No seed stands for ${biome}`);
}

/** Rebuilds a level from its key (the mesher workers get keys, not levels) */
export function makeLevel(key: LevelKey): Level {
  const biome = BIOMES[key.biome];
  return {
    key,
    biome,
    seed: key.seed,
    palette: biome.moods[key.mood % biome.moods.length],
  };
}

/** Identifies a level's map, e.g. to cache it or to drop stale worker results */
export function levelId(key: LevelKey): string {
  return `${key.biome}:${key.seed}:${key.mood}`;
}
