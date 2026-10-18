import { Vector3 } from "three";
import { makeRng, range } from "../rng";
import type { Biome, Level } from "./biomes";
import { Course } from "./course";
import { type MoodShift, type Palette, moodShift } from "./palette";
import { TerrainField } from "./terrain/field";
import { Ground } from "./terrain/ground";
import { makeNoise } from "./terrain/noise";
import { buildLand } from "./terrain/recipes";
import { Bridge, Grain, type IslandPond, NoiseIsland } from "./terrain/shapes";
import type { Steps, WaterKind } from "./terrain/river";
import { TreeIndex } from "./trees";

// Distances beyond this don't matter for scoring, so lookups can stop there
export const PROXIMITY_RANGE = 12;
/** Fall this far below the racing line and you're lost in the clouds */
const ABYSS = 240;
const SEA_STEP = 8;
const SEA_PAD = 1700;
const START_AIM_LIFT = 4; // metres above the first ring's centre the start aims at, for the sink on the way
const START_CLEARANCE = 3; // metres of air the aimed start needs all the way to the first ring

export interface WaterHit {
  distance: number;
  level: number;
  kind: WaterKind;
}

/** A waterfall pouring off a floating island's rim into the void */
export interface IslandFall {
  x: number; // the lip
  y: number;
  z: number;
  dx: number; // outward, horizontal
  dz: number;
  width: number;
  drop: number; // metres down to where it fades into the clouds
}

/** Anything with a signed distance: the land's terrain field */
export interface Rock {
  distance(x: number, y: number, z: number): number;
}

/** Everything a level decides: the line, the land, the water, the colors. No rendering. */
export class World {
  readonly level: Level;
  readonly biome: Biome;
  readonly seed: number;
  readonly course: Course;
  readonly palette: Palette;
  /** This mood's repaint of the biome's baked land and plant colors (moodShift): the meshers bake it into the vertices */
  readonly mood: MoodShift;
  /** All the land, for collisions */
  readonly rock: Rock;
  /** The land: ground and rock shapes, one distance field */
  readonly land: TerrainField;
  /** The stepped valley floor and its river, if the biome has one */
  readonly steps: Steps | null = null;
  /** Whether the biome has a sea. Its surface follows the racing line down (`seaAt`) */
  readonly hasSea: boolean = false;
  private seaTable: Float32Array | null = null;
  /** Waterfalls off floating islands */
  readonly islandFalls: IslandFall[] = [];
  /** Ponds on the tops of floating islands */
  readonly islandPonds: IslandPond[] = [];
  /** Stone bridges between neighbouring islands, off the line (the bridge gates are not listed here) */
  readonly islandBridges: Bridge[] = [];
  /** Trees grow on the land; chunks add them as they are meshed */
  readonly trees = new TreeIndex(PROXIMITY_RANGE);
  /** Which way pilots face on the start line */
  readonly startDirection: Vector3;

  constructor(level: Level) {
    this.level = level;
    this.biome = level.biome;
    this.seed = level.seed;
    this.palette = level.palette;
    this.mood = moodShift(this.biome.moods[0], this.palette);
    this.course = new Course(this.seed);
    const terrain = this.biome.terrain;
    const noise = makeNoise(this.seed, "land");
    const ground = terrain.ground ? new Ground(this.course, terrain.ground, makeRng(this.seed, "ground"), noise, terrain.walls) : null;
    const field = new TerrainField(this.course, ground, terrain.groundSurface, noise);
    if (terrain.sea) {
      this.hasSea = true;
      this.seaTable = this.buildSeaTable(terrain.sea.level);
    }
    buildLand({ course: this.course, field, ground, rng: makeRng(this.seed, "land"), noise, seaAt: this.hasSea ? (z) => this.seaAt(z) : null }, terrain.land);
    this.land = field;
    this.rock = field;
    this.steps = ground?.steps?.river ? ground.steps : null;
    // Ponds first: they carve the islands, and the falls walk the carved rock
    if (terrain.islandPonds) this.findIslandPonds(terrain.islandPonds.chance);
    if (terrain.islandBridges) this.findIslandBridges(terrain.islandBridges.chance, terrain.islandBridges.surface);
    if (terrain.islandFalls) this.findIslandFalls(terrain.islandFalls.chance);
    this.startDirection = this.startHeading();
  }

  /**
   * The sea keeps its depth under the line (a flat sea at the last gate's height
   * lay hundreds of metres below the start, out of sight and past the world's
   * edge). The line's slope is smoothed so the surface doesn't undulate with it.
   */
  private buildSeaTable(level: number): Float32Array {
    const { course } = this;
    const table = new Float32Array(Math.ceil((course.endZ + SEA_PAD * 2 - course.start.z) / SEA_STEP) + 2);
    for (let i = 0; i < table.length; i++) {
      const z = course.start.z - SEA_PAD + i * SEA_STEP;
      let sum = 0;
      for (let k = -5; k <= 5; k++) sum += course.y(z + k * 40);
      table[i] = sum / 11 + level;
    }
    return table;
  }

  /** The sea's surface height at z, or null if there is no sea */
  seaAt(z: number): number | null {
    const table = this.seaTable;
    if (!table) return null;
    const f = Math.min(Math.max((z - this.course.start.z + SEA_PAD) / SEA_STEP, 0), table.length - 1.001);
    const i = Math.floor(f);
    return table[i] + (table[i + 1] - table[i]) * (f - i);
  }

  /** Flying straight off the start goes through the first ring, unless rock is in the way: then follow the line */
  private startHeading(): Vector3 {
    const { start, rings, startDirection } = this.course;
    const aim = rings[0].position.clone().add(new Vector3(0, START_AIM_LIFT, 0)).sub(start);
    const point = new Vector3();
    for (let t = 0; t <= 1; t += 0.02) {
      point.copy(start).addScaledVector(aim, t);
      if (this.rock.distance(point.x, point.y, point.z) < START_CLEARANCE) return startDirection.clone();
    }
    return aim.normalize();
  }

  /** Finds a rim to pour from on some of the big floating islands */
  private findIslandFalls(chance: number) {
    const rng = makeRng(this.seed, "island falls");
    const field = this.land;
    for (const shape of field.shapes) {
      if (!(shape instanceof NoiseIsland) || shape.anchor.size < 24) continue;
      const roll = rng();
      const angle = range(rng, 0, Math.PI * 2);
      if (roll > chance) continue;
      const { x, y, z, size } = shape.anchor;
      const dx = Math.cos(angle);
      const dz = Math.sin(angle);
      // Walk out from the middle, a little below the top, until we leave the rock
      const level = y + size * 0.12;
      let r = 0;
      while (r < size * 1.6 && field.distance(x + dx * r, level, z + dz * r) < 0) r += 2;
      if (r >= size * 1.6 || r < size * 0.3) continue;
      // Keep the racing line clear of the curtain
      if (this.course.distance(x + dx * r, level - 20, z + dz * r) < 30) continue;
      this.islandFalls.push({
        x: x + dx * (r - 2.5),
        y: level,
        z: z + dz * (r - 2.5),
        dx,
        dz,
        width: size * range(rng, 0.12, 0.2),
        drop: level - (this.course.y(z) - 230),
      });
    }
  }

  /**
   * A pond on the top of some islands: the bowl is carved into the island (so the meshers and the
   * collider see it), the water is drawn by WaterView and solid like a river pool. The island's
   * real top is found by marching down onto the rock: the noise moves it off the nominal level
   */
  private findIslandPonds(chance: number) {
    const rng = makeRng(this.seed, "island ponds");
    const field = this.land;
    for (const shape of field.shapes) {
      if (!(shape instanceof NoiseIsland) || shape.anchor.size < 20) continue;
      const roll = rng();
      const r = shape.anchor.size * range(rng, 0.22, 0.32);
      if (roll > chance) continue;
      const { x, z, size } = shape.anchor;
      // Down from well above the dome (its top is 0.27 size up, plus the noise) onto the rock
      let y = shape.anchor.y + size * 0.55;
      const floor = shape.anchor.y - size * 0.1;
      while (y > floor && field.distance(x, y, z) > 0) y -= 0.5;
      if (y <= floor) continue;
      // The lip stands a little proud of the rock; the water sits well under the lip, the bowl deeper still
      const top = y + 1;
      const pond: IslandPond = { x, z, r, level: top - 1.4, top, depth: 4 };
      // Never under the racing tube
      if (this.course.distance(x, pond.level, z) < 24) continue;
      shape.setPond(pond);
      // Another shape (a neighbouring island, a gate) can fill the bowl or bury the lip: then no pond here
      if (this.pondIsClean(pond)) this.islandPonds.push(pond);
      else shape.setPond(null);
    }
  }

  /** The rock's top under (x, z) on an island, by marching down from above its dome; NaN if there is none */
  private islandTop(island: NoiseIsland, x: number, z: number): number {
    const { y: ay, size } = island.anchor;
    let y = ay + size * 0.55;
    const floor = ay - size * 0.1;
    while (y > floor && this.land.distance(x, y, z) > 0) y -= 0.5;
    return y > floor ? y : NaN;
  }

  /**
   * Stone bridges between neighbouring islands: pairs 10 to 50 m apart rim to rim and level
   * enough, each island in one bridge at most, never near the racing line (the gate kind
   * `bridge` makes the ones the line flies under). A humped deck from rim to rim, an arch
   * under it, the abutments sunk into the islands; the field blends it into their rock
   */
  private findIslandBridges(chance: number, surface: number) {
    const rng = makeRng(this.seed, "island bridges");
    const field = this.land;
    const islands = field.shapes.filter((s): s is NoiseIsland => s instanceof NoiseIsland && s.anchor.size >= 16);
    const used = new Set<NoiseIsland>();
    for (let i = 0; i < islands.length; i++) {
      for (let j = i + 1; j < islands.length; j++) {
        const A = islands[i], B = islands[j];
        if (used.has(A) || used.has(B)) continue;
        const a = A.anchor, b = B.anchor;
        const dx = b.x - a.x, dz = b.z - a.z;
        const dist = Math.hypot(dx, dz);
        const gap = dist - a.size - b.size;
        if (gap < 10 || gap > 50 || Math.abs(a.y - b.y) > 24) continue;
        if (rng() > chance) continue;
        const ux = dx / dist, uz = dz / dist;
        // The ends: well inside each island's rim
        const ax = a.x + ux * a.size * 0.9, az = a.z + uz * a.size * 0.9;
        const bx = b.x - ux * b.size * 0.9, bz = b.z - uz * b.size * 0.9;
        const ya = this.islandTop(A, ax, az), yb = this.islandTop(B, bx, bz);
        if (Number.isNaN(ya) || Number.isNaN(yb)) continue;
        const level = (ya + yb) / 2;
        // Off the line: nothing of the deck near the tube
        let clear = true;
        for (let k = 0; k <= 6 && clear; k++) {
          const f = k / 6;
          if (this.course.distance(ax + (bx - ax) * f, level + 6, az + (bz - az) * f) < 20) clear = false;
        }
        if (!clear) continue;
        const half = Math.hypot(bx - ax, bz - az) / 2 + 2.5;
        // A ramp where one island stands higher, up to about 24 degrees
        const slope = (yb - ya) / (2 * half);
        if (Math.abs(slope) > 0.45) continue;
        // A tall hump: the field blends the abutments into the island rock over 6 m, so a low arch would close;
        // the deck over the arch stays 5 m thick and the piers 0.45 of the half span, for the 3 m voxels
        const foot = 2.5;
        const crown = foot + Math.min(14, Math.max(8, half * 0.5));
        const arch: [number, number] = [Math.max(4, half * 0.55), crown - 5];
        // The middle of the gap must be empty: a gate's ring or ridge, or a third island, can stand in it
        // (near the ends the islands' own domes may rise over the deck: the bridge runs into the hillside)
        const cx = (ax + bx) / 2, cz = (az + bz) / 2, y0 = level - foot;
        if (field.distance(cx, y0, cz) < arch[1] - 1 || field.distance(cx, y0 + crown + 2, cz) < 4) continue;
        let empty = true;
        for (const f of [0.3, 0.4, 0.6, 0.7]) {
          const y = y0 + slope * (f - 0.5) * 2 * half + crown + 1.5;
          if (field.distance(ax + (bx - ax) * f, y, az + (bz - az) * f) < 2.5) empty = false;
        }
        if (!empty) continue;
        const bridge = new Bridge(new Vector3(cx, y0, cz), new Vector3(ux, 0, uz), { half, width: range(rng, 6, 7.5), crown, foot, arch, depth: arch[1] + 4, slope }, { surface, grain: Grain.Layered });
        if (!field.add(bridge)) continue;
        used.add(A);
        used.add(B);
        this.islandBridges.push(bridge);
      }
    }
  }

  /** Air over the water and in the bowl, rock under the bowl and all around the lip */
  private pondIsClean(p: IslandPond): boolean {
    const field = this.land;
    if (field.distance(p.x, p.level + 0.3, p.z) < 0.5) return false;
    if (field.distance(p.x, p.level - 4.5, p.z) > 0) return false;
    for (let k = 0; k < 12; k++) {
      const a = (k / 12) * Math.PI * 2;
      const cos = Math.cos(a), sin = Math.sin(a);
      // (the bowl is an ellipsoid bound, which understates the distance inside: any air will do)
      if (field.distance(p.x + cos * p.r * 0.5, p.level - 1.5, p.z + sin * p.r * 0.5) <= 0) return false;
      if (field.distance(p.x + cos * (p.r + 1.8), p.level + 0.3, p.z + sin * (p.r + 1.8)) > 0.2) return false;
    }
    return true;
  }

  /** Distance to a pond's water: the flat disc of its surface (negative under it, inside the bowl) */
  private pondDistance(x: number, y: number, z: number): number {
    let d = Infinity;
    for (const p of this.islandPonds) {
      const out = Math.hypot(x - p.x, z - p.z) - p.r;
      const dy = y - p.level;
      const v = out > 0 ? Math.hypot(out, Math.max(dy, 0)) : dy;
      if (v < d) d = v;
    }
    return d;
  }

  /** Distance from a point to the nearest rock, tree or water surface (negative inside) */
  distance(x: number, y: number, z: number): number {
    return Math.min(this.rock.distance(x, y, z), this.otherDistance(x, y, z));
  }

  /** Distance to everything solid but the rock: trees, river pools, the sea */
  otherDistance(x: number, y: number, z: number): number {
    let d = this.trees.distance(x, y, z);
    if (this.steps) d = Math.min(d, this.steps.waterDistance(x, y, z));
    if (this.islandPonds.length) d = Math.min(d, this.pondDistance(x, y, z));
    const sea = this.seaAt(z);
    if (sea !== null) d = Math.min(d, y - sea);
    return d;
  }

  /**
   * The water surface nearest a point (river pools or the sea): its distance,
   * height and kind, or null if there is no water near. Fills and returns `out`.
   */
  waterNear(x: number, y: number, z: number, out: WaterHit): WaterHit | null {
    let found = false;
    out.distance = Infinity;
    if (this.steps) {
      const d = this.steps.waterDistance(x, y, z);
      if (d < out.distance) {
        out.distance = d;
        out.level = this.steps.pool(z).level;
        out.kind = this.steps.river!.kind;
        found = true;
      }
    }
    const sea = this.seaAt(z);
    if (sea !== null && y - sea < out.distance) {
      out.distance = y - sea;
      out.level = sea;
      out.kind = "water";
      found = true;
    }
    return found ? out : null;
  }

  /** Height of the valley floor under the racing line at z (where valley mist pools) */
  valleyFloor(z: number): number {
    const sea = this.seaAt(z);
    if (sea !== null) return sea;
    const ground = this.land.ground;
    if (!ground) return this.course.y(z) - 40;
    if (ground.steps) return ground.steps.level(z);
    return ground.spec.level !== null ? ground.height(this.course.x(z), z) : this.course.y(z) - ground.spec.depth;
  }

  /** Below the islands, there is only the sea of clouds */
  lost(y: number, z: number): boolean {
    return y < this.course.y(z) - ABYSS;
  }

  /** Where to put a pilot whose furthest gate passed is ring `checkpoints` (1-based): just past it; 0 is the start */
  spawnPoint(checkpoints: number): { position: Vector3; direction: Vector3 } {
    const { rings, start } = this.course;
    if (checkpoints <= 0) {
      return { position: start.clone(), direction: this.startDirection.clone() };
    }
    const ring = rings[Math.min(checkpoints, rings.length) - 1];
    return { position: ring.position.clone().addScaledVector(ring.normal, 4), direction: ring.normal.clone() };
  }
}
