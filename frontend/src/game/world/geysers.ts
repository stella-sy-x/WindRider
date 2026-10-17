import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { clamp, smoothstep } from "../math";
import { Kind, type ParticleSpec, type Particles, fxTime } from "../particles";
import { makeRng, range } from "../rng";
import { FLOWS } from "../tuning";
import type { CurrentSpec, GeyserSpec } from "./biomes/types";
import type { Course } from "./course";
import type { Ground } from "./terrain/ground";
import type { Rock } from "./World";

// The water's own push under the sea (Sunken Reef): geysers and currents, the
// environmental stand-in for the boost button.
//
// A geyser is a plume of bubbles rising from a glowing vent on the seabed, a
// cone ~15 m across at the top and ~40 m tall, standing beside the racing line:
// swing into it and the water throws you up and on (Game.waterFlows,
// FLIGHT.geyserBoost/geyserLift). A current is a stream of water ~10 m across
// and 80 to 120 m long, running along the line or cutting across it: inside,
// it carries you with it, and flying with it gains speed, flying against it
// loses some (FLIGHT.currentBoost/currentDrive). Learn where they are and you
// can plan a faster route.
//
// This file has three parts: the data (`Geyser`, `Current`), placed from the
// seed so every client agrees (`placeGeysers`, `placeCurrents`); how deep
// inside one a point is (`geyserStrength`, `currentStrength`), which is what
// the physics in Game uses; and `ReefFlows`, the looks: the walls of water
// drawn as merged meshes, the vents, and the bubbles and motes streaming
// through them. Looks never touch the push.

/** A geyser: the vent on the seabed, and the plume above it */
export interface Geyser {
  /** The vent, on the seabed */
  x: number;
  y: number;
  z: number;
  /** Of the plume at its top (it is `GEYSER_FOOT` of this at the vent) */
  radius: number;
  /** Metres the plume rises from the vent */
  height: number;
}

/** A current: a stream of water from `start`, `length` metres along `direction` */
export interface Current {
  readonly start: THREE.Vector3;
  /** Unit length */
  readonly direction: THREE.Vector3;
  length: number;
  radius: number;
}

/** The plume's radius at the vent, as a share of its radius at the top */
export const GEYSER_FOOT = 0.35;
/** Metres of open water a plume needs around its axis all the way up */
const PLUME_CLEARANCE = 4;
/** Metres either side of a gate's z where no geyser stands (the gate's rock is in the way) */
const GATE_GAP = 40;
/** Metres from the camera within which plumes and streams give off particles */
const FX_RANGE = 360;
const TAU = Math.PI * 2;

// --- placement (deterministic: `makeRng` only) ---------------------------------------------

/**
 * Geysers along the course, at roughly even intervals, each a little to one side
 * of the racing line (never right on it: you have to swing into one). A vent
 * stands where its plume rises through open water up past the line's height
 */
export function placeGeysers(course: Course, rock: Rock, ground: Ground | null, spec: GeyserSpec, seed: number): Geyser[] {
  const rng = makeRng(seed, "geysers");
  const geysers: Geyser[] = [];
  const count = Math.round(range(rng, spec.count[0], spec.count[1]));
  const from = course.start.z + 180;
  const to = course.endZ - 120;
  const interval = (to - from) / Math.max(1, count);
  for (let i = 0; i < count; i++) {
    // Gates and rock rule out a good share of the spots: plenty of tries, anywhere in this geyser's stretch
    for (let tries = 0; tries < 14; tries++) {
      const z = from + interval * (i + range(rng, 0.15, 0.85));
      const x = course.x(z) + (rng() < 0.5 ? -1 : 1) * range(rng, spec.lateral[0], spec.lateral[1]);
      const lineY = course.y(z);
      const floor = ground ? ground.height(x, z) : lineY - 30;
      // The plume must reach up past the line, and the line must be well clear of the vent
      if (floor + spec.height < lineY + 6 || floor > lineY - 10) continue;
      if (course.gates.some((gate) => Math.abs(gate - z) < GATE_GAP)) continue;
      if (!clearColumn(rock, x, floor, z, spec.height)) continue;
      geysers.push({ x, y: floor, z, radius: spec.radius, height: spec.height });
      break;
    }
  }
  return geysers;
}

/** Open water along the plume's axis, from just above the vent to the top */
function clearColumn(rock: Rock, x: number, floor: number, z: number, height: number): boolean {
  for (let k = 2; k <= 8; k++) {
    if (rock.distance(x, floor + (height * k) / 8, z) < PLUME_CLEARANCE) return false;
  }
  return true;
}

const UP = new THREE.Vector3(0, 1, 0);
const probe = new THREE.Vector3();

/**
 * Currents along the course: most run along the racing line's direction, beside
 * it; the rest start off to one side and cut across the line at an angle. Each
 * is shortened to the stretch of open water it has, or left out if that's too little
 */
export function placeCurrents(course: Course, rock: Rock, spec: CurrentSpec, seed: number): Current[] {
  const rng = makeRng(seed, "currents");
  const currents: Current[] = [];
  const count = Math.round(range(rng, spec.count[0], spec.count[1]));
  const from = course.start.z + 120;
  const to = course.endZ - 160;
  const interval = (to - from) / Math.max(1, count);
  for (let i = 0; i < count; i++) {
    for (let tries = 0; tries < 6; tries++) {
      const z = from + interval * (i + range(rng, 0.2, 0.8));
      const start = course.pointAt(z);
      const direction = course.tangentAt(z);
      const cross = rng() < spec.cross;
      const side = rng() < 0.5 ? -1 : 1;
      let lateral = range(rng, spec.lateral[0], spec.lateral[1]);
      if (cross) {
        // Swung round the vertical by 20° to 45°, starting on the side it swings away from, so it crosses the line
        const angle = range(rng, 0.35, 0.8) * side;
        direction.applyAxisAngle(UP, angle);
        lateral = Math.max(lateral, 15);
        start.x -= side * lateral;
      } else {
        start.x += side * lateral;
      }
      start.y += range(rng, -6, 10);
      const length = range(rng, spec.length[0], spec.length[1]);
      // Only as long as the water stays open along it
      let clear = 0;
      for (let s = 0; s <= length; s += 8) {
        probe.copy(start).addScaledVector(direction, s);
        if (rock.distance(probe.x, probe.y, probe.z) < spec.radius * 0.5) break;
        clear = s;
      }
      if (clear < spec.length[0] * 0.6) continue;
      currents.push({ start, direction, length: clear, radius: spec.radius });
      break;
    }
  }
  return currents;
}

// --- where the push is felt ----------------------------------------------------------------

/**
 * How deep inside geyser `g` the point is, 0 outside to 1 in the heart of the
 * plume: full strength in the middle, fading towards the plume's rim and dying
 * out a little above its top (so the top is a throw, not a step)
 */
export function geyserStrength(g: Geyser, p: THREE.Vector3): number {
  const h = (p.y - g.y) / g.height;
  if (h < 0 || h > 1.15) return 0;
  const radius = g.radius * (GEYSER_FOOT + (1 - GEYSER_FOOT) * Math.min(h, 1));
  const d = Math.hypot(p.x - g.x, p.z - g.z);
  if (d >= radius) return 0;
  return (1 - smoothstep(0.55, 1, d / radius)) * (1 - smoothstep(0.85, 1.15, h));
}

/** How deep inside current `c` the point is, 0 outside to 1 in the middle of the stream, easing in at both ends */
export function currentStrength(c: Current, p: THREE.Vector3): number {
  const dx = p.x - c.start.x;
  const dy = p.y - c.start.y;
  const dz = p.z - c.start.z;
  const n = c.direction;
  const t = dx * n.x + dy * n.y + dz * n.z;
  if (t < -c.radius || t > c.length + c.radius) return 0;
  const d = Math.hypot(dx - n.x * t, dy - n.y * t, dz - n.z * t);
  if (d >= c.radius) return 0;
  const along = smoothstep(-c.radius, c.radius * 0.5, t) * (1 - smoothstep(c.length - c.radius * 0.5, c.length + c.radius, t));
  return (1 - smoothstep(0.6, 1, d / c.radius)) * along;
}

// --- the looks ------------------------------------------------------------------------------

// A wall of water: brightest where it is seen edge-on (thickest), with bands of
// brighter water running along its axis (uv.y: 0 at the vent or the stream's
// start, 1 at the far end), broken up around it. Additive, so it adds light to
// whatever is behind rather than hiding it; fog darkens it like the particles.
const wallVertex = /* glsl */ `
  varying vec2 vUv;
  varying float vEdge;
  #include <fog_pars_vertex>
  void main() {
    vUv = uv;
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    vec3 n = normalize(normalMatrix * normal);
    vEdge = 1.0 - abs(dot(n, normalize(-mvPosition.xyz)));
    gl_Position = projectionMatrix * mvPosition;
    #include <fog_vertex>
  }
`;

const wallFragment = /* glsl */ `
  uniform vec3 tint;
  uniform float time;
  uniform float strength;
  uniform float flow; // bands a second along the axis
  uniform float bands; // bands along the whole length
  uniform vec2 fade; // uv.y where the start has faded in, and where the end begins to fade out
  varying vec2 vUv;
  varying float vEdge;
  #include <fog_pars_fragment>
  void main() {
    float band = 0.55 + 0.45 * sin((vUv.y * bands - time * flow) * 6.2832 + sin(vUv.x * 12.566 + time * 0.7) * 1.5);
    float ends = smoothstep(0.0, fade.x, vUv.y) * (1.0 - smoothstep(fade.y, 1.0, vUv.y));
    float edge = 0.2 + 0.8 * vEdge * vEdge;
    float a = edge * band * ends * strength;
    vec3 color = tint * a;
    #ifdef USE_FOG
      color *= 1.0 - smoothstep(fogNear, fogFar, vFogDepth);
    #endif
    gl_FragColor = vec4(color, 1.0);
  }
`;

const PLUME_TINT = new THREE.Color("#8fe8ff");
const STREAM_TINT = new THREE.Color("#5fe8d0");
const VENT_TINT = new THREE.Color("#9afff4").multiplyScalar(2.2); // over the bloom threshold: the vent glows
const BUBBLE = new THREE.Color("#e8fbff");
const MOTE = new THREE.Color("#c8fff8");
const STREAK = new THREE.Color("#a0fff0");

const at = new THREE.Vector3();
const vel = new THREE.Vector3();
const basisA = new THREE.Vector3();
const basisB = new THREE.Vector3();
const quat = new THREE.Quaternion();
const rand = (min: number, max: number) => min + Math.random() * (max - min);

/** Fills in a particle spec without allocating */
function look(s: ParticleSpec, life: number, size: number, kind: Kind, gravity: number, drag: number, intensity: number, color: THREE.Color) {
  s.life = life;
  s.size = size;
  s.kind = kind;
  s.gravity = gravity;
  s.drag = drag;
  s.intensity = intensity;
  s.color = color;
}

function wallMaterial(tint: THREE.Color, flow: number, bands: number, fade: [number, number]): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      ...THREE.UniformsUtils.clone(THREE.UniformsLib.fog),
      tint: { value: tint },
      time: fxTime,
      strength: { value: 1 },
      flow: { value: flow },
      bands: { value: bands },
      fade: { value: new THREE.Vector2(fade[0], fade[1]) },
    },
    vertexShader: wallVertex,
    fragmentShader: wallFragment,
    blending: THREE.AdditiveBlending,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    fog: true,
  });
}

/**
 * The geysers and currents of a level as drawn: each plume a cone of water
 * with bands rising up it over a glowing vent, each stream a tube with bands
 * running along it; bubbles rise through the plumes and motes stream along the
 * currents near the camera. Game owns one and gives it each new world
 */
export class ReefFlows {
  readonly group = new THREE.Group();
  private geysers: Geyser[] = [];
  private currents: Current[] = [];
  private geyserDebt = new Float32Array(0);
  private currentDebt = new Float32Array(0);
  private readonly meshes: THREE.Mesh[] = [];
  private readonly plumeMaterial = wallMaterial(PLUME_TINT, 1.6, 7, [0.12, 0.65]);
  private readonly streamMaterial = wallMaterial(STREAM_TINT, 2.2, 10, [0.1, 0.88]);
  private readonly ventMaterial = new THREE.MeshBasicMaterial({ color: VENT_TINT, transparent: true, opacity: 0.7, depthWrite: false });
  private readonly spec: ParticleSpec = { life: 1, size: 1, color: BUBBLE, kind: Kind.Bubble };
  private readonly glow: Particles;
  private readonly soft: Particles;

  /** `glow` adds light (motes); `soft` blends (bubbles) */
  constructor(glow: Particles, soft: Particles) {
    this.glow = glow;
    this.soft = soft;
  }

  /** The flows of a new level (none in biomes above the sea: the group is left empty) */
  setWorld(world: { geysers: Geyser[]; currents: Current[] }) {
    this.clear();
    this.geysers = world.geysers;
    this.currents = world.currents;
    this.geyserDebt = new Float32Array(this.geysers.length);
    this.currentDebt = new Float32Array(this.currents.length);
    const plumes: THREE.BufferGeometry[] = [];
    const vents: THREE.BufferGeometry[] = [];
    const streams: THREE.BufferGeometry[] = [];
    for (const g of this.geysers) {
      // Open at both ends: the cone's wall only, standing on the vent
      const plume = new THREE.CylinderGeometry(g.radius * 0.9, g.radius * GEYSER_FOOT, g.height, 12, 1, true);
      plume.translate(g.x, g.y + g.height / 2, g.z);
      plumes.push(plume);
      const vent = new THREE.CircleGeometry(g.radius * GEYSER_FOOT * 1.3, 12);
      vent.rotateX(-Math.PI / 2);
      vent.translate(g.x, g.y + 0.4, g.z);
      vents.push(vent);
    }
    for (const c of this.currents) {
      const stream = new THREE.CylinderGeometry(c.radius, c.radius, c.length, 10, 1, true);
      // The cylinder's axis (+y, uv.y 0 at -y) turned along the stream
      quat.setFromUnitVectors(UP, c.direction);
      stream.applyQuaternion(quat);
      stream.translate(c.start.x + c.direction.x * c.length * 0.5, c.start.y + c.direction.y * c.length * 0.5, c.start.z + c.direction.z * c.length * 0.5);
      streams.push(stream);
    }
    this.add(vents, this.ventMaterial, 1);
    this.add(plumes, this.plumeMaterial, 3);
    this.add(streams, this.streamMaterial, 3);
  }

  /** One mesh for all of a kind: a handful of draw calls for the whole level */
  private add(parts: THREE.BufferGeometry[], material: THREE.Material, renderOrder: number) {
    if (!parts.length) return;
    const merged = mergeGeometries(parts);
    parts.forEach((p) => p.dispose());
    if (!merged) return;
    const mesh = new THREE.Mesh(merged, material);
    mesh.frustumCulled = false;
    mesh.renderOrder = renderOrder;
    this.meshes.push(mesh);
    this.group.add(mesh);
  }

  private clear() {
    for (const mesh of this.meshes) {
      this.group.remove(mesh);
      mesh.geometry.dispose();
    }
    this.meshes.length = 0;
  }

  /** Per frame: the tuning, and the particles streaming through the flows near the camera */
  update(dt: number, camera: THREE.Vector3, budget: number) {
    if (!this.geysers.length && !this.currents.length) return;
    this.plumeMaterial.uniforms.strength.value = FLOWS.geyserGlow;
    this.streamMaterial.uniforms.strength.value = FLOWS.currentGlow;
    this.ventMaterial.opacity = clamp(0.7 * FLOWS.geyserGlow, 0, 1);
    for (const mesh of this.meshes) mesh.visible = (mesh.material as THREE.Material) === this.streamMaterial ? FLOWS.currentGlow > 0.001 : FLOWS.geyserGlow > 0.001;
    if (dt <= 0) return;
    this.plumes(dt, camera, budget);
    this.streams(dt, camera, budget);
  }

  /** Bubbles rising fast out of each vent near you, spreading out as the plume widens, with a glowing mote now and then */
  private plumes(dt: number, camera: THREE.Vector3, budget: number) {
    if (FLOWS.geyserBubbles <= 0) return;
    const s = this.spec;
    for (let i = 0; i < this.geysers.length; i++) {
      const g = this.geysers[i];
      const d = Math.hypot(g.x - camera.x, g.y + g.height * 0.5 - camera.y, g.z - camera.z);
      if (d > FX_RANGE) {
        this.geyserDebt[i] = 0;
        continue;
      }
      const near = clamp(1 - d / FX_RANGE, 0.25, 1);
      this.geyserDebt[i] = Math.min(this.geyserDebt[i] + 30 * FLOWS.geyserBubbles * budget * near * dt, 4);
      for (; this.geyserDebt[i] >= 1; this.geyserDebt[i]--) {
        const a = Math.random() * TAU;
        const r = Math.sqrt(Math.random()) * g.radius * GEYSER_FOOT * 0.8;
        at.set(g.x + Math.cos(a) * r, g.y + rand(0.3, 3), g.z + Math.sin(a) * r);
        // Fast off the vent, slowing as they rise (drag), so they reach about the plume's top
        vel.set(Math.cos(a) * rand(1, 3.5), rand(14, 22), Math.sin(a) * rand(1, 3.5));
        if (Math.random() < 0.2) {
          look(s, rand(1.2, 2), rand(0.3, 0.6), Kind.Glow, -0.5, 0.3, 1.8, MOTE);
          this.glow.emit(at, vel, s);
        } else {
          look(s, rand(2.6, 3.4), rand(0.2, 0.5), Kind.Bubble, -0.4, 0.35, 1, BUBBLE);
          this.soft.emit(at, vel, s);
        }
      }
    }
  }

  /** Motes racing along each stream near you: the water seen moving */
  private streams(dt: number, camera: THREE.Vector3, budget: number) {
    if (FLOWS.currentStreaks <= 0) return;
    const s = this.spec;
    for (let i = 0; i < this.currents.length; i++) {
      const c = this.currents[i];
      at.copy(c.start).addScaledVector(c.direction, c.length * 0.5);
      const d = at.distanceTo(camera);
      if (d > FX_RANGE + c.length * 0.5) {
        this.currentDebt[i] = 0;
        continue;
      }
      const near = clamp(1 - d / (FX_RANGE + c.length * 0.5), 0.25, 1);
      this.currentDebt[i] = Math.min(this.currentDebt[i] + 45 * FLOWS.currentStreaks * budget * near * dt, 4);
      if (this.currentDebt[i] < 1) continue;
      // Across the stream (its direction is never straight up or down)
      basisA.crossVectors(c.direction, UP).normalize();
      basisB.crossVectors(c.direction, basisA);
      for (; this.currentDebt[i] >= 1; this.currentDebt[i]--) {
        const a = Math.random() * TAU;
        const r = Math.sqrt(Math.random()) * c.radius * 0.9;
        at.copy(c.start)
          .addScaledVector(c.direction, rand(0, Math.max(1, c.length - 16)))
          .addScaledVector(basisA, Math.cos(a) * r)
          .addScaledVector(basisB, Math.sin(a) * r);
        vel.copy(c.direction).multiplyScalar(rand(14, 22)).addScaledVector(basisA, rand(-0.6, 0.6)).addScaledVector(basisB, rand(-0.6, 0.6));
        look(s, rand(0.8, 1.4), rand(0.12, 0.22), Kind.Glow, 0, 0, 1.6, STREAK);
        this.glow.emit(at, vel, s);
      }
    }
  }

  dispose() {
    this.clear();
    this.plumeMaterial.dispose();
    this.streamMaterial.dispose();
    this.ventMaterial.dispose();
  }
}
