import { createNoise2D, type NoiseFunction2D } from "simplex-noise";
import { Vector3 } from "three";
import { makeRng, range } from "../rng";

/** The racing line is always this clear of rock: a tube carved through everything */
export const TUBE_RADIUS = 11;
export const RING_RADIUS = 8;
export const FINISH_RADIUS = 12;
const LENGTH = 2200; // metres of z from the start to the last gate
const START_Z = -80;
// The line drops 0.22 m per metre forward on average, and always drops at least
// 0.12: a wingsuit can't climb for long, so the line never asks it to
const SLOPE = 0.22;
const SLOPE_SWING = 0.1;
const STEP = 2; // metres of z between line samples
/** `distance` looks at the line this far either side of the point's z */
const SEARCH = TUBE_RADIUS + 10;
/** The continuous x(z) strays at most this far from the sampled polyline (measured: 0.02 m) */
const LINE_SLACK = 0.25;

export interface Ring {
  index: number;
  position: Vector3;
  normal: Vector3; // the direction you fly through it
  radius: number;
  finish: boolean;
}

/**
 * The racing line: a descending 3D curve, a function of z, so it never turns back.
 * Gates (obstacles the line threads) sit along it, each with a ring.
 */
export class Course {
  readonly rings: Ring[] = [];
  /** z of each gate */
  readonly gates: number[] = [];
  readonly start: Vector3;
  readonly startDirection: Vector3;
  readonly endZ: number;
  private readonly noise: NoiseFunction2D;
  private readonly z0: number;
  private readonly xs: Float64Array;
  private readonly ys: Float64Array;
  /** Per sample, 1/√(1+s²) for the steepest segment `distance` could reach from there: see `minDistance` */
  private readonly leans: Float64Array;

  constructor(seed: number) {
    this.noise = createNoise2D(makeRng(seed, "line"));
    const rng = makeRng(seed, "gates");
    for (let z = 90; z < LENGTH; z += range(rng, 95, 130)) this.gates.push(z);
    this.endZ = LENGTH + 80;

    // Sampled densely: heights come from adding up the slope, and distance queries are fast
    this.z0 = START_Z - 60;
    const count = Math.ceil((this.endZ + 1000 - this.z0) / STEP);
    this.xs = new Float64Array(count);
    this.ys = new Float64Array(count);
    let y = 0;
    for (let i = 0; i < count; i++) {
      const z = this.z0 + i * STEP;
      this.xs[i] = this.x(z);
      this.ys[i] = y;
      y -= (SLOPE + SLOPE_SWING * this.noise(z * 0.003, 3.1)) * STEP;
    }
    // How steeply each segment leans away from straight ahead, and the worst of
    // them among the segments `distance` searches from any point near a sample
    const slopes = new Float64Array(count - 1);
    for (let i = 0; i + 1 < count; i++) slopes[i] = ((this.xs[i + 1] - this.xs[i]) ** 2 + (this.ys[i + 1] - this.ys[i]) ** 2) / (STEP * STEP);
    const span = Math.ceil(SEARCH / STEP) + 2;
    this.leans = new Float64Array(count);
    for (let i = 0; i < count; i++) {
      let worst = 0;
      for (let j = Math.max(0, i - span); j <= Math.min(count - 2, i + span); j++) if (slopes[j] > worst) worst = slopes[j];
      this.leans[i] = 1 / Math.sqrt(1 + worst);
    }

    this.gates.forEach((z, index) => {
      this.rings.push({
        index,
        position: this.pointAt(z),
        normal: this.tangentAt(z),
        radius: RING_RADIUS,
        finish: false,
      });
    });
    this.rings.push({
      index: this.gates.length,
      position: this.pointAt(this.endZ),
      normal: this.tangentAt(this.endZ),
      radius: FINISH_RADIUS,
      finish: true,
    });

    this.start = this.pointAt(START_Z);
    this.startDirection = this.pointAt(START_Z + 120).sub(this.start).normalize();
  }

  x(z: number): number {
    return 170 * this.noise(z * 0.0011, 1.3) + 45 * this.noise(z * 0.004, 7.7);
  }

  y(z: number): number {
    const f = Math.min(Math.max((z - this.z0) / STEP, 0), this.ys.length - 1.001);
    const i = Math.floor(f);
    return this.ys[i] + (this.ys[i + 1] - this.ys[i]) * (f - i);
  }

  pointAt(z: number, out = new Vector3()): Vector3 {
    return out.set(this.x(z), this.y(z), z);
  }

  tangentAt(z: number, out = new Vector3()): Vector3 {
    return out.set(this.x(z + 2) - this.x(z - 2), this.y(z + 2) - this.y(z - 2), 4).normalize();
  }

  /**
   * A cheap lower bound on `distance`: the line comes no nearer to the point than
   * this. From the point's offset to the line at its own z (callers sampling
   * columns pass the line's x and y there), shrunk by how much the line can lean
   * towards the point within `distance`'s search: a segment of slope s brings
   * the line to at least offset/√(1+s²). Beyond the line's sampled stretch, 0
   */
  minDistance(px: number, py: number, pz: number, lineX = this.x(pz), lineY = this.y(pz)): number {
    const f = (pz - this.z0) / STEP;
    if (!(f >= 0 && f <= this.xs.length - 2)) return 0;
    const dx = px - lineX;
    const dy = py - lineY;
    return Math.max(0, Math.sqrt(dx * dx + dy * dy) - LINE_SLACK) * this.leans[Math.floor(f)];
  }

  /** Distance from a point to the racing line (exact within a few tube radii, else at least that) */
  distance(px: number, py: number, pz: number): number {
    const first = Math.max(0, Math.floor((pz - SEARCH - this.z0) / STEP));
    const last = Math.min(this.xs.length - 2, Math.ceil((pz + SEARCH - this.z0) / STEP));
    let best = Infinity;
    for (let i = first; i <= last; i++) {
      // Point to segment, in 3D
      const ax = this.xs[i];
      const ay = this.ys[i];
      const az = this.z0 + i * STEP;
      const dx = this.xs[i + 1] - ax;
      const dy = this.ys[i + 1] - ay;
      const dz = STEP;
      const t = Math.min(1, Math.max(0, ((px - ax) * dx + (py - ay) * dy + (pz - az) * dz) / (dx * dx + dy * dy + dz * dz)));
      const d = Math.hypot(px - ax - dx * t, py - ay - dy * t, pz - az - dz * t);
      if (d < best) best = d;
    }
    return best;
  }
}
