import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { flatMaterial } from "./toon";
import { ATMOSPHERE } from "./world/atmosphere";
import { ANIM, FX } from "./tuning";
import { clamp, smoothstep } from "./math";
import { DISSOLVE_AT, type DeathKind, WING_POINTS } from "./death";
import type { ItemSlot } from "./items/models";
import { capeSpec, wingSpec, type WingId } from "./cosmetics/catalog";
import type { Appearance } from "./cosmetics/storage";
import { buildHat, buildShoe, disposeModel } from "./cosmetics/models";

// The pilot: a small low-poly wingsuit flyer with chibi proportions (a big
// helmeted head, slim limbs) in a high-tech flight suit. Fabric membranes
// stretch between each arm and the torso and between the legs, and two small
// electric ducted fans on the upper back light up under boost. A scarf
// streams behind. Everything is built from primitives at runtime.
//
// The body is modelled standing (up +y, facing -z, right +x) and then laid
// prone, so the head points along the flight direction (-z) and the back faces
// up. The caller places `group` at the flight model's position and rotation;
// everything the animation adds (rolls, bobbing, the arm spread) happens inside it.

const SCALE = 1.55;
const TAU = Math.PI * 2;

// --- colors ----------------------------------------------------------------------

interface Tones {
  skin: THREE.Color;
  blush: THREE.Color;
  cloth: THREE.Color;
  clothLight: THREE.Color;
  clothDark: THREE.Color;
  trim: THREE.Color;
  dark: THREE.Color;
  white: THREE.Color;
  /** The suit's electric accent: membrane edges, the helmet fin, the fan cores under boost */
  accent: THREE.Color;
  /** Tinted visor glass and its glint */
  visor: THREE.Color;
  visorShine: THREE.Color;
  /** Gunmetal for the fan shells */
  metal: THREE.Color;
}

type ToneName = keyof Tones;
/**
 * A flat tone, or a function of the vertex position (in the part's space) and its
 * index. A function may return a glow (0..1) for the vertices it paints; otherwise
 * the glow follows how close the color is to the gold trim or the accent.
 */
type Paint = ToneName | ((p: THREE.Vector3, tones: Tones, out: THREE.Color, index: number) => number | void);

function tonesFor(color: string): Tones {
  const cloth = new THREE.Color(color);
  const white = new THREE.Color("#fbf6ec");
  const hsl = { h: 0, s: 0, l: 0 };
  cloth.getHSL(hsl);
  return {
    skin: new THREE.Color("#ffe1cf"),
    blush: new THREE.Color("#ffa9a4"),
    cloth,
    clothLight: cloth.clone().lerp(white, 0.55),
    clothDark: new THREE.Color().setHSL(hsl.h, Math.min(1, hsl.s * 0.9), hsl.l * 0.5),
    trim: new THREE.Color("#f3c869"),
    dark: new THREE.Color("#3a3245"),
    white,
    accent: new THREE.Color().setHSL((hsl.h + 0.08) % 1, 0.9, 0.72),
    visor: new THREE.Color("#1c2233").lerp(cloth, 0.12),
    visorShine: new THREE.Color("#e4edff"),
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
 * Writes vertex colors, and a glow for the gold trims and the accent edges (they light up at night).
 *
 * Non-indexed geometry (the body parts, three vertices per triangle) is painted once per
 * face at the triangle's centroid, and all three corners get that color, so the parts
 * read as flat facets like the terrain instead of smooth gradients. Indexed geometry
 * (the cloth grids share vertices between faces) keeps per-vertex paint.
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

// --- cloth -------------------------------------------------------------------------

type ClothShape = (u: number, v: number, out: THREE.Vector3) => void;
type ClothPaint = (u: number, v: number, tones: Tones, out: THREE.Color) => number | void;

/** A grid of vertices moved procedurally every frame: the membranes and the scarf tails */
class Cloth {
  readonly mesh: THREE.Mesh;
  readonly painted: Painted;
  private readonly cols: number;
  private readonly rows: number;
  private readonly point = new THREE.Vector3();

  constructor(cols: number, rows: number, paint: ClothPaint, material: THREE.Material) {
    this.cols = cols;
    this.rows = rows;
    const geometry = new THREE.PlaneGeometry(1, 1, cols, rows);
    geometry.deleteAttribute("uv");
    // Keep (u, v) per vertex so the paint can use them
    const uv = new Float32Array((cols + 1) * (rows + 1) * 3);
    for (let r = 0; r <= rows; r++) {
      for (let c = 0; c <= cols; c++) uv.set([(c / cols) * 2 - 1, r / rows, 0], (r * (cols + 1) + c) * 3);
    }
    const uvAttribute = new THREE.BufferAttribute(uv, 3);
    geometry.setAttribute("color", new THREE.Float32BufferAttribute(new Float32Array(uv.length), 3));
    geometry.setAttribute("glow", new THREE.Float32BufferAttribute(new Float32Array(uv.length / 3), 1));
    (geometry.getAttribute("position") as THREE.BufferAttribute).setUsage(THREE.DynamicDrawUsage);
    this.painted = {
      geometry,
      ranges: [
        {
          start: 0,
          count: uv.length / 3,
          // The positions move, so paint from each vertex's (u, v)
          paint: (_p, tones, out, i) => paint(uvAttribute.getX(i), uvAttribute.getY(i), tones, out),
        },
      ],
    };
    this.mesh = new THREE.Mesh(geometry, material);
    this.mesh.frustumCulled = false;
  }

  update(shape: ClothShape) {
    const position = this.mesh.geometry.getAttribute("position") as THREE.BufferAttribute;
    for (let r = 0; r <= this.rows; r++) {
      for (let c = 0; c <= this.cols; c++) {
        shape((c / this.cols) * 2 - 1, r / this.rows, this.point);
        this.point.toArray(position.array, (r * (this.cols + 1) + c) * 3);
      }
    }
    position.needsUpdate = true;
    this.mesh.geometry.computeVertexNormals();
  }

  /** The middle of the hem, in the cloth's space */
  tip(shape: ClothShape, out: THREE.Vector3): THREE.Vector3 {
    shape(0, 1, out);
    return out;
  }
}

/** A point `t` (0..1, by length) along the two-segment limb a → b → c */
function alongLimb(a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, t: number, out: THREE.Vector3): THREE.Vector3 {
  const ab = a.distanceTo(b), bc = b.distanceTo(c), total = ab + bc;
  if (total < 1e-6) return out.copy(a);
  const split = ab / total;
  if (split > 1 - 1e-6) return out.lerpVectors(a, b, t);
  if (t < split) return out.lerpVectors(a, b, split > 1e-6 ? t / split : 0);
  return out.lerpVectors(b, c, (t - split) / (1 - split));
}

// --- the avatar --------------------------------------------------------------------

export interface AvatarOptions {
  ghost?: boolean;
}

/** Joints of the arm and its membrane's anchors on the torso, in chest space this frame */
interface ArmJoints {
  shoulder: THREE.Vector3;
  elbow: THREE.Vector3;
  hand: THREE.Vector3;
  /** Where the membrane's root meets the torso, under the arm */
  root: THREE.Vector3;
  /** The membrane's trailing corner on the torso side, at the hip */
  hip: THREE.Vector3;
}

/** Joints of the leg, in chest space this frame; the ankle reaches a little past the foot */
interface LegJoints {
  hip: THREE.Vector3;
  knee: THREE.Vector3;
  ankle: THREE.Vector3;
}

interface Side {
  boot: THREE.Mesh;
  shoulder: THREE.Object3D;
  elbow: THREE.Object3D;
  /** The palm: the trails stream from here */
  hand: THREE.Object3D;
  hip: THREE.Object3D;
  knee: THREE.Object3D;
  /** The ankle, where boots go */
  ankle: THREE.Object3D;
  /** The fabric between the arm and the torso */
  membrane: Cloth;
  arm: ArmJoints;
  leg: LegJoints;
  shape: ClothShape;
}

const localOmega = new THREE.Vector3();
const dq = new THREE.Quaternion();
const prevInverse = new THREE.Quaternion();
const forwardTmp = new THREE.Vector3();
const jointTmp = new THREE.Vector3();
const shapeTmp = new THREE.Vector3();
const leftTmp = new THREE.Vector3();
const rightTmp = new THREE.Vector3();

function springStep(value: number, velocity: number, target: number, stiffness: number, damping: number, dt: number) {
  const c = 2 * damping * Math.sqrt(stiffness);
  const a = stiffness * (target - value) - c * velocity;
  const v = velocity + a * dt;
  return [value + v * dt, v];
}

const smoother = (t: number) => t * t * t * (t * (t * 6 - 15) + 10);

const vec = () => new THREE.Vector3();

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
  /** The fabric between the legs, a tail fin */
  private readonly fin: Cloth;
  private finShape: ClothShape = () => {};
  private hat: THREE.Group | null = null;
  private shoes: THREE.Group[] = [];
  private appearance: Appearance = { cape: "classic", hat: "none", shoes: "classic", wings: "classic", pet: "none" };
  /** The arm membranes' style (the `wings` wardrobe slot); pilotfx tints its wingtip particles from it */
  get wingStyle(): WingId { return this.appearance.wings; }
  private readonly scarf: Cloth[];
  // Conservative bounds of the animated legs, reused for cloth self-collision.
  private readonly clothObstacles: { mesh: THREE.Mesh; local: THREE.Box3; bounds: THREE.Box3 }[] = [];
  private readonly clothInverse = new THREE.Matrix4();
  private readonly clothMatrix = new THREE.Matrix4();
  private readonly painted: Painted[] = [];
  private readonly materials: THREE.Material[] = [];
  /** The ducted fans' cores: repainted as the boost glow changes */
  private readonly fanCores: Painted;
  /** The fan cores' current glow, 0..1 (see `setBoostGlow`) */
  private fanGlow = 0;
  /** The glow eased towards the boost input */
  private fanLevel = 0;
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
    this.fanLevel = 0;
  }
  private climb = 0;
  private time = 0;
  private clothTime = 0;
  /** The membranes' ripple amplitude this frame (metres) */
  private flutter = 0;
  private detailed = true;
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

  constructor(color: string, options: AvatarOptions = {}) {
    this.ghost = !!options.ghost;
    this.tones = tonesFor(color);
    const ghost = this.ghost;
    const skinMat = this.material(flatMaterial({ ghost }));
    const clothMat = this.material(flatMaterial({ ghost, side: THREE.DoubleSide }));

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
    const clothObstacle = (mesh: THREE.Mesh) => {
      mesh.geometry.computeBoundingBox();
      this.clothObstacles.push({ mesh, local: mesh.geometry.boundingBox!.clone(), bounds: new THREE.Box3() });
      return mesh;
    };

    // Pelvis: the suit's hip panel with a gold waist band, belt and buckle
    this.pelvis.position.set(0, 0.74, 0);
    skeleton.add(this.pelvis);
    part(
      this.pelvis,
      new PartBuilder()
        .add(
          lathe([
            [0.001, 0.07],
            [0.095, 0.07],
            [0.108, -0.02],
            [0.118, -0.1],
            [0.12, -0.12],
            [0.001, -0.12],
          ]),
          (p, t, out) => { out.copy(p.y < -0.085 ? t.trim : t.clothDark); },
          [0, 0, 0],
          [0, 0, 0],
          [1, 1, 0.8],
        )
        .add(cyl(0.1, 0.1, 0.035, 6), "dark", [0, 0.06, 0], [0, 0, 0], [1, 1, 0.8])
        .add(new THREE.OctahedronGeometry(0.026, 0), "trim", [0, 0.06, -0.082]),
    );

    // Chest: the flight suit's torso, a lit seam down the front, dark side panels, collar, neck, sleek shoulder pads
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
          (p, t, out) => {
            if (p.z < -0.03 && Math.abs(p.x) < 0.03 && p.y < 0.24) { out.copy(t.accent).lerp(t.cloth, 0.25); return 0.25; }
            if (Math.abs(p.x) > 0.06 && p.y > 0.03 && p.y < 0.2) { out.copy(t.clothDark); return; }
            out.copy(t.cloth);
          },
          [0, 0, 0],
          [0, 0, 0],
          [1, 1, 0.78],
        )
        .add(new THREE.TorusGeometry(0.05, 0.02, 5, 6), "clothDark", [0, 0.27, 0], [Math.PI / 2, 0, 0], [1, 1, 0.9])
        .add(cyl(0.034, 0.038, 0.07, 6), "skin", [0, 0.3, 0])
        .add(sphere(0.048, 6, 4), "clothDark", [0.1, 0.22, 0], [0, 0, 0], [1, 0.8, 0.85])
        .add(sphere(0.048, 6, 4), "clothDark", [-0.1, 0.22, 0], [0, 0, 0], [1, 0.8, 0.85]),
    );

    // Ducted fans on the upper back: gunmetal shells with gold rims on a power pack, their cores lit by boost
    const fans = new PartBuilder()
      .add(new THREE.BoxGeometry(0.19, 0.07, 0.035), "dark", [0, 0.12, 0.08])
      .add(new THREE.BoxGeometry(0.03, 0.012, 0.012), "accent", [0, 0.12, 0.1]);
    const cores = new PartBuilder();
    for (const s of [1, -1]) {
      const at: Vec = [0.07 * s, 0.12, 0.115];
      fans
        .add(tube(0.038, 0.075, 6), "metal", at)
        .add(new THREE.TorusGeometry(0.038, 0.008, 4, 6), "trim", [at[0], at[1] + 0.0375, at[2]], [Math.PI / 2, 0, 0])
        .add(new THREE.TorusGeometry(0.038, 0.008, 4, 6), "trim", [at[0], at[1] - 0.0375, at[2]], [Math.PI / 2, 0, 0]);
      cores.add(cyl(0.03, 0.03, 0.082, 6), (_p, t, out) => {
        const k = this.fanGlow;
        out.copy(t.dark).lerp(t.accent, k * 0.7).lerp(t.white, k * k * 0.5);
        return 0.1 + k * 0.9;
      }, at);
    }
    part(this.chest, fans);
    this.fanCores = build(this.chest, cores).painted;

    // Head: big and round, a soft jaw and cheeks under it, and the face drawn on in layers
    this.head.position.set(0, 0.32, 0);
    this.chest.add(this.head);
    const lip: Paint = (_p, t, out) => { out.copy(t.blush).lerp(t.dark, 0.35); };
    const nose: Paint = (_p, t, out) => { out.copy(t.skin).lerp(t.blush, 0.3); };
    part(this.head, new PartBuilder()
      .add(sphere(0.165, 8, 6), "skin", [0, 0.15, 0], [0, 0, 0], [1, 0.97, 0.98])
      // Cheeks and a small rounded chin give the face its front, so it takes light like a sculpted shape
      .add(sphere(0.13, 8, 6), "skin", [0, 0.09, -0.04], [0, 0, 0], [1.04, 0.84, 0.95])
      .add(sphere(0.045, 6, 4), "skin", [0.075, 0.085, -0.115], [0, 0, 0], [1, 0.85, 0.7])
      .add(sphere(0.045, 6, 4), "skin", [-0.075, 0.085, -0.115], [0, 0, 0], [1, 0.85, 0.7]));
    // Small features under the visor
    part(this.head, new PartBuilder()
      .add(sphere(0.013, 6, 4), nose, [0, 0.09, -0.166], [0, 0, 0], [0.85, 0.8, 1.25])
      .add(new THREE.TorusGeometry(0.017, 0.004, 4, 6, Math.PI * 0.75), lip, [0, 0.062, -0.158], [0.35, 0, Math.PI * 1.125])
      .add(sphere(0.02, 6, 4), "blush", [0.08, 0.088, -0.143], [0, 0.5, 0], [1.2, 0.6, 0.3])
      .add(sphere(0.02, 6, 4), "blush", [-0.08, 0.088, -0.143], [0, -0.5, 0], [1.2, 0.6, 0.3]), skinMat);

    // Helmet: a shell tilted back off the brow with a gold rim, a dorsal fin, ear pods and a chin strap
    const helmetTilt = 0.25;
    part(this.head, new PartBuilder()
      .add(new THREE.SphereGeometry(0.19, 8, 6, 0, TAU, 0, Math.PI * 0.55), "cloth", [0, 0.15, 0.005], [helmetTilt, 0, 0])
      .add(new THREE.TorusGeometry(0.188, 0.009, 4, 10), "trim", [0, 0.15 - 0.03 * Math.cos(helmetTilt), 0.005 - 0.03 * Math.sin(helmetTilt)], [Math.PI / 2 + helmetTilt, 0, 0])
      .add(new THREE.BoxGeometry(0.016, 0.075, 0.15), (_p, t, out) => { out.copy(t.accent); return 0.3; }, [0, 0.355, 0.045], [0.3, 0, 0])
      .add(sphere(0.03, 6, 4), "dark", [0.165, 0.14, -0.01], [0, 0, 0], [0.6, 1, 1])
      .add(sphere(0.03, 6, 4), "dark", [-0.165, 0.14, -0.01], [0, 0, 0], [0.6, 1, 1])
      .add(new THREE.TorusGeometry(0.16, 0.011, 4, 8, Math.PI), "dark", [0, 0.135, -0.03], [0, 0, Math.PI], [1.1, 1, 1]));

    // Visor: one wide tinted band wrapped around the face, a gold brow frame and a glint
    const visorArc = Math.PI * 0.62;
    part(this.head, new PartBuilder()
      .add(tube(0.17, 0.058, 8, Math.PI - visorArc / 2, visorArc), (_p, t, out) => { out.copy(t.visor); return 0.2; }, [0, 0.13, 0])
      .add(tube(0.173, 0.012, 8, Math.PI - visorArc / 2, visorArc), "trim", [0, 0.164, 0])
      .add(sphere(0.012, 6, 4), "visorShine", [0.055, 0.147, -0.163], [0, -0.33, 0], [2, 0.5, 0.4]));

    // Arms and legs, mirrored
    const makeSide = (s: 1 | -1): Side => {
      const shoulder = new THREE.Object3D();
      shoulder.position.set(0.125 * s, 0.215, 0);
      this.chest.add(shoulder);
      part(
        shoulder,
        new PartBuilder()
          .add(sphere(0.05, 6, 4), "clothDark", [0, -0.02, 0])
          .add(capsule(0.036, 0.13), "cloth", [0, -0.1, 0])
          .add(new THREE.TorusGeometry(0.037, 0.01, 5, 6), "dark", [0, -0.17, 0], [Math.PI / 2, 0, 0]),
      );
      const elbow = new THREE.Object3D();
      elbow.position.set(0, -0.19, 0);
      shoulder.add(elbow);
      part(
        elbow,
        new PartBuilder()
          .add(capsule(0.03, 0.13), "clothDark", [0, -0.08, 0])
          .add(cyl(0.036, 0.033, 0.05, 6), "trim", [0, -0.12, 0])
          .add(sphere(0.036, 6, 4), "skin", [0, -0.19, 0], [0, 0, 0], [0.75, 1.15, 0.45]),
      );
      const hand = new THREE.Object3D();
      hand.position.set(0, -0.215, -0.02);
      elbow.add(hand);

      const hip = new THREE.Object3D();
      hip.position.set(0.062 * s, -0.04, 0);
      this.pelvis.add(hip);
      clothObstacle(part(hip, new PartBuilder().add(capsule(0.05, 0.2), "cloth", [0, -0.14, 0])));
      const knee = new THREE.Object3D();
      knee.position.set(0, -0.29, 0);
      hip.add(knee);
      const boot = clothObstacle(part(
        knee,
        new PartBuilder()
          .add(capsule(0.042, 0.18), "dark", [0, -0.13, 0])
          .add(new THREE.TorusGeometry(0.046, 0.013, 5, 6), "trim", [0, -0.03, 0], [Math.PI / 2, 0, 0])
          // Pointed toes, like a dancer's
          .add(capsule(0.034, 0.08), "dark", [0, -0.3, -0.012], [0.25, 0, 0]),
      ));
      const ankle = new THREE.Object3D();
      ankle.position.set(0, -0.2, -0.005);
      knee.add(ankle);

      // The arm membrane: u runs along the arm (shoulder -1 → hand +1), v from the arm (0) to the torso (1).
      // Its shape is read from the joints every frame (`updateCloth`), so it stretches as the arms spread
      const membrane = new Cloth(6, 4, (u, v, t, out) => {
        const a = (u + 1) / 2;
        if (v < 0.01) { out.copy(t.accent).lerp(t.cloth, 0.25); return 0.3; }
        if (a > 0.99) { out.copy(t.accent).lerp(t.cloth, 0.45); return 0.15; }
        if (Math.abs(v - 0.5) < 0.01) { out.copy(t.clothDark); return 0; }
        out.copy(t.cloth).lerp(t.clothDark, v * 0.35);
      }, clothMat);
      this.painted.push(membrane.painted);
      this.chest.add(membrane.mesh);
      const arm: ArmJoints = { shoulder: vec(), elbow: vec(), hand: vec(), root: vec(), hip: vec() };
      const leg: LegJoints = { hip: vec(), knee: vec(), ankle: vec() };
      const shape: ClothShape = (u, v, out) => {
        const a = (u + 1) / 2;
        alongLimb(arm.shoulder, arm.elbow, arm.hand, a, out);
        shapeTmp.lerpVectors(arm.root, arm.hip, a);
        out.lerp(shapeTmp, v);
        // A soft bow between arm and body, and a ripple that fades out at the attached edges
        const slack = Math.sin(Math.PI * v);
        out.z += slack * (0.012 * a + this.flutter * (0.35 + 0.65 * a) * Math.sin(this.time * ANIM.flutterRate + u * 3 + s * 0.8));
      };

      return { shoulder, elbow, hand, hip, knee, ankle, boot, membrane, arm, leg, shape };
    };
    this.right = makeSide(1);
    this.left = makeSide(-1);

    // The tail fin between the legs: u runs left (-1) to right (+1), v from the hips (0) to past the ankles (1)
    this.fin = new Cloth(6, 4, (u, v, t, out) => {
      if (v > 0.99) { out.copy(t.accent).lerp(t.cloth, 0.25); return 0.3; }
      if (Math.abs(u) < 0.01) { out.copy(t.accent).lerp(t.cloth, 0.5); return 0.15; }
      out.copy(t.cloth).lerp(t.clothDark, 0.2 + v * 0.3);
    }, clothMat);
    this.painted.push(this.fin.painted);
    this.chest.add(this.fin.mesh);
    const legL = this.left.leg, legR = this.right.leg;
    this.finShape = (u, v, out) => {
      alongLimb(legL.hip, legL.knee, legL.ankle, v, leftTmp);
      alongLimb(legR.hip, legR.knee, legR.ankle, v, rightTmp);
      out.lerpVectors(leftTmp, rightTmp, (u + 1) / 2);
      out.z += (1 - u * u) * v * (0.01 + this.flutter * 0.8 * Math.sin(this.time * ANIM.flutterRate * 0.9 + v * 4));
    };

    // Item slots: between the shoulder blades below the fans, the middle of the head, the right palm
    const back = new THREE.Object3D();
    back.position.set(0, -0.12, 0.25);
    this.chest.add(back);
    const crown = new THREE.Object3D();
    crown.position.set(0, 0.15, 0);
    this.head.add(crown);
    // Boots go on both ankles (items/equip.ts mirrors the left one)
    this.feet = [this.right.ankle, this.left.ankle];
    this.slots = { back, head: crown, hand: this.right.hand, feet: this.feet[0] };

    // Two scarf tails that stream over the back, above the fans
    this.scarf = [0, 1].map(() => {
      const tail = new Cloth(
        1,
        12,
        (u, v, t, out) => { out.copy(v > 0.86 ? t.trim : t.white).lerp(t.clothLight, (u + 1) * 0.15); },
        clothMat,
      );
      this.painted.push(tail.painted);
      this.chest.add(tail.mesh);
      return tail;
    });

    // A soft, diffused halo behind the body, tinted in the outfit's light tone
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
    this.applyPose(0);
  }

  private material<T extends THREE.Material>(material: T): T {
    this.materials.push(material);
    return material;
  }

  /** The arm membranes' tones: the `wings` wardrobe slot, or the suit's own on "classic" */
  private membraneTones(): Tones {
    const id = this.appearance.wings;
    if (id === "classic") return this.tones;
    const spec = wingSpec(id), tones = tonesFor(spec.color);
    tones.accent.set(spec.accent);
    return tones;
  }

  /** The tail fin's tones: the `cape` wardrobe slot, or the suit's own on "classic" */
  private finTones(): Tones {
    const spec = capeSpec(this.appearance.cape);
    if (!spec.color) return this.tones;
    const tones = tonesFor(spec.color);
    tones.trim.set(spec.trim);
    tones.accent.set(spec.trim);
    return tones;
  }

  private repaint() {
    const membranes = this.membraneTones(), fin = this.finTones();
    for (const painted of this.painted) {
      if (painted === this.fin.painted) applyPaint(painted, fin);
      else if (painted === this.left.membrane.painted || painted === this.right.membrane.painted) applyPaint(painted, membranes);
      else applyPaint(painted, this.tones);
    }
    this.auraMaterial.color.copy(this.tones.clothLight);
  }

  /** The halo's opacity this frame, 0..1 before tuning; ghosts wear a dimmer one that thins out with them */
  private setAuraOpacity(k: number) {
    const value = AURA_OPACITY * k * FX.aura * (1 + ATMOSPHERE.night.value * 1.5) * (this.ghost ? 0.3 * this.ghostFade : 1);
    this.auraMaterial.opacity = value;
    this.aura.visible = value > 0.01;
  }

  setColor(color: string) {
    this.tones = tonesFor(color);
    this.repaint();
  }

  /**
   * Legacy from the two hair-and-eyes styles (Game.ts still calls it from the
   * settings): the helmet and visor replaced them, so there is nothing to switch.
   */
  readonly setStyle: (style: 1 | 2) => void = () => {};

  /**
   * How brightly the ducted fans' cores burn, 0..1: dark metal when idle, the
   * accent color going white-hot at full boost. `applyPose` eases it towards the
   * boost input each frame. Repaints the cores only when it changes noticeably.
   */
  setBoostGlow(amount: number) {
    const k = clamp(amount, 0, 1);
    if (Math.abs(k - this.fanGlow) < 0.015 && !(k === 0 && this.fanGlow !== 0)) return;
    this.fanGlow = k;
    applyPaint(this.fanCores, this.tones);
  }

  /** Cosmetic meshes live on the animated joints; the flight hitbox never reads them. */
  setAppearance(appearance: Appearance) {
    if (this.ghost) return;
    if (appearance.hat !== this.appearance.hat) {
      if (this.hat) disposeModel(this.hat);
      this.hat = appearance.hat === "none" ? null : buildHat(appearance.hat);
      if (this.hat) this.slots.head.add(this.hat);
    }
    if (appearance.shoes !== this.appearance.shoes) {
      this.shoes.forEach(disposeModel);
      this.shoes = [];
      for (const [side, sign] of [[this.left, -1], [this.right, 1]] as const) {
        side.boot.visible = appearance.shoes === "classic";
        if (appearance.shoes !== "classic") {
          const shoe = buildShoe(appearance.shoes, sign);
          side.knee.add(shoe); this.shoes.push(shoe);
        }
      }
    }
    // The wings and cape slots color the arm membranes and the tail fin
    this.appearance = { ...appearance };
    this.repaint();
    this.applyPose(0);
  }

  /** A carried helmet takes priority over the wardrobe hat. */
  showCosmeticHat(visible: boolean) { if (this.hat) this.hat.visible = visible; }

  /** The hands in world space, where the wingtip trails stream from (call after update) */
  wingtips(left: THREE.Vector3, right: THREE.Vector3) {
    this.left.hand.getWorldPosition(left);
    this.right.hand.getWorldPosition(right);
  }

  /**
   * Contact points along both arm membranes in the pilot's own frame (the
   * group's), left then right, five each: the hand, the wrist, the elbow, the
   * membrane's trailing corner at the hip and the shoulder. The crash tumble
   * keeps them out of the rock (call after update)
   */
  wingPoints(out: THREE.Vector3[]) {
    this.sidePoints(this.left, -1, out, 0);
    this.sidePoints(this.right, 1, out, WING_POINTS);
  }

  private sidePoints(side: Side, s: 1 | -1, out: THREE.Vector3[], k: number) {
    const g = this.group;
    const hand = g.worldToLocal(side.hand.getWorldPosition(out[k]));
    const elbow = g.worldToLocal(side.elbow.getWorldPosition(out[k + 2]));
    out[k + 1].lerpVectors(elbow, hand, 0.7);
    g.worldToLocal(this.chest.localToWorld(out[k + 3].set(0.1 * s, -0.02, 0.01)));
    g.worldToLocal(side.shoulder.getWorldPosition(out[k + 4]));
  }

  /** The middle of the tail fin's trailing edge in world space, where the body trail streams from (call after update) */
  capeTip(out: THREE.Vector3): THREE.Vector3 {
    this.fin.tip(this.finShape, out);
    return this.fin.mesh.localToWorld(out);
  }

  /** The direction the arms span, in world space: trails use it as their width */
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
   * is how far the camera is, so far-away pilots skip the fine details.
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

    // The fans spool up and down with the boost input
    this.fanLevel += (this.boost - this.fanLevel) * (1 - Math.exp(-dt * 6));

    const far = distance > 110;
    if (far !== !this.detailed) {
      this.detailed = !far;
    }
    this.applyPose(dt, proximity);
  }

  private applyPose(dt: number, proximity = 0) {
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

    // Arms: spread wide to brake, tucked to the body at speed and under boost; the membranes follow
    const barrelTuck = this.barrel.t >= 0 ? Math.sin(Math.PI * this.barrel.t) : 0;
    const glide = clamp(A.armSpread - speedK * A.tuckSpeed - barrelTuck * 0.45 + this.brake * A.spreadBrake - this.boost * A.tuckBoost, 0.3, 1.6);
    const tucked = 1 - glide / 1.6;
    for (const [side, s] of [
      [this.right, 1],
      [this.left, -1],
    ] as [Side, 1 | -1][]) {
      // Arms sit a little above the body plane, flatter under boost, and lead into turns
      const armLift = 0.22 - this.boost * 0.1 + turn * 0.25 * s * A.limbSwing;
      side.shoulder.rotation.set(0, -armLift * s, glide * s);
      side.elbow.rotation.set(0, 0, (0.25 + tucked * 0.2) * s);

      // Legs together at speed, apart to brake so the fin fans out; knees soft, toes pointed; they swing like a rudder in turns
      const kick = Math.sin(t * 2.4 + (s > 0 ? 0 : 1.6)) * 0.06 * calm;
      side.hip.rotation.set(0.06 + kick, 0, (0.05 + this.brake * 0.4 - this.boost * 0.03) * s - turn * 0.12 * A.limbSwing);
      side.knee.rotation.set(-this.brake * 0.3 - 0.32 - clamp(this.climb, 0, 1) * 0.35 - kick * 1.4 - barrelTuck * 0.4, 0, 0);
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

    // The fans glow with the boost
    this.setBoostGlow(this.fanLevel);

    // Aura: a faint halo when cruising, a touch brighter with speed and skimming the ground...
    this.setAuraOpacity(0.4 + speedK * 0.6 + proximity * 0.3);
    // ...with a gentle living pulse in its size
    this.aura.scale.setScalar(AURA_SCALE * (1 + 0.03 * Math.sin(t * 1.5)));

    if (!this.detailed && dt > 0) return;
    this.clothTime += dt * (4.5 + this.speed * 0.11) * A.clothSpeed;
    // The membranes ripple at speed, less when boost pulls them taut
    this.flutter = A.membraneFlutter * speedK * (1 - this.boost * 0.5);
    this.updateCloth(
      A.clothWave * (0.075 + slow01(this.speed) * 0.05),
      -this.lean * 0.3 - turn * 0.15,
      this.pitchRate * 0.12 - this.climb * 0.12,
    );
  }

  /** The joint's position in chest space, where the cloth lives */
  private toChest(joint: THREE.Object3D, out: THREE.Vector3): THREE.Vector3 {
    return out.setFromMatrixPosition(joint.matrixWorld).applyMatrix4(this.clothInverse);
  }

  /** Moves the membranes and the scarf: `wave` ripple size, `leanX` sideways swing, `pitch` lift of the scarf */
  private updateCloth(wave: number, leanX: number, pitch: number) {
    const A = ANIM;
    const ct = this.clothTime;
    // Cloth is in chest space, whereas the legs follow the pelvis. Resolve
    // their current pose before shaping it, including knees bent by climbing,
    // braking, items or a crash. Never alter the limbs or flight hitbox.
    this.body.updateWorldMatrix(true, true);
    this.clothInverse.copy(this.chest.matrixWorld).invert();
    for (const obstacle of this.clothObstacles) {
      this.clothMatrix.multiplyMatrices(this.clothInverse, obstacle.mesh.matrixWorld);
      obstacle.bounds.copy(obstacle.local).applyMatrix4(this.clothMatrix);
    }

    // Membranes: stretched between the arm joints and the torso side, and between the legs
    for (const [side, s] of [[this.right, 1], [this.left, -1]] as [Side, 1 | -1][]) {
      const { arm, leg } = side;
      this.toChest(side.shoulder, arm.shoulder);
      this.toChest(side.elbow, arm.elbow);
      this.toChest(side.hand, arm.hand);
      arm.root.set(0.1 * s, 0.16, 0);
      arm.hip.set(0.1 * s, -0.02, 0.01);
      this.toChest(side.hip, leg.hip);
      this.toChest(side.knee, leg.knee);
      this.toChest(side.ankle, leg.ankle);
      // The fin reaches a little past the ankle
      jointTmp.subVectors(leg.ankle, leg.knee).normalize();
      leg.ankle.addScaledVector(jointTmp, 0.05);
      side.membrane.update(side.shape);
    }
    this.fin.update(this.finShape);

    // Scarf tails stream back over the fans
    this.scarf.forEach((cloth, i) => {
      const tail = i === 0 ? -1 : 1;
      const length = i === 0 ? 0.78 : 0.66;
      cloth.update((u, v, out) => {
        const phase = TAU * 1.8 * v - ct * 1.35 + tail * 1.3;
        out.set(
          tail * (0.035 + 0.1 * v) + u * 0.03 + leanX * v * 1.2 + Math.sin(phase * 0.7) * 0.05 * v * A.clothWave,
          0.27 - v * length,
          0.175 + 0.08 * v + 0.16 * v * v + wave * 1.4 * v * Math.sin(phase) - pitch * v,
        );
        this.clearCloth(out);
      });
    });
  }

  /** Keep cloth behind the legs (+z in chest space), with a soft drape around them. */
  private clearCloth(out: THREE.Vector3) {
    for (const { bounds } of this.clothObstacles) {
      // Cover half a cloth grid cell beyond the bounds so triangles between
      // samples also clear the boots.
      const dx = Math.max(bounds.min.x - out.x, out.x - bounds.max.x, 0);
      const dy = Math.max(bounds.min.y - out.y, out.y - bounds.max.y, 0);
      const drape = 1 - smoothstep(0.06, 0.12, Math.max(dx, dy));
      out.z += Math.max(0, bounds.max.z + 0.025 - out.z) * drape;
    }
  }

  /** Starts the crash animation of this kind; `side` is the arm that hit (1 right, -1 left) */
  die(kind: DeathKind, side: 1 | -1) {
    this.death = { kind, t: 0, side };
    this.barrel.t = -1;
    this.barrelProgress = -1;
  }

  /**
   * Legacy from the rigid bird wings (Game.ts still calls it during a crash):
   * the membranes are fabric on the arms, so there is nothing to fold; they
   * follow wherever the flailing arms go.
   */
  readonly foldWings: (left: number, right: number, dt: number) => void = () => {};

  /** Back to flying (on respawn) */
  revive() {
    this.death = null;
    this.hasLast = false;
    this.lean = this.leanVelocity = 0;
    this.pitchRate = this.yawRate = this.rollRate = 0;
  }

  get dying(): boolean {
    return this.death !== null;
  }

  /**
   * The crash pose: limbs windmill in panic, then flop as the pilot goes limp;
   * the membranes follow the arms; a headfirst hit squashes the body for a
   * moment. At the end the pilot shrinks into light.
   */
  private applyDeathPose(dt: number) {
    const d = this.death!;
    const t = d.t;
    const A = ANIM;
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
    }

    // The fans wind down
    this.fanLevel *= Math.exp(-dt * 4);
    this.setBoostGlow(this.fanLevel);

    // The aura fades out with the dissolve
    this.setAuraOpacity(0.6 * vanish);
    this.aura.scale.setScalar(AURA_SCALE);

    if (!this.detailed) return;
    // Cloth whips around hard
    this.clothTime += dt * 14 * A.clothSpeed;
    this.flutter = A.membraneFlutter * 1.5;
    this.updateCloth(A.clothWave * 0.16, wave(3, 0) * 0.35, -0.3 + wave(4, 1) * 0.3);
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
    if (this.hat) disposeModel(this.hat);
    this.shoes.forEach(disposeModel);
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

function slow01(speed: number) {
  return clamp((35 - speed) / 20, 0, 1);
}

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
