import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { flatMaterial } from "./toon";
import { ATMOSPHERE } from "./world/atmosphere";
import { ANIM, FX } from "./tuning";
import { clamp, smoothstep } from "./math";
import { DISSOLVE_AT, type DeathKind, WING_POINTS } from "./death";
import type { ItemSlot } from "./items/models";

// The pilot: a gold paper airplane (kilansky's "Paper Airplane", CC BY 4.0, see
// CREDITS.md), one static 42-triangle mesh converted in Blender and shipped as
// `public/models/pilot.glb` (positions and baked vertex colors only, no textures, no
// skeleton). The chase camera only ever sees it from behind and above, ten metres
// away, where it reads as a bright gold dart: two swept wings flaring up to the tips
// at the tail, a keel fold down the middle.
//
// The model is "standing" in the game's convention, baked into the GLB: nose pointing
// +y (straight up), tail -y, wings spread along x, the keel fold along z with its
// bottom towards -z and the raised wingtips towards +z. Wingspan 1.0, length ≈ 1.06,
// height ≈ 0.22, centred on its centre of mass (the wing root amidships). It is laid
// prone here like the old wingsuit pilot was, so after `body.rotation.x = -π/2` the
// nose points along the flight direction (-z), the wingtips rise (+y) and the keel
// hangs below. The caller places `group` at the flight model's position and rotation;
// everything the animation adds (rolls, bobbing, the speed stretch, the crash flail)
// happens inside it, on the rig as a whole: the mesh is one piece, so there are no
// limbs to pose.
//
// The GLB is fetched once and shared by every avatar (players, ghosts, the gallery);
// an avatar is empty until it arrives, then the mesh pops in.

const SCALE = 1.65;
const TAU = Math.PI * 2;
/** The paper's own light: warm gold, added on top of whatever the biome's sky and sun give it (strength in FX.pilotGlow) */
const GLOW_COLOR = new THREE.Color("#ffefd2");

/** Where the GLB lives, under Vite's public dir */
const MODEL_URL = import.meta.env.BASE_URL + "models/pilot.glb";

// --- the model's landmarks, in model space (nose +y, tail -y, wingtips +z, keel -z) ------
// Measured off the mesh (bounding box x ±0.5, y -0.435..0.62, z -0.109..0.115). The
// origin is the centre of mass, so it is also the body's origin: what the prone
// rotation and the pitch arch turn about, and where death.ts's contact balls sit.

/** The wings' outer edge: the mesh's x extremes, the raised tips at the trailing edge */
const WING_TIP: Vec = [0.5, -0.43, 0.1];
/** Where the wing leaves the keel fold */
const WING_ROOT_X = 0.05;
/** The tail of the airplane, where the trails stream from: the middle of the trailing edge at the keel */
const EXHAUST: Vec = [0, -0.36, -0.01];
/** Item anchors: the top of the keel fold amidships, the nose tip, the right wingtip, the belly under the wings */
const SLOT_BACK: Vec = [0, 0.05, 0.03];
const SLOT_HEAD: Vec = [0, 0.61, -0.1];
const SLOT_HAND: Vec = [0.45, -0.38, 0.09];
const SLOT_FOOT: Vec = [0.03, -0.21, -0.09];

type Vec = [number, number, number];

// --- the shared mesh --------------------------------------------------------------------

let pilotGeometry: Promise<THREE.BufferGeometry> | null = null;

/**
 * The pilot's geometry, loaded once for the whole page and shared by every avatar
 * (never disposed). Its colors come along as a vertex attribute; the flat material
 * shades its facets, so the missing normals are not a loss.
 */
function loadPilotGeometry(): Promise<THREE.BufferGeometry> {
  if (!pilotGeometry) {
    pilotGeometry = new GLTFLoader().loadAsync(MODEL_URL).then((gltf) => {
      let mesh: THREE.Mesh | null = null;
      gltf.scene.traverse((o) => {
        if (!mesh && (o as THREE.Mesh).isMesh) mesh = o as THREE.Mesh;
      });
      if (!mesh) throw new Error(`${MODEL_URL}: no mesh in the scene`);
      const geometry = (mesh as THREE.Mesh).geometry;
      if (!geometry.getAttribute("normal")) geometry.computeVertexNormals();
      geometry.computeBoundingSphere();
      return geometry;
    });
    // A failed load (offline, a bad deploy) leaves every pilot invisible; log it and let
    // the next avatar try again
    pilotGeometry.catch((error) => {
      console.error("pilot model failed to load", error);
      pilotGeometry = null;
    });
  }
  return pilotGeometry;
}

// --- the avatar --------------------------------------------------------------------

export interface AvatarOptions {
  ghost?: boolean;
}

const localOmega = new THREE.Vector3();
const dq = new THREE.Quaternion();
const prevInverse = new THREE.Quaternion();
const forwardTmp = new THREE.Vector3();

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

  /** Bobs, rolls and stretches; scaled by `SCALE` */
  private readonly rig = new THREE.Group();
  /** The standing model laid prone */
  private readonly body = new THREE.Group();
  /** Model space: the mesh and the anchors, centred on the body's origin */
  private readonly anchors = new THREE.Group();
  /** The pilot mesh once the GLB has arrived */
  private model: THREE.Mesh | null = null;
  private readonly material: THREE.MeshLambertMaterial;
  private disposed = false;
  /** The glow shell around the body (see the constructor); looks only */
  private shell: THREE.Mesh | null = null;
  private readonly shellMaterial: THREE.MeshBasicMaterial;
  /** A ghost's current fade (see `fade`); dims its glow along with the body */
  private ghostFade = 1;
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
  /** The boost eased in, 0..1: brightens the glow */
  private thrust = 0;
  private climb = 0;
  private time = 0;
  boost = 0;
  brake = 0;
  /** 0..1 while a barrel roll is under way */
  barrelProgress = -1;
  /** Where carried items go: on the back (the firework), on the head (helmets), in the right hand */
  readonly slots: Record<ItemSlot, THREE.Object3D>;
  /** The right and left ankle, for boots */
  readonly feet: [THREE.Object3D, THREE.Object3D];
  /**
   * Kept for items/equip.ts, which still writes it: the arm pose it asks for.
   * The mesh is one piece, so nothing reads it any more.
   */
  readonly armPose = { amount: 0, x: 0, y: 0, z: 0, elbow: 0 };
  /** A crash playing out: the body flails, then goes limp (Game moves `group`) */
  private death: { kind: DeathKind; t: number; side: number } | null = null;

  /** `color` is kept for the callers' sake (multiplayer rosters); the suit's livery is baked into the model */
  constructor(_color: string, options: AvatarOptions = {}) {
    this.ghost = !!options.ghost;
    this.material = flatMaterial({ ghost: this.ghost, side: THREE.FrontSide, emissive: GLOW_COLOR });
    this.setGlow();

    this.group.add(this.rig);
    this.rig.add(this.body);
    this.rig.scale.setScalar(SCALE);
    // Lay the standing model prone: its +y nose turns to -z, forward along the flight
    // direction, and its +z wingtips turn up (+y). The GLB is already centred on its
    // centre of mass, so the anchors sit at the body's origin.
    this.body.rotation.set(-Math.PI / 2, 0, 0);
    this.body.add(this.anchors);

    // Item slots, fixed to the model
    const slot = (at: Vec) => {
      const o = new THREE.Object3D();
      o.position.set(...at);
      this.anchors.add(o);
      return o;
    };
    // Boots go on both ankles (items/equip.ts mirrors the left one)
    this.feet = [slot(SLOT_FOOT), slot([-SLOT_FOOT[0], SLOT_FOOT[1], SLOT_FOOT[2]])];
    this.slots = { back: slot(SLOT_BACK), head: slot(SLOT_HEAD), hand: slot(SLOT_HAND), feet: this.feet[0] };

    // The glow shell: an unlit, additive copy of the mesh, slightly larger, that lays a
    // warm light over the paper and a thin bright rim around its outline. No lighting
    // reaches it, so the biome's ambient can't tint it: the paper's own light, read even
    // where the sky dims and colours everything else
    this.shellMaterial = new THREE.MeshBasicMaterial({
      color: SHELL_COLOR,
      blending: THREE.AdditiveBlending,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      side: THREE.DoubleSide,
      fog: false,
    });

    // The mesh pops in when the shared GLB arrives (nothing shows until then)
    loadPilotGeometry().then(
      (geometry) => {
        if (this.disposed) return;
        this.model = new THREE.Mesh(geometry, this.material);
        this.anchors.add(this.model);
        this.shell = new THREE.Mesh(geometry, this.shellMaterial);
        this.shell.scale.setScalar(SHELL_SCALE);
        this.shell.renderOrder = 2;
        this.anchors.add(this.shell);
      },
      () => {},
    );

    this.applyPose();
  }

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

  /** The paper's own light, read from the tuning each frame so the panel's slider works live; ghosts glow half as much */
  private setGlow() {
    this.material.emissiveIntensity = FX.pilotGlow * (this.ghost ? 0.5 : 1);
  }

  /** The shell's glow this frame: `k` is 0..1 before tuning, brighter at night; ghosts wear a dimmer one that thins out with them */
  private setGlowStrength(k: number) {
    const shell = SHELL_OPACITY * k * FX.glowShell * (1 + ATMOSPHERE.night.value * 1.5) * (this.ghost ? 0.3 * this.ghostFade : 1);
    this.shellMaterial.opacity = shell;
    if (this.shell) this.shell.visible = shell > 0.01;
  }

  /**
   * Legacy from the per-player liveries (Game.setSelf still calls it): the suit's
   * colors are baked into the model, so the pilot's color only reaches the name
   * label and the trail/debris effects, never the body.
   */
  readonly setColor: (color: string) => void = () => {};

  /**
   * How hard the jetpack burns, 0..1. The model is static (no exhaust cores to
   * repaint), so the burn only shows as a brighter halo; `applyPose` eases it
   * towards the boost input each frame.
   */
  setBoostGlow(amount: number) {
    this.thrust = clamp(amount, 0, 1);
  }

  /** A model-space point (origin at the centre of mass) to world space (call after update) */
  private toWorld(at: Vec, out: THREE.Vector3, mirror: 1 | -1 = 1): THREE.Vector3 {
    out.set(at[0] * mirror, at[1], at[2]);
    return this.anchors.localToWorld(out);
  }

  /** The two wing tips in world space, where the wingtip trails stream from (call after update) */
  wingtips(left: THREE.Vector3, right: THREE.Vector3) {
    this.toWorld(WING_TIP, left, -1);
    this.toWorld(WING_TIP, right, 1);
  }

  /**
   * Contact points along both wings in the pilot's own frame (the group's), left
   * then right, five each from the tip in to the root. The crash tumble keeps them
   * out of the rock (call after update)
   */
  wingPoints(out: THREE.Vector3[]) {
    this.body.updateWorldMatrix(true, true);
    const g = this.group;
    for (const [s, k] of [[-1, 0], [1, WING_POINTS]] as [1 | -1, number][]) {
      for (let i = 0; i < WING_POINTS; i++) {
        const u = i / (WING_POINTS - 1); // 0 tip → 1 root
        const x = WING_TIP[0] + (WING_ROOT_X - WING_TIP[0]) * u;
        g.worldToLocal(this.toWorld([x, WING_TIP[1], WING_TIP[2]], out[k + i], s));
      }
    }
  }

  /**
   * The mouth of the jetpack in world space, where the body trail streams from
   * (call after update), so the wide ribbon leaves the propulsion
   */
  capeTip(out: THREE.Vector3): THREE.Vector3 {
    return this.toWorld(EXHAUST, out);
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

  /** Animates the pilot. Call after placing `group` for this frame */
  update(dt: number, speed: number, proximity: number) {
    if (dt <= 0) return;
    this.time += dt;
    this.speed = speed;
    this.setGlow();
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

    // The jetpack spools up and down with the boost input
    this.thrust += (this.boost - this.thrust) * (1 - Math.exp(-dt * 6));

    this.applyPose(proximity);
  }

  /** The flying pose: everything happens on the rig and the body as a whole */
  private applyPose(proximity = 0) {
    const t = this.time;
    const A = ANIM;
    const speedK = smoothstep(25, 95, this.speed);

    // Rig: physics-timed barrel roll, gentle bobbing, squash and stretch
    let roll = 0; // steering bank is already in group; never visually exceed its limit
    if (this.barrel.t >= 0) {
      const p = smoother(clamp(this.barrel.t, 0, 1));
      roll -= p * TAU * this.barrel.dir;
    }
    const calm = 1 - speedK * 0.65;
    const bob = Math.sin(t * TAU * A.bobRate) * A.bobAmount * calm;
    this.rig.position.set(Math.sin(t * TAU * A.bobRate * 0.5) * A.bobAmount * 0.4 * calm, bob, 0);
    this.rig.rotation.set(Math.cos(t * TAU * A.bobRate) * 0.04 * calm - this.pitchRate * 0.05, 0, roll);
    const stretch = 1 + clamp((this.speed - 55) / 60, 0, 1) * 0.06;
    this.rig.scale.set(SCALE / Math.sqrt(stretch), SCALE / Math.sqrt(stretch), SCALE * stretch);

    // Body pitch: slow = nose up (shows back to chase cam), fast = nose down (streamlined).
    // Brake raises the nose further, boost dips it, climbing lifts.
    const arch = 0.15 * (1 - speedK) + this.brake * 0.18 - this.boost * 0.08 + clamp(this.climb, 0, 1) * 0.1 + this.pitchRate * 0.04;
    this.body.rotation.set(-Math.PI / 2 + arch, 0, -this.lean * 0.15);

    // Glow: faint when cruising, brighter with speed, skimming the ground and the burn
    this.setGlowStrength(0.4 + speedK * 0.6 + proximity * 0.3 + this.thrust * 0.5);
  }

  /** Starts the crash animation of this kind; `side` is the wing that hit (1 right, -1 left) */
  die(kind: DeathKind, side: 1 | -1) {
    this.death = { kind, t: 0, side };
    this.barrel.t = -1;
    this.barrelProgress = -1;
  }

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
   * The crash pose, on top of the tumble Game gives `group`: the body thrashes
   * about in panic, then goes limp and curls up; a headfirst hit squashes it for
   * a moment. At the end the pilot shrinks into light.
   */
  private applyDeathPose(dt: number) {
    const d = this.death!;
    const t = d.t;
    const panic = Math.exp(-t * 1.5);
    const wave = (rate: number, phase: number) => Math.sin(t * rate + phase);
    const curl = d.kind === "headfirst" ? 0.7 : d.kind === "slide" ? 0.5 : d.kind === "fall" ? 0.3 : -0.1;

    // Squash on impact, then shrink away into light at the end
    const hit = d.kind === "headfirst" ? Math.sin(Math.PI * clamp(t / 0.22, 0, 1)) * 0.28 : d.kind === "slide" ? Math.sin(Math.PI * clamp(t / 0.18, 0, 1)) * 0.14 : 0;
    const vanish = 1 - smoothstep(DISSOLVE_AT, DISSOLVE_AT + 0.22, t);
    const size = SCALE * Math.max(0.001, vanish);
    this.rig.position.set(0, 0, 0);
    // Thrashing: a quick wobble that dies down as the pilot goes limp
    this.rig.rotation.set(wave(9, 0) * 0.18 * panic, wave(7, 1) * 0.2 * panic, wave(5, 2) * 0.15 * panic + d.side * 0.1 * (1 - panic));
    this.rig.scale.set(size * (1 + hit * 0.5), size * (1 - hit), size * (1 + hit * 0.5));
    // Curling up as the panic fades
    this.body.rotation.set(-Math.PI / 2 + curl * 0.4 * (1 - panic) + wave(6, 0) * 0.08 * panic, 0, 0);

    // The jetpack winds down
    this.thrust *= Math.exp(-dt * 4);

    // The glow fades out with the dissolve
    this.setGlowStrength(0.6 * vanish);
  }

  /** A ghost's opacity, 0..1; solid pilots ignore it */
  fade(opacity: number) {
    if (!this.ghost) return;
    this.material.opacity = opacity;
    // The glow follows (ghosts wear 0.3 of it, see `setGlowStrength`); the next pose applies it
    this.ghostFade = opacity;
    this.shellMaterial.opacity *= opacity;
  }

  /** Hides the pilot (e.g. after a crash) */
  set visible(visible: boolean) {
    this.group.visible = visible;
  }

  get visible(): boolean {
    return this.group.visible;
  }

  /** The geometry is shared with every other avatar and stays loaded */
  dispose() {
    this.disposed = true;
    if (this.model) this.anchors.remove(this.model);
    this.model = null;
    if (this.shell) this.anchors.remove(this.shell);
    this.shell = null;
    this.material.dispose();
    this.shellMaterial.dispose();
  }
}

// --- glow -------------------------------------------------------------------------------

/** The glow shell: how much larger than the body, its colour, and its base alpha at full strength */
const SHELL_SCALE = 1.05;
const SHELL_COLOR = new THREE.Color("#fff4dc");
const SHELL_OPACITY = 0.35;

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
