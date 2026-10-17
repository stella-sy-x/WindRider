import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { flatMaterial } from "./toon";
import { ATMOSPHERE } from "./world/atmosphere";
import { ANIM, FX } from "./tuning";
import { clamp, smoothstep } from "./math";
import { DISSOLVE_AT, type DeathKind, WING_POINTS } from "./death";
import type { ItemSlot } from "./items/models";

// The pilot: a small low-poly wingsuit flyer built for the chase camera, which only
// ever sees it from behind and above, ten metres away. From there it reads as five
// big shapes and nothing else:
//
//   1. Two THICK, WIDE wings: rigid tapered slabs hung from the chest, far wider than
//      the arms reach. They carry the identity and make up most of the silhouette.
//   2. A jetpack: one dark block running down the back from the shoulders to the hips,
//      with two exhaust nozzles at the bottom that burn under boost (the trails stream
//      from them).
//   3. A helmeted head, kept small so the wings stay dominant.
//   4+5. Two simple legs, nothing between them.
//
// The livery is one fixed scheme: sunrise orange wings (the brightest thing on the
// pilot, which pops against green islands, purple twilight and blue water, and keeps
// its edge against a golden sunset through the ink hardware next to it), a medium
// slate-teal flight suit, ink for the hardware (helmet, pack, boots) and gold trims.
// Everything is built from primitives at runtime.
//
// The body is modelled standing (up +y, facing -z, right +x) and then laid prone, so
// the head points along the flight direction (-z) and the back faces up. The caller
// places `group` at the flight model's position and rotation; everything the
// animation adds (rolls, bobbing, the wing sweep) happens inside it.

const SCALE = 1.65;
const TAU = Math.PI * 2;

// --- the wings, in chest space (standing body: up +y, facing -z, right +x) ----------

/** The right wing's root pivot on the chest; the left mirrors x */
const WING_ROOT: Vec = [0.12, 0.08, -0.01];
/** Root to tip along x, so the tips sit at x = ±0.7 (the hands reach ±0.5) */
const WING_LENGTH = 0.58;
/** Chord (along y: forward +y, aft -y when prone) at the root and the tip */
const WING_ROOT_CHORD = 0.3;
const WING_TIP_CHORD = 0.15;
/** Thickness (along z: up when prone) at the root and the tip */
const WING_THICK = 0.045;
const WING_TIP_THICK = 0.03;
/** How far the tip's chord sits behind the root's */
const WING_SWEEP = 0.1;
/** The leading-edge spar's chord, and the gold tip cap's length along the span */
const WING_SPAR = 0.055;
const WING_TIP_CAP = 0.09;

// --- the jetpack, in chest space -------------------------------------------------------

/** The pack block's center and size (x width, y height along the spine, z depth off the back) */
const PACK_AT: Vec = [0, 0.05, 0.11];
const PACK_SIZE: Vec = [0.12, 0.3, 0.08];
/** The nozzles hang from the pack's bottom edge, one each side of the spine */
const NOZZLE_X = 0.035;
const NOZZLE_RADIUS = 0.028;
const NOZZLE_LENGTH = 0.07;
const NOZZLE_TOP = PACK_AT[1] - PACK_SIZE[1] / 2;

// --- colors ----------------------------------------------------------------------

interface Tones {
  skin: THREE.Color;
  /** The flight suit: a medium slate teal, the complement of the wings */
  suit: THREE.Color;
  /** The wings' sunrise orange, the brightest thing on the pilot */
  wing: THREE.Color;
  /** The wings' leading-edge spar */
  wingEdge: THREE.Color;
  trim: THREE.Color;
  /** Ink for the hardware: the helmet, the pack, the boots */
  dark: THREE.Color;
  /** The pack's raised top, a shade lighter than the block so the step reads */
  packLight: THREE.Color;
  white: THREE.Color;
  /** The exhausts' flame under boost */
  accent: THREE.Color;
  /** Tinted visor glass */
  visor: THREE.Color;
  /** Gunmetal for the nozzles */
  metal: THREE.Color;
}

type ToneName = keyof Tones;
/**
 * A flat tone, or a function of the vertex position (in the part's space) and its
 * index. A function may return a glow (0..1) for the vertices it paints; otherwise
 * the glow follows how close the color is to the gold trim or the accent.
 */
type Paint = ToneName | ((p: THREE.Vector3, tones: Tones, out: THREE.Color, index: number) => number | void);

/**
 * The suit's one fixed livery. There is no player color; every pilot wears the same
 * scheme (multiplayer tells them apart by the name label, see `createLabel`).
 */
function tonesFor(): Tones {
  return {
    skin: new THREE.Color("#f5d0b0"),
    suit: new THREE.Color("#4f6a7a"),
    wing: new THREE.Color("#ff9a3d"),
    wingEdge: new THREE.Color("#262430"),
    trim: new THREE.Color("#f3c869"),
    dark: new THREE.Color("#262430"),
    packLight: new THREE.Color("#3b3845"),
    white: new THREE.Color("#ffffff"),
    accent: new THREE.Color("#ffb347"),
    visor: new THREE.Color("#1a2f44"),
    metal: new THREE.Color("#4b505e"),
  };
}

// --- geometry helpers --------------------------------------------------------------

const euler = new THREE.Euler();
const m4 = new THREE.Matrix4();
const q = new THREE.Quaternion();
const v3 = new THREE.Vector3();
const s3 = new THREE.Vector3();

type Vec = [number, number, number];

function place(geometry: THREE.BufferGeometry, at: Vec = [0, 0, 0], rot: Vec = [0, 0, 0], scale: Vec = [1, 1, 1]) {
  m4.compose(v3.set(...at), q.setFromEuler(euler.set(...rot)), s3.set(...scale));
  return geometry.applyMatrix4(m4);
}

/** Collects primitives into one mesh with per-vertex colors, so each body part is one draw call */
class PartBuilder {
  private readonly items: { geometry: THREE.BufferGeometry; paint: Paint }[] = [];

  add(geometry: THREE.BufferGeometry, paint: Paint, at?: Vec, rot?: Vec, scale?: Vec): this {
    place(geometry, at, rot, scale);
    const flat = geometry.index ? geometry.toNonIndexed() : geometry;
    if (flat !== geometry) geometry.dispose();
    for (const name of Object.keys(flat.attributes)) {
      if (name !== "position" && name !== "normal") flat.deleteAttribute(name);
    }
    this.items.push({ geometry: flat, paint });
    return this;
  }

  build(): Painted {
    const geometry = mergeGeometries(this.items.map((i) => i.geometry))!;
    const ranges: PaintRange[] = [];
    let start = 0;
    for (const item of this.items) {
      const count = item.geometry.getAttribute("position").count;
      ranges.push({ start, count, paint: item.paint });
      start += count;
      item.geometry.dispose();
    }
    geometry.setAttribute("color", new THREE.Float32BufferAttribute(new Float32Array(start * 3), 3));
    geometry.setAttribute("glow", new THREE.Float32BufferAttribute(new Float32Array(start), 1));
    geometry.computeBoundingSphere();
    return { geometry, ranges };
  }
}

interface PaintRange {
  start: number;
  count: number;
  paint: Paint;
}

interface Painted {
  geometry: THREE.BufferGeometry;
  ranges: PaintRange[];
}

const paintColor = new THREE.Color();
const paintPoint = new THREE.Vector3();

/** How close two colors are, 1 = the same */
function likeness(a: THREE.Color, b: THREE.Color): number {
  const d = Math.hypot(a.r - b.r, a.g - b.g, a.b - b.b);
  return 1 - smoothstep(0.03, 0.22, d);
}

/** Runs a paint at `paintPoint` into `paintColor`, and returns the glow for it */
function paintAt(paint: Paint, tones: Tones, index: number): number {
  let glow: number | void = undefined;
  if (typeof paint === "string") paintColor.copy(tones[paint]);
  else glow = paint(paintPoint, tones, paintColor, index);
  if (typeof glow === "number") return glow;
  return Math.max(likeness(paintColor, tones.trim), likeness(paintColor, tones.accent) * 0.8);
}

/**
 * Writes vertex colors, and a glow for the gold trims and the accent (they light up at night).
 *
 * The parts are non-indexed (three vertices per triangle) and are painted once per face at
 * the triangle's centroid, with all three corners getting that color, so they read as flat
 * facets like the terrain instead of smooth gradients.
 */
function applyPaint({ geometry, ranges }: Painted, tones: Tones) {
  const position = geometry.getAttribute("position");
  const color = geometry.getAttribute("color") as THREE.BufferAttribute;
  const glow = geometry.getAttribute("glow") as THREE.BufferAttribute;
  const perFace = !geometry.index;
  for (const { start, count, paint } of ranges) {
    const end = start + count;
    const facesEnd = perFace ? start + count - (count % 3) : start;
    // Whole triangles: one paint call at the centroid, written to all three corners
    for (let i = start; i < facesEnd; i += 3) {
      paintPoint.set(
        (position.getX(i) + position.getX(i + 1) + position.getX(i + 2)) / 3,
        (position.getY(i) + position.getY(i + 1) + position.getY(i + 2)) / 3,
        (position.getZ(i) + position.getZ(i + 1) + position.getZ(i + 2)) / 3,
      );
      const g = paintAt(paint, tones, i - start);
      for (let k = 0; k < 3; k++) {
        color.setXYZ(i + k, paintColor.r, paintColor.g, paintColor.b);
        glow.setX(i + k, g);
      }
    }
    // Leftover vertices (indexed geometry, or a count that is not a multiple of 3): per vertex
    for (let i = facesEnd; i < end; i++) {
      paintPoint.fromBufferAttribute(position, i);
      const g = paintAt(paint, tones, i - start);
      color.setXYZ(i, paintColor.r, paintColor.g, paintColor.b);
      glow.setX(i, g);
    }
  }
  color.needsUpdate = true;
  glow.needsUpdate = true;
}

const sphere = (r: number, w = 6, h = 4) => new THREE.SphereGeometry(r, w, h);
const capsule = (r: number, length: number) => new THREE.CapsuleGeometry(r, length, 3, 5, 1);
const cyl = (top: number, bottom: number, h: number, n = 6) => new THREE.CylinderGeometry(top, bottom, h, n, 1);
/** An open tube (no caps); `from`/`arc` in radians around +y, 0 at +z */
const tube = (r: number, h: number, n: number, from = 0, arc = TAU) => new THREE.CylinderGeometry(r, r, h, n, 1, true, from, arc);
const lathe = (profile: [number, number][], n = 8) =>
  new THREE.LatheGeometry(
    profile.map(([r, y]) => new THREE.Vector2(r, y)),
    n,
  );

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/**
 * A thick slab along x from `x0` to `x1`: a rectangle at the root (y from `root[0]` to
 * `root[1]`, `rootThick` deep in z) going to another at the tip. Eight corners, twelve
 * flat facets, 36 vertices. `s` mirrors it onto the left (-x) with the winding kept
 * outward, so it stays a closed solid for a front-face material.
 */
function slab(x0: number, x1: number, root: [number, number], tip: [number, number], rootThick: number, tipThick: number, s: 1 | -1): THREE.BufferGeometry {
  const r = [[x0, root[0], -rootThick / 2], [x0, root[1], -rootThick / 2], [x0, root[1], rootThick / 2], [x0, root[0], rootThick / 2]];
  const e = [[x1, tip[0], -tipThick / 2], [x1, tip[1], -tipThick / 2], [x1, tip[1], tipThick / 2], [x1, tip[0], tipThick / 2]];
  // Each face as a quad wound counter-clockwise seen from outside
  const quads = [
    [r[0], r[3], r[2], r[1]], [e[0], e[1], e[2], e[3]], // root and tip caps
    [r[0], r[1], e[1], e[0]], [r[3], e[3], e[2], r[2]], // underside and top
    [r[0], e[0], e[3], r[3]], [r[1], r[2], e[2], e[1]], // trailing and leading edges
  ];
  const position = new Float32Array(quads.length * 18);
  let k = 0;
  for (const [a, b, c, d] of quads) {
    const corners = [a, b, c, a, c, d];
    if (s < 0) corners.reverse();
    for (const v of corners) {
      position[k++] = v[0] * s;
      position[k++] = v[1];
      position[k++] = v[2];
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(position, 3));
  geometry.computeVertexNormals();
  return geometry;
}

/** The wing's planform at `u` (0 root → 1 tip): the leading and trailing edge in y, and the thickness */
function wingSection(u: number): { lead: number; trail: number; thick: number } {
  return {
    lead: lerp(WING_ROOT_CHORD / 2, -WING_SWEEP + WING_TIP_CHORD / 2, u),
    trail: lerp(-WING_ROOT_CHORD / 2, -WING_SWEEP - WING_TIP_CHORD / 2, u),
    thick: lerp(WING_THICK, WING_TIP_THICK, u),
  };
}

/**
 * One wing (`s` 1 right, -1 left) in its root pivot's space: a broad orange slab, an ink
 * spar standing a little proud along the leading edge, and a gold cap on the tip. Three
 * separate solids, so the panel lines are real edges the flat shading can catch.
 */
function buildWing(s: 1 | -1): PartBuilder {
  const capAt = WING_LENGTH - WING_TIP_CAP;
  const root = wingSection(0), mid = wingSection(capAt / WING_LENGTH), tip = wingSection(1);
  const body: Paint = (p, t, out) => {
    out.copy(t.wing);
    // The underside sits in shadow (the camera never sees it except mid-roll)
    if (p.z < -0.012) out.multiplyScalar(0.72);
    return 0;
  };
  return new PartBuilder()
    .add(slab(0, capAt, [root.trail, root.lead - WING_SPAR], [mid.trail, mid.lead - WING_SPAR], root.thick, mid.thick, s), body)
    .add(slab(0, capAt, [root.lead - WING_SPAR, root.lead], [mid.lead - WING_SPAR, mid.lead], root.thick + 0.012, mid.thick + 0.01, s), "wingEdge")
    .add(slab(capAt, WING_LENGTH, [mid.trail, mid.lead], [tip.trail, tip.lead], mid.thick, tip.thick, s), (_p, t, out) => { out.copy(t.trim); return 0.5; });
}

// --- the avatar --------------------------------------------------------------------

export interface AvatarOptions {
  ghost?: boolean;
}

interface Side {
  shoulder: THREE.Object3D;
  elbow: THREE.Object3D;
  /** The palm: carried items and the crash contact points live here (the trails stream from the exhausts) */
  hand: THREE.Object3D;
  hip: THREE.Object3D;
  knee: THREE.Object3D;
  /** The ankle, where boots go */
  ankle: THREE.Object3D;
  /** The wing's root pivot on the chest: sweeps with speed, tilts with the bank, folds in a crash */
  wing: THREE.Object3D;
}

const localOmega = new THREE.Vector3();
const dq = new THREE.Quaternion();
const prevInverse = new THREE.Quaternion();
const forwardTmp = new THREE.Vector3();
const leftTmp = new THREE.Vector3();

function springStep(value: number, velocity: number, target: number, stiffness: number, damping: number, dt: number) {
  const c = 2 * damping * Math.sqrt(stiffness);
  const a = stiffness * (target - value) - c * velocity;
  const v = velocity + a * dt;
  return [value + v * dt, v];
}

const smoother = (t: number) => t * t * t * (t * (t * 6 - 15) + 10);

export class Avatar {
  /** Place this at the flight model's position and rotation */
  readonly group = new THREE.Group();
  /**
   * Legacy hook from the bird-wing pilot (Game.ts and pilotfx.ts still assign it).
   * The wingsuit has no wingbeats, so it never fires.
   */
  onDownstroke?: (strength: number) => void;

  private readonly rig = new THREE.Group();
  private readonly body = new THREE.Group();
  private readonly pelvis = new THREE.Object3D();
  private readonly chest = new THREE.Object3D();
  private readonly head = new THREE.Object3D();
  private readonly left: Side;
  private readonly right: Side;
  private readonly painted: Painted[] = [];
  private readonly materials: THREE.Material[] = [];
  /** The exhaust nozzles' cores: repainted as the boost glow changes */
  private readonly exhaustCores: Painted;
  /** The cores' current glow, 0..1 (see `setBoostGlow`) */
  private exhaustGlow = 0;
  /** The glow eased towards the boost input */
  private thrust = 0;
  /** A soft round glow behind the body that silhouettes it against the scenery; looks only */
  private readonly aura: THREE.Sprite;
  private readonly auraMaterial: THREE.SpriteMaterial;
  /** A ghost's current fade (see `fade`); dims its aura along with the body */
  private ghostFade = 1;
  private tones: Tones;
  private readonly ghost: boolean;

  // Animation state
  private readonly lastQuaternion = new THREE.Quaternion();
  private hasLast = false;
  private pitchRate = 0;
  private yawRate = 0;
  private rollRate = 0;
  private lean = 0;
  private leanVelocity = 0;
  private barrel = { t: -1, dir: 1 };
  private speed = 30;
  boost = 0;
  brake = 0;

  setSpeedControls(boost: number, brake: number) {
    this.boost = boost;
    this.brake = brake;
  }

  resetMotion() {
    this.hasLast = false;
    this.pitchRate = this.yawRate = this.rollRate = 0;
    this.lean = this.leanVelocity = 0;
    this.barrel.t = -1;
    this.barrelProgress = -1;
    this.boost = this.brake = 0;
    this.thrust = 0;
  }
  private climb = 0;
  private time = 0;
  /** How far each wing (left, right) is folded by the rock during a crash, 0..1 (see `foldWings`) */
  private readonly fold = [0, 0];
  /** 0..1 while a barrel roll is under way */
  barrelProgress = -1;
  /** Where carried items go: on the back (the firework), on the head (helmets), in the right hand */
  readonly slots: Record<ItemSlot, THREE.Object3D>;
  /** The right and left ankle, for boots */
  readonly feet: [THREE.Object3D, THREE.Object3D];
  /**
   * Blends the right arm towards a pose, for item animations (items/equip.ts):
   * `amount` 0..1, shoulder angles in radians (z raises the arm towards the
   * head, x swings it to the back), `elbow` bends the forearm
   */
  readonly armPose = { amount: 0, x: 0, y: 0, z: 0, elbow: 0 };
  /** A crash playing out: the body flails, then goes limp (Game moves `group`) */
  private death: { kind: DeathKind; t: number; side: number } | null = null;

  /** `color` is kept for the callers' sake (multiplayer rosters); the suit's livery is fixed */
  constructor(_color: string, options: AvatarOptions = {}) {
    this.ghost = !!options.ghost;
    this.tones = tonesFor();
    const ghost = this.ghost;
    const skinMat = this.material(flatMaterial({ ghost }));

    this.group.add(this.rig);
    this.rig.add(this.body);
    this.rig.scale.setScalar(SCALE);
    // Lay the standing body prone: head forward (-z), back up (+y), centered on the hips
    this.body.rotation.x = -Math.PI / 2;
    const skeleton = new THREE.Group();
    skeleton.position.y = -0.74;
    this.body.add(skeleton);

    const build = (joint: THREE.Object3D, builder: PartBuilder, material = skinMat) => {
      const painted = builder.build();
      this.painted.push(painted);
      const mesh = new THREE.Mesh(painted.geometry, material);
      joint.add(mesh);
      return { mesh, painted };
    };
    const part = (joint: THREE.Object3D, builder: PartBuilder, material = skinMat) => build(joint, builder, material).mesh;

    // Pelvis: the suit's hips with a gold belt
    this.pelvis.position.set(0, 0.74, 0);
    skeleton.add(this.pelvis);
    part(
      this.pelvis,
      new PartBuilder().add(
        lathe([
          [0.001, 0.07],
          [0.095, 0.07],
          [0.108, -0.02],
          [0.118, -0.1],
          [0.12, -0.12],
          [0.001, -0.12],
        ]),
        (p, t, out) => { out.copy(p.y < -0.085 ? t.trim : t.suit); },
        [0, 0, 0],
        [0, 0, 0],
        [1, 1, 0.8],
      ),
    );

    // Chest: the suit's torso, a dark collar, the neck and two shoulder pads
    this.chest.position.set(0, 0.06, 0);
    this.pelvis.add(this.chest);
    part(
      this.chest,
      new PartBuilder()
        .add(
          lathe([
            [0.001, -0.02],
            [0.094, -0.02],
            [0.084, 0.06],
            [0.1, 0.15],
            [0.112, 0.21],
            [0.078, 0.26],
            [0.03, 0.285],
            [0.001, 0.285],
          ], 12),
          "suit",
          [0, 0, 0],
          [0, 0, 0],
          [1, 1, 0.78],
        )
        .add(new THREE.TorusGeometry(0.05, 0.02, 5, 6), "dark", [0, 0.27, 0], [Math.PI / 2, 0, 0], [1, 1, 0.9])
        .add(cyl(0.034, 0.038, 0.07, 6), "skin", [0, 0.3, 0])
        .add(sphere(0.048, 6, 4), "suit", [0.1, 0.22, 0], [0, 0, 0], [1, 0.8, 0.85])
        .add(sphere(0.048, 6, 4), "suit", [-0.1, 0.22, 0], [0, 0, 0], [1, 0.8, 0.85]),
    );

    // Jetpack: one ink block down the whole back, a raised lighter top with two gold rails,
    // and two gunmetal nozzles hanging off the bottom edge whose cores burn under boost.
    // The camera sits right behind it, so it is the dark center the orange wings hang off
    const [px, py, pz] = PACK_AT;
    const [pw, ph, pd] = PACK_SIZE;
    const pack = new PartBuilder()
      .add(new THREE.BoxGeometry(pw, ph, pd), "dark", [px, py, pz])
      .add(new THREE.BoxGeometry(pw * 0.72, ph * 0.86, 0.03), "packLight", [px, py + 0.01, pz + pd / 2 + 0.008])
      .add(new THREE.BoxGeometry(0.012, ph * 0.9, 0.014), "trim", [px - pw * 0.42, py, pz + pd / 2 + 0.004])
      .add(new THREE.BoxGeometry(0.012, ph * 0.9, 0.014), "trim", [px + pw * 0.42, py, pz + pd / 2 + 0.004])
      .add(new THREE.BoxGeometry(pw, 0.016, pd + 0.012), "trim", [px, NOZZLE_TOP + 0.012, pz]);
    const cores = new PartBuilder();
    const nozzleRing = new THREE.TorusGeometry(NOZZLE_RADIUS, 0.008, 3, 8).rotateX(Math.PI / 2);
    for (const s of [1, -1]) {
      const at: Vec = [NOZZLE_X * s, NOZZLE_TOP - NOZZLE_LENGTH / 2, pz];
      pack
        .add(tube(NOZZLE_RADIUS, NOZZLE_LENGTH, 8), "metal", at)
        .add(nozzleRing.clone(), "trim", [at[0], NOZZLE_TOP - NOZZLE_LENGTH + 0.006, at[2]]);
      cores.add(cyl(NOZZLE_RADIUS * 0.75, NOZZLE_RADIUS * 0.75, NOZZLE_LENGTH + 0.006, 8), (_p, t, out) => {
        const k = this.exhaustGlow;
        out.copy(t.metal).lerp(t.accent, k * 0.8).lerp(t.white, k * k * 0.5);
        return 0.1 + k * 0.9;
      }, at);
    }
    nozzleRing.dispose();
    part(this.chest, pack);
    this.exhaustCores = build(this.chest, cores).painted;

    // Head: a round head under a dark helmet shell with a gold rim and one wide visor band.
    // Kept small so the wings stay the biggest thing in the frame
    this.head.position.set(0, 0.32, 0);
    this.chest.add(this.head);
    const helmetAt: Vec = [0, 0.135, 0.015];
    const helmetRot: Vec = [0.2, 0, 0];
    const visorArc = Math.PI * 0.62;
    part(this.head, new PartBuilder()
      .add(sphere(0.14, 8, 6), "skin", [0, 0.13, 0], [0, 0, 0], [1, 0.97, 0.98])
      .add(new THREE.SphereGeometry(0.16, 8, 6, 0, TAU, 0, Math.PI * 0.6), "dark", helmetAt, helmetRot, [1.05, 0.9, 1.08])
      .add(new THREE.TorusGeometry(0.158, 0.01, 4, 10).rotateX(Math.PI / 2).translate(0, -0.045, 0), "trim", helmetAt, helmetRot, [1.05, 1, 1.08])
      .add(tube(0.148, 0.05, 8, Math.PI - visorArc / 2, visorArc), (_p, t, out) => { out.copy(t.visor); return 0.2; }, [0, 0.115, 0]));

    // Arms, legs and wings, mirrored
    const makeSide = (s: 1 | -1): Side => {
      const shoulder = new THREE.Object3D();
      shoulder.position.set(0.125 * s, 0.215, 0);
      this.chest.add(shoulder);
      part(shoulder, new PartBuilder().add(capsule(0.036, 0.13), "suit", [0, -0.1, 0]));
      const elbow = new THREE.Object3D();
      elbow.position.set(0, -0.19, 0);
      shoulder.add(elbow);
      part(
        elbow,
        new PartBuilder()
          .add(capsule(0.03, 0.13), "suit", [0, -0.08, 0])
          .add(sphere(0.034, 6, 4), "skin", [0, -0.19, 0], [0, 0, 0], [0.8, 1.1, 0.5]),
      );
      const hand = new THREE.Object3D();
      hand.position.set(0, -0.215, -0.02);
      elbow.add(hand);

      const hip = new THREE.Object3D();
      hip.position.set(0.062 * s, -0.04, 0);
      this.pelvis.add(hip);
      // The leg: a suit thigh, then an ink boot with a gold cuff; nothing between the legs
      part(hip, new PartBuilder().add(capsule(0.05, 0.2), "suit", [0, -0.14, 0]));
      const knee = new THREE.Object3D();
      knee.position.set(0, -0.29, 0);
      hip.add(knee);
      part(
        knee,
        new PartBuilder()
          .add(capsule(0.042, 0.18), "dark", [0, -0.13, 0])
          .add(new THREE.TorusGeometry(0.046, 0.013, 5, 6), "trim", [0, -0.03, 0], [Math.PI / 2, 0, 0]),
      );
      const ankle = new THREE.Object3D();
      ankle.position.set(0, -0.2, -0.005);
      knee.add(ankle);

      // The wing: a rigid slab hung from the chest (not the arm), so it keeps its shape whatever
      // the arms do; the arms lie along its root. Its pivot sweeps and tilts it (`applyPose`)
      const wing = new THREE.Object3D();
      wing.position.set(WING_ROOT[0] * s, WING_ROOT[1], WING_ROOT[2]);
      this.chest.add(wing);
      part(wing, buildWing(s));

      return { shoulder, elbow, hand, hip, knee, ankle, wing };
    };
    this.right = makeSide(1);
    this.left = makeSide(-1);

    // Item slots: on the back below the pack, the middle of the head, the right palm
    const back = new THREE.Object3D();
    back.position.set(0, -0.12, 0.25);
    this.chest.add(back);
    const crown = new THREE.Object3D();
    crown.position.set(0, 0.15, 0);
    this.head.add(crown);
    // Boots go on both ankles (items/equip.ts mirrors the left one)
    this.feet = [this.right.ankle, this.left.ankle];
    this.slots = { back, head: crown, hand: this.right.hand, feet: this.feet[0] };

    // A soft, diffused halo behind the body, tinted a pale shade of the wings
    this.auraMaterial = new THREE.SpriteMaterial({
      map: glowTexture(),
      blending: THREE.AdditiveBlending,
      transparent: true,
      depthWrite: false,
      fog: true,
    });
    this.aura = new THREE.Sprite(this.auraMaterial);
    this.aura.scale.setScalar(AURA_SCALE);
    this.aura.renderOrder = 3;
    this.group.add(this.aura);

    this.repaint();
    this.applyPose();
  }

  private material<T extends THREE.Material>(material: T): T {
    this.materials.push(material);
    return material;
  }

  /** Writes the one livery onto every part */
  private repaint() {
    for (const painted of this.painted) applyPaint(painted, this.tones);
    this.auraMaterial.color.copy(this.tones.wing).lerp(this.tones.white, 0.45);
  }

  /** The halo's opacity this frame, 0..1 before tuning; ghosts wear a dimmer one that thins out with them */
  private setAuraOpacity(k: number) {
    const value = AURA_OPACITY * k * FX.aura * (1 + ATMOSPHERE.night.value * 1.5) * (this.ghost ? 0.3 * this.ghostFade : 1);
    this.auraMaterial.opacity = value;
    this.aura.visible = value > 0.01;
  }

  /**
   * Legacy from the per-player liveries (Game.setSelf still calls it): the suit's
   * colors are fixed now, so the pilot's color only reaches the name label and the
   * trail/debris effects, never the body.
   */
  readonly setColor: (color: string) => void = () => {};

  /**
   * How brightly the jetpack's exhausts burn, 0..1: gunmetal when idle, the accent
   * going white-hot at full boost. `applyPose` eases it towards the boost input
   * each frame. Repaints the cores only when it changes noticeably.
   */
  setBoostGlow(amount: number) {
    const k = clamp(amount, 0, 1);
    if (Math.abs(k - this.exhaustGlow) < 0.015 && !(k === 0 && this.exhaustGlow !== 0)) return;
    this.exhaustGlow = k;
    applyPaint(this.exhaustCores, this.tones);
  }

  /**
   * The two wing tips in world space, where the wingtip trails stream from (call
   * after update): the middle of each slab's outer edge
   */
  wingtips(left: THREE.Vector3, right: THREE.Vector3) {
    this.wingTip(this.left, -1, left);
    this.wingTip(this.right, 1, right);
  }

  /** The outer edge of one wing (`s` 1 right, -1 left) in world space */
  private wingTip(side: Side, s: 1 | -1, out: THREE.Vector3): THREE.Vector3 {
    out.set(WING_LENGTH * s, -WING_SWEEP, 0);
    return side.wing.localToWorld(out);
  }

  /** The mouth of one exhaust nozzle (`s` 1 right, -1 left) in world space */
  private exhaust(s: 1 | -1, out: THREE.Vector3): THREE.Vector3 {
    // The nozzles point down the spine (chest -y), which is aft once the body lies prone
    out.set(NOZZLE_X * s, NOZZLE_TOP - NOZZLE_LENGTH, PACK_AT[2]);
    return this.chest.localToWorld(out);
  }

  /**
   * Contact points along both wings in the pilot's own frame (the group's), left
   * then right, five each: the wing tip, the wing's root at the trailing edge, the
   * hand, the elbow and the shoulder. The crash tumble keeps them out of the rock
   * (call after update)
   */
  wingPoints(out: THREE.Vector3[]) {
    this.body.updateWorldMatrix(true, true);
    this.sidePoints(this.left, -1, out, 0);
    this.sidePoints(this.right, 1, out, WING_POINTS);
  }

  private sidePoints(side: Side, s: 1 | -1, out: THREE.Vector3[], k: number) {
    const g = this.group;
    g.worldToLocal(this.wingTip(side, s, out[k]));
    g.worldToLocal(side.wing.localToWorld(out[k + 1].set(0.04 * s, -WING_ROOT_CHORD / 2, 0)));
    g.worldToLocal(side.hand.getWorldPosition(out[k + 2]));
    g.worldToLocal(side.elbow.getWorldPosition(out[k + 3]));
    g.worldToLocal(side.shoulder.getWorldPosition(out[k + 4]));
  }

  /**
   * The point between the two exhausts in world space, where the body trail
   * streams from (call after update), so the wide ribbon leaves the propulsion
   */
  capeTip(out: THREE.Vector3): THREE.Vector3 {
    this.exhaust(-1, leftTmp);
    this.exhaust(1, out);
    return out.lerp(leftTmp, 0.5);
  }

  /** The direction the wings span, in world space: trails use it as their width */
  span(out: THREE.Vector3): THREE.Vector3 {
    return out.setFromMatrixColumn(this.rig.matrixWorld, 1).normalize();
  }

  /** The roll is visual; flight physics supplies its timing and displacement. */
  setDodge(phase: number) {
    this.barrel.t = phase === 0 ? -1 : Math.min(1, Math.abs(phase));
    this.barrel.dir = phase < 0 ? -1 : 1;
    this.barrelProgress = this.barrel.t;
  }

  /**
   * Animates the pilot. Call after placing `group` for this frame. `distance`
   * is how far the camera is: far-away pilots keep whatever exhaust glow they
   * have instead of repainting the cores (the one per-frame buffer upload left).
   */
  update(dt: number, speed: number, proximity: number, distance = 0) {
    if (dt <= 0) return;
    this.time += dt;
    this.speed = speed;
    if (this.death) {
      this.death.t += dt;
      this.applyDeathPose(dt);
      return;
    }

    // Turn rates in the pilot's own frame, from how the rotation changed since last frame
    if (this.hasLast) {
      dq.multiplyQuaternions(prevInverse.copy(this.lastQuaternion).invert(), this.group.quaternion);
      if (dq.w < 0) dq.set(-dq.x, -dq.y, -dq.z, -dq.w);
      const angle = 2 * Math.acos(clamp(dq.w, -1, 1));
      const s = Math.sqrt(Math.max(1e-9, 1 - dq.w * dq.w));
      localOmega.set(dq.x / s, dq.y / s, dq.z / s).multiplyScalar(angle / dt);
      if (angle < 1e-6) localOmega.set(0, 0, 0);
      const k = 1 - Math.exp(-dt * 10);
      this.pitchRate += (clamp(localOmega.x, -6, 6) - this.pitchRate) * k;
      this.yawRate += (clamp(-localOmega.y, -6, 6) - this.yawRate) * k;
      this.rollRate += (clamp(-localOmega.z, -8, 8) - this.rollRate) * k;
    }
    this.lastQuaternion.copy(this.group.quaternion);
    this.hasLast = true;
    forwardTmp.set(0, 0, -1).applyQuaternion(this.group.quaternion);
    this.climb += (forwardTmp.y - this.climb) * (1 - Math.exp(-dt * 4));

    // Bank lead: the body rolls a little ahead of the turn and settles with a spring
    const target = clamp(this.rollRate * ANIM.bankLead + this.yawRate * 0.35, -1.1, 1.1);
    [this.lean, this.leanVelocity] = springStep(this.lean, this.leanVelocity, target, ANIM.bankSpring, ANIM.bankDamping, dt);

    // The exhausts spool up and down with the boost input
    this.thrust += (this.boost - this.thrust) * (1 - Math.exp(-dt * 6));

    this.applyPose(proximity, distance > 110);
  }

  private applyPose(proximity = 0, far = false) {
    const t = this.time;
    const A = ANIM;
    const speedK = smoothstep(25, 95, this.speed);
    const turn = clamp(this.yawRate, -1.5, 1.5);

    // Rig: physics-timed barrel roll, gentle bobbing, squash and stretch
    let roll = 0; // steering bank is already in group; never visually exceed its limit
    if (this.barrel.t >= 0) {
      const p = smoother(clamp(this.barrel.t, 0, 1));
      const angle = p * TAU * this.barrel.dir;
      roll -= angle;
    }
    const calm = 1 - speedK * 0.65;
    const bob = Math.sin(t * TAU * A.bobRate) * A.bobAmount * calm;
    this.rig.position.set(Math.sin(t * TAU * A.bobRate * 0.5) * A.bobAmount * 0.4 * calm, bob, 0);
    this.rig.rotation.set(
      Math.cos(t * TAU * A.bobRate) * 0.04 * calm - this.pitchRate * 0.05,
      0,
      roll,
    );
    const stretch = 1 + clamp((this.speed - 55) / 60, 0, 1) * 0.06;
    this.rig.scale.set(SCALE / Math.sqrt(stretch), SCALE / Math.sqrt(stretch), SCALE * stretch);

    // Body: a superhero arch, more when climbing; the head looks ahead and into turns
    this.chest.rotation.set(this.brake * 0.18 - this.boost * 0.08 + 0.1 + clamp(this.climb, 0, 1) * 0.12 + this.pitchRate * 0.05, -turn * 0.08 * A.limbSwing, 0);
    this.head.rotation.set(0.85 - this.pitchRate * 0.08, -turn * 0.35 * A.headLook, turn * 0.25 * A.headLook);
    this.pelvis.rotation.set(0, turn * 0.06 * A.limbSwing, -this.lean * 0.15);

    // Arms: spread wide to brake, tucked to the body at speed and under boost
    const barrelTuck = this.barrel.t >= 0 ? Math.sin(Math.PI * this.barrel.t) : 0;
    const glide = clamp(A.armSpread - speedK * A.tuckSpeed - barrelTuck * 0.45 + this.brake * A.spreadBrake - this.boost * A.tuckBoost, 0.3, 1.6);
    const tucked = 1 - glide / 1.6;
    // Wings: swept back as the arms tuck (speed, boost, mid-roll), forward as they spread to
    // brake; tilted into the bank ahead of the body; pitched nose-up a little under brake
    const sweep = (A.armSpread - glide) * A.wingSweep;
    const flex = Math.sin(t * 1.7) * 0.012 * calm;
    const pitch = this.brake * 0.2 - this.boost * 0.05 + this.pitchRate * 0.03;
    for (const [side, s] of [
      [this.right, 1],
      [this.left, -1],
    ] as [Side, 1 | -1][]) {
      // Arms sit a little above the body plane, flatter under boost, and lead into turns
      const armLift = 0.22 - this.boost * 0.1 + turn * 0.25 * s * A.limbSwing;
      side.shoulder.rotation.set(0, -armLift * s, glide * s);
      side.elbow.rotation.set(0, 0, (0.25 + tucked * 0.2) * s);

      // Legs together at speed, a little apart to brake; knees soft, toes pointed; they swing like a rudder in turns
      const kick = Math.sin(t * 2.4 + (s > 0 ? 0 : 1.6)) * 0.06 * calm;
      side.hip.rotation.set(0.06 + kick, 0, (0.05 + this.brake * 0.25 - this.boost * 0.03) * s - turn * 0.12 * A.limbSwing);
      side.knee.rotation.set(-this.brake * 0.3 - 0.32 - clamp(this.climb, 0, 1) * 0.35 - kick * 1.4 - barrelTuck * 0.4, 0, 0);

      side.wing.rotation.set(pitch, -s * A.wingDihedral + this.lean * A.wingBank + flex, -sweep * s);
      side.wing.scale.setScalar(1);
    }

    // Item animations take over the right arm
    const arm = this.armPose;
    if (arm.amount > 0) {
      const k = clamp(arm.amount, 0, 1);
      const sh = this.right.shoulder.rotation;
      sh.set(sh.x + (arm.x - sh.x) * k, sh.y + (arm.y - sh.y) * k, sh.z + (arm.z - sh.z) * k);
      const el = this.right.elbow.rotation;
      el.z += (arm.elbow - el.z) * k;
    }

    // The exhausts glow with the boost (not worth a repaint on a pilot far away)
    if (!far) this.setBoostGlow(this.thrust);

    // Aura: a faint halo when cruising, a touch brighter with speed and skimming the ground...
    this.setAuraOpacity(0.4 + speedK * 0.6 + proximity * 0.3);
    // ...with a gentle living pulse in its size
    this.aura.scale.setScalar(AURA_SCALE * (1 + 0.03 * Math.sin(t * 1.5)));
  }

  /** Starts the crash animation of this kind; `side` is the arm that hit (1 right, -1 left) */
  die(kind: DeathKind, side: 1 | -1) {
    this.death = { kind, t: 0, side };
    this.barrel.t = -1;
    this.barrelProgress = -1;
    this.fold[0] = this.fold[1] = 0;
  }

  /**
   * Folds a wing further the deeper the rock has it (Game.ts passes how far each
   * wing is wedged, in metres, during a crash): it crumples up over the back
   */
  foldWings(left: number, right: number, dt: number) {
    const k = 1 - Math.exp(-dt * 8);
    this.fold[0] += (clamp(left * 3, 0, 1) - this.fold[0]) * k;
    this.fold[1] += (clamp(right * 3, 0, 1) - this.fold[1]) * k;
  }

  /** Back to flying (on respawn) */
  revive() {
    this.death = null;
    this.hasLast = false;
    this.lean = this.leanVelocity = 0;
    this.pitchRate = this.yawRate = this.rollRate = 0;
    this.fold[0] = this.fold[1] = 0;
  }

  get dying(): boolean {
    return this.death !== null;
  }

  /**
   * The crash pose: limbs windmill in panic, then flop as the pilot goes limp;
   * the wings sweep hard back and crumple up over the back (the jetpack stays put);
   * a headfirst hit squashes the body for a moment. At the end the pilot shrinks
   * into light.
   */
  private applyDeathPose(dt: number) {
    const d = this.death!;
    const t = d.t;
    const panic = Math.exp(-t * 1.5);
    const wave = (rate: number, phase: number) => Math.sin(t * rate + phase);
    const spinning = d.kind === "wing";
    const curl = d.kind === "headfirst" ? 0.7 : d.kind === "slide" ? 0.5 : d.kind === "fall" ? 0.3 : -0.1;

    // Squash on impact, then shrink away into light at the end
    const hit = d.kind === "headfirst" ? Math.sin(Math.PI * clamp(t / 0.22, 0, 1)) * 0.28 : d.kind === "slide" ? Math.sin(Math.PI * clamp(t / 0.18, 0, 1)) * 0.14 : 0;
    const vanish = 1 - smoothstep(DISSOLVE_AT, DISSOLVE_AT + 0.22, t);
    const size = SCALE * Math.max(0.001, vanish);
    this.rig.position.set(0, 0, 0);
    this.rig.rotation.set(0, 0, 0);
    this.rig.scale.set(size * (1 + hit * 0.5), size * (1 - hit), size * (1 + hit * 0.5));

    this.chest.rotation.set(0.1 + curl * 0.45 + wave(9, 0) * 0.18 * panic, wave(7, 1) * 0.25 * panic, wave(5, 2) * 0.18 * panic);
    this.head.rotation.set(0.55 + wave(11, 0.5) * 0.4 * panic + (1 - panic) * 0.35, wave(8, 2) * 0.45 * panic, wave(6, 1) * 0.3);
    this.pelvis.rotation.set(curl * 0.35, 0, wave(6, 0) * 0.12 * panic);

    const crumple = 1 - panic;
    for (const [side, s] of [
      [this.right, 1],
      [this.left, -1],
    ] as [Side, 1 | -1][]) {
      // Arms windmill, or stretch out while spinning (the one that hit bent back); legs kick, then fold
      const broken = spinning && s === d.side;
      const reach = spinning ? (broken ? 1.0 : 1.5) : 1.15;
      side.shoulder.rotation.set(wave(13 + s, s) * 1.3 * panic + (broken ? 0.6 : 0), wave(10, s * 2) * 0.6 * panic, (reach + wave(12, s) * 0.6 * panic) * s);
      side.elbow.rotation.set(0, 0, (0.55 + 0.45 * wave(9, s) + (broken ? 0.5 : 0)) * s);
      side.hip.rotation.set(-curl * 0.8 + wave(11, s * 1.7) * 0.55 * panic, 0, (0.15 + 0.2 * (1 - panic)) * s);
      side.knee.rotation.set(-0.6 - curl * 0.8 - Math.abs(wave(10, s)) * 0.45 * panic, 0, 0);

      // The wings whip, then crumple: swept back, folded up over the back, and shortened
      // where the rock has them (the one that hit first folds hardest)
      const fold = this.fold[s > 0 ? 1 : 0] + (broken ? 0.4 : 0);
      side.wing.rotation.set(
        wave(7, s) * 0.3 * panic,
        -s * (0.4 + 0.9 * crumple + fold * 0.8) + wave(9, s * 2) * 0.35 * panic,
        -s * (0.8 + 0.5 * crumple + fold * 0.3 + wave(6, s) * 0.3 * panic),
      );
      side.wing.scale.set(1 - 0.3 * crumple - fold * 0.25, 1, 1);
    }

    // The exhausts wind down
    this.thrust *= Math.exp(-dt * 4);
    this.setBoostGlow(this.thrust);

    // The aura fades out with the dissolve
    this.setAuraOpacity(0.6 * vanish);
    this.aura.scale.setScalar(AURA_SCALE);
  }

  /** A ghost's opacity, 0..1; solid pilots ignore it */
  fade(opacity: number) {
    if (!this.ghost) return;
    for (const material of this.materials) material.opacity = opacity;
    // The halo follows (ghosts wear 0.3 of it, see `setAuraOpacity`); the next pose applies it
    this.ghostFade = opacity;
    this.auraMaterial.opacity *= opacity;
  }

  /** Hides the pilot (e.g. after a crash) */
  set visible(visible: boolean) {
    this.group.visible = visible;
  }

  get visible(): boolean {
    return this.group.visible;
  }

  dispose() {
    this.painted.forEach((p) => p.geometry.dispose());
    this.materials.forEach((m) => m.dispose());
    this.auraMaterial.dispose();
  }
}

// --- aura halo ------------------------------------------------------------------------

/** Base alpha of the halo at full strength: faint on purpose, just enough to lift the silhouette off the scenery */
const AURA_OPACITY = 0.18;
/** Side of the halo sprite (m): a little larger than the body so it reads as a soft glow, not an outline */
const AURA_SCALE = 2.0;

let glow: THREE.Texture | null = null;

/** A soft round glow for item sprites (items/equip.ts) */
export function glowTexture(): THREE.Texture {
  if (!glow) {
    const size = 64;
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = size;
    const ctx = canvas.getContext("2d")!;
    const gradient = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    gradient.addColorStop(0, "rgba(255,255,255,1)");
    gradient.addColorStop(0.25, "rgba(255,255,255,0.55)");
    gradient.addColorStop(0.6, "rgba(255,255,255,0.12)");
    gradient.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, size, size);
    glow = new THREE.CanvasTexture(canvas);
    glow.colorSpace = THREE.SRGBColorSpace;
  }
  return glow;
}

/** A name tag that keeps the same size on screen */
export function createLabel(text: string, color: string): THREE.Sprite {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 64;
  const ctx = canvas.getContext("2d")!;
  ctx.font = "600 30px system-ui, sans-serif";
  const width = Math.min(240, ctx.measureText(text).width + 28);
  ctx.fillStyle = "rgba(10, 12, 20, 0.6)";
  ctx.beginPath();
  ctx.roundRect((256 - width) / 2, 8, width, 48, 24);
  ctx.fill();
  ctx.fillStyle = color;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, 128, 33, 220);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(
    new THREE.SpriteMaterial({ map: texture, sizeAttenuation: false, fog: false, depthWrite: false }),
  );
  sprite.scale.set(0.16, 0.04, 1);
  sprite.renderOrder = 10;
  return sprite;
}

export function disposeLabel(label: THREE.Sprite) {
  label.material.map?.dispose();
  label.material.dispose();
}
