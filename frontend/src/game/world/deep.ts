import * as THREE from "three";
import { sceneryTime as fxTime } from "../particles";
import { makeRng, range } from "../rng";
import { FX_LIGHT } from "../toon";
import { DEEP } from "../tuning";
import { ATMOSPHERE } from "./atmosphere";
import type { UnderwaterSpec } from "./biomes/types";
import type { World } from "./World";

// What makes a level read as under the sea, besides the surface overhead and
// the ripples of light on the land (both in atmosphere.ts): shafts of light
// slanting down from the surface, schools of fish circling, jellyfish drifting.
// Each is one instanced draw call animated in its vertex shader. Looks only:
// nothing here collides or touches the flight.
//
// The jellyfish discharge on a fixed cycle (DEEP.zapCycle), each with its own
// seeded phase: a short charge-up, then a burst of electric light, then rest.
// The cycle runs on the race clock, so everyone in a room sees the same
// jellyfish light up at the same moment, and `jellyCycle` is the one formula
// (shader and CPU alike) a future touch check will read the state from.

const TAU = Math.PI * 2;

/**
 * The near jellyfish: beside the racing line, in reach of a pilot who wants them (metres from
 * the line, above or below it), bell radius, and how much open water they need around them
 * (less than the scenery ones: they are soft, meant to be flown into, and the tube is only
 * 11 m clear)
 */
const NEAR_LATERAL: [number, number] = [4, 14];
const NEAR_RISE: [number, number] = [-8, 15];
const NEAR_SIZE: [number, number] = [2.5, 4.5];
const NEAR_ROOM = 2;

/**
 * A jellyfish's state at `time` seconds of the race, from its seeded `phase`:
 * `charge` 0..1 ramps through the telegraph, `zap` is 1 while it discharges.
 * The same formula as the shaders', so a touch check agrees with what is seen
 */
export function jellyCycle(phase: number, time: number): { charge: number; zap: number } {
  const cycle = Math.max(DEEP.zapCycle, 0.1);
  const telegraph = Math.min(Math.max(DEEP.zapTelegraph, 0.01), cycle);
  const active = Math.min(Math.max(DEEP.zapActive, 0.01), cycle - telegraph);
  const t = (((time + (phase / TAU) * cycle) % cycle) + cycle) % cycle;
  if (t < telegraph) return { charge: t / telegraph, zap: 0 };
  if (t < telegraph + active) return { charge: 1, zap: 1 };
  return { charge: 0, zap: 0 };
}

/** Shafts stand on a grid of cells this wide, in a patch of SHAFT_GRID × SHAFT_GRID cells around the camera */
const SHAFT_CELL = 64;
const SHAFT_GRID = 7;

const shaftVertex = /* glsl */ `
  attribute vec2 cell;
  uniform float surface;
  uniform vec3 atmoSunDirection;
  varying vec2 vUv;
  varying float vSeed;
  varying float vFade;
  varying float vDistance;
  float shaftHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  void main() {
    // Each cell of the world has its own shaft, or none: they stay put as you fly through them
    vec2 id = floor(cameraPosition.xz / ${SHAFT_CELL.toFixed(1)}) + cell;
    float seed = shaftHash(id);
    float seed2 = shaftHash(id + 17.3);
    vec2 xz = (id + 0.5 + (vec2(seed, seed2) - 0.5) * 0.85) * ${SHAFT_CELL.toFixed(1)};
    // Down along the sun's rays, each a little off
    vec3 axis = normalize(vec3(seed2 - 0.5, 0.0, seed - 0.5) * 0.2 - atmoSunDirection);
    float reach = mix(170.0, 300.0, seed2);
    float width = mix(4.0, 13.0, fract(seed * 7.7));
    vec3 world = vec3(xz.x, surface, xz.y) + axis * reach * position.y;
    // Turned about its axis to face the camera, widening on the way down
    vec3 across = cross(axis, cameraPosition - world);
    across /= max(length(across), 1e-3);
    world += across * position.x * width * (0.55 + 0.9 * position.y);
    vUv = position.xy;
    vSeed = seed;
    // Shafts at the rim of the patch fade in
    float away = length(xz - cameraPosition.xz);
    vFade = step(0.3, seed) * (1.0 - smoothstep(${(SHAFT_CELL * 2.2).toFixed(1)}, ${(SHAFT_CELL * 3.2).toFixed(1)}, away));
    vec4 mvPosition = viewMatrix * vec4(world, 1.0);
    vDistance = -mvPosition.z;
    gl_Position = projectionMatrix * mvPosition;
  }
`;

const shaftFragment = /* glsl */ `
  uniform vec3 atmoSunColor;
  uniform float strength;
  uniform float time;
  varying vec2 vUv;
  varying float vSeed;
  varying float vFade;
  varying float vDistance;
  void main() {
    float across = 1.0 - abs(vUv.x);
    across = across * across * (3.0 - 2.0 * across);
    // Bright under the surface, spent before the seabed
    float along = smoothstep(0.0, 0.06, vUv.y) * (1.0 - smoothstep(0.3, 1.0, vUv.y));
    float flicker = 0.62 + 0.38 * sin(time * (0.45 + vSeed * 0.5) + vSeed * 40.0);
    float bands = 0.72 + 0.28 * sin(vUv.x * 7.0 + vSeed * 20.0 + time * 0.35);
    // Thin out up close (flying through one is a soft brightening), and into the haze
    float a = across * along * flicker * bands * vFade * strength * smoothstep(3.0, 40.0, vDistance) * exp(-vDistance / 420.0);
    gl_FragColor = vec4(atmoSunColor * a * 0.55, 1.0);
    #include <colorspace_fragment>
  }
`;

/** Shafts of light slanting down from the water's surface around the camera */
export class LightShafts {
  readonly mesh: THREE.Mesh<THREE.InstancedBufferGeometry, THREE.ShaderMaterial>;

  constructor() {
    const geometry = new THREE.InstancedBufferGeometry();
    // x: across the shaft, y: 0 at the surface to 1 at its end
    geometry.setAttribute("position", new THREE.Float32BufferAttribute([-1, 0, 0, 1, 0, 0, 1, 1, 0, -1, 1, 0], 3));
    geometry.setIndex([0, 1, 2, 0, 2, 3]);
    const cells: number[] = [];
    const half = (SHAFT_GRID - 1) / 2;
    for (let i = -half; i <= half; i++) for (let k = -half; k <= half; k++) cells.push(i, k);
    geometry.setAttribute("cell", new THREE.InstancedBufferAttribute(new Float32Array(cells), 2));
    geometry.instanceCount = cells.length / 2;
    const material = new THREE.ShaderMaterial({
      uniforms: {
        surface: ATMOSPHERE.surface,
        atmoSunDirection: ATMOSPHERE.sunDirection,
        atmoSunColor: ATMOSPHERE.sunColor,
        strength: { value: 1 },
        time: fxTime,
      },
      vertexShader: shaftVertex,
      fragmentShader: shaftFragment,
      blending: THREE.AdditiveBlending,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    this.mesh = new THREE.Mesh(geometry, material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 3;
  }

  update(strength: number) {
    this.mesh.material.uniforms.strength.value = strength;
  }

  dispose() {
    this.mesh.geometry.dispose();
    this.mesh.material.dispose();
  }
}

const fishVertex = /* glsl */ `
  attribute float bend; // 0 at the head … 1 at the tail fin
  attribute vec4 shoal; // the school's middle, and its radius
  attribute vec4 swim; // where on the circle, radians a second (signed), height in the school, length
  attribute vec3 tint;
  uniform float time;
  varying vec3 vColor;
  varying float vShade;
  #include <fog_pars_vertex>
  void main() {
    // Round and round the school's middle, each fish on its own ring and height
    float turn = swim.x + time * swim.y;
    float ring = shoal.w * (0.5 + 0.5 * fract(swim.x * 3.7));
    vec3 at = shoal.xyz + vec3(cos(turn) * ring, swim.z + sin(time * 0.7 + swim.x * 3.0) * 0.6, sin(turn) * ring * 0.7);
    vec3 ahead = normalize(vec3(-sin(turn), 0.0, cos(turn) * 0.7)) * sign(swim.y);
    vec3 side = vec3(ahead.z, 0.0, -ahead.x);
    float wag = sin(time * 8.0 + swim.x * 20.0) * bend * 0.22;
    vec3 world = at + (side * (position.x + wag) + vec3(0.0, position.y, 0.0) + ahead * position.z) * swim.w;
    vColor = tint;
    vShade = position.y;
    vec4 mvPosition = viewMatrix * vec4(world, 1.0);
    gl_Position = projectionMatrix * mvPosition;
    #include <fog_vertex>
  }
`;

const fishFragment = /* glsl */ `
  uniform vec3 atmoSunColor;
  uniform float glow;
  varying vec3 vColor;
  varying float vShade;
  #include <fog_pars_fragment>
  void main() {
    // Lit from above: bright backs, shaded bellies; at night they glow by themselves
    vec3 color = vColor * (0.62 + vShade * 2.2) * mix(vec3(1.0), atmoSunColor, 0.5) + vColor * glow;
    #ifdef USE_FOG
      color = mix(color, fogColor, smoothstep(fogNear, fogFar, vFogDepth));
    #endif
    gl_FragColor = vec4(color, 1.0);
    #include <colorspace_fragment>
  }
`;

const jellyVertex = /* glsl */ `
  attribute vec2 body; // 0: the bell, 1: a tentacle; then how far towards the rim, or down the tentacle
  attribute vec4 home; // where it drifts, and its size
  attribute vec4 hue; // color, and its own phase
  uniform float time;
  uniform float raceTime;
  uniform vec3 zapCycle; // seconds: the whole cycle, the charge-up telegraph, the discharge
  varying vec3 vColor;
  varying float vEdge;
  varying float vHang;
  varying float vCharge;
  varying float vZap;
  #include <fog_pars_vertex>
  float jellyHash(float x) { return fract(sin(x * 12.9898) * 43758.5453); }
  void main() {
    float phase = hue.w;
    float beat = sin(time * 1.5 + phase);
    // Where in its discharge cycle this one is (the same arithmetic as jellyCycle in deep.ts)
    float cycle = max(zapCycle.x, 0.1);
    float telegraph = clamp(zapCycle.y, 0.01, cycle);
    float active = clamp(zapCycle.z, 0.01, cycle - telegraph);
    float ct = mod(raceTime + (phase / ${TAU.toFixed(6)}) * cycle, cycle);
    float charge = ct < telegraph ? ct / telegraph : (ct < telegraph + active ? 1.0 : 0.0);
    float zap = (ct >= telegraph && ct < telegraph + active) ? 1.0 : 0.0;
    vec3 p = position;
    if (body.x < 0.5) {
      // The bell squeezes in at the rim and springs open again; charging, it draws in tight
      p.xz *= (1.0 - 0.2 * beat * body.y) * (1.0 - 0.15 * charge * (1.0 - zap));
      p.y *= 1.0 + 0.1 * beat + 0.1 * zap;
    } else {
      // Tentacles trail the beat and wave about; discharging, they snap straight and shiver
      float wave = 1.0 - 0.8 * zap;
      p.xz *= 1.0 - 0.2 * beat;
      p.x += sin(time * 1.2 + body.y * 4.0 + phase) * 0.3 * body.y * wave;
      p.z += cos(time * 0.9 + body.y * 3.0 + phase * 1.7) * 0.3 * body.y * wave;
      p.y += sin(time * 1.5 + phase - 0.9) * 0.25 * body.y * wave;
      float shiver = jellyHash(floor(time * 40.0) + phase + body.y * 7.0) - 0.5;
      p.x += shiver * 0.18 * body.y * zap;
      p.z += (jellyHash(floor(time * 40.0) + phase * 3.0 + body.y * 5.0) - 0.5) * 0.18 * body.y * zap;
    }
    vec3 drift = vec3(sin(time * 0.21 + phase) * 2.0, sin(time * 0.33 + phase * 2.0) * 3.0, cos(time * 0.17 + phase) * 2.0);
    vec3 world = home.xyz + p * home.w + drift;
    // The bell's edge, seen side on, catches the light
    vec3 normal = normalize(position + vec3(0.0, 0.2, 0.0));
    vec3 toCamera = normalize(cameraPosition - world + vec3(1e-4));
    vEdge = body.x < 0.5 ? 1.0 - abs(dot(normal, toCamera)) : 0.5;
    vHang = body.x < 0.5 ? 0.0 : body.y;
    vCharge = charge;
    vZap = zap;
    vColor = hue.rgb;
    vec4 mvPosition = viewMatrix * vec4(world, 1.0);
    gl_Position = projectionMatrix * mvPosition;
    #include <fog_vertex>
  }
`;

const jellyFragment = /* glsl */ `
  uniform float glow;
  uniform float zapGlow;
  varying vec3 vColor;
  varying float vEdge;
  varying float vHang;
  varying float vCharge;
  varying float vZap;
  #include <fog_pars_fragment>
  void main() {
    float edge = vEdge * vEdge;
    // Brightening through the charge-up, then a burst of pale electric light over its own
    // colour while it discharges
    float energy = 1.0 + vCharge * 0.9 + vZap * zapGlow;
    vec3 color = vColor * (0.4 + edge * 1.2) * (1.0 + glow) * energy;
    color = mix(color, vec3(0.78, 0.96, 1.0) * (1.0 + glow) * (1.0 + zapGlow), vZap * 0.7);
    float alpha = min(1.0, (0.3 + edge * 0.6) * (1.0 - vHang * 0.7) * (1.0 + vZap * 0.6 + vCharge * 0.2));
    #ifdef USE_FOG
      float fogFactor = smoothstep(fogNear, fogFar, vFogDepth);
      color = mix(color, fogColor, fogFactor);
      alpha *= 1.0 - fogFactor * 0.8;
    #endif
    gl_FragColor = vec4(color, alpha);
    #include <colorspace_fragment>
  }
`;

/** A fish 1 m long, nose towards +z: a diamond of a body and a tail fin */
function fishGeometry(): THREE.InstancedBufferGeometry {
  const nose = [0, 0, 0.5];
  const tail = [0, 0, -0.3];
  const girth = [
    [0, 0.16, 0.08],
    [0.07, 0, 0.08],
    [0, -0.14, 0.08],
    [-0.07, 0, 0.08],
  ];
  const positions: number[] = [];
  for (let i = 0; i < 4; i++) {
    const a = girth[i];
    const b = girth[(i + 1) % 4];
    positions.push(...nose, ...a, ...b, ...tail, ...b, ...a);
  }
  positions.push(...tail, 0, 0.17, -0.5, 0, -0.17, -0.5);
  const bend: number[] = [];
  for (let i = 2; i < positions.length; i += 3) bend.push(Math.min(1, Math.max(0, (0.2 - positions[i]) / 0.7)));
  const geometry = new THREE.InstancedBufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("bend", new THREE.Float32BufferAttribute(bend, 1));
  return geometry;
}

/** A jellyfish with a bell 1 m in radius: a dome, and ribbons hanging from under its rim */
function jellyGeometry(): THREE.InstancedBufferGeometry {
  const dome = new THREE.SphereGeometry(1, 10, 4, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 0.8, 1).toNonIndexed();
  const positions = Array.from(dome.getAttribute("position").array as Float32Array);
  dome.dispose();
  const body: number[] = [];
  for (let i = 1; i < positions.length; i += 3) body.push(0, 1 - positions[i] / 0.8);
  const ribbons = 7;
  const segments = 5;
  for (let r = 0; r < ribbons; r++) {
    const a = (r / ribbons) * Math.PI * 2;
    const out = [Math.cos(a), Math.sin(a)];
    const length = 2 + (r % 3) * 0.5;
    const point = (s: number, k: number) => {
      const t = s / segments;
      const radius = 0.55 + k * 0.06 * (1 - t);
      return [out[0] * radius, -t * length, out[1] * radius];
    };
    for (let s = 0; s < segments; s++) {
      const quad = [point(s, -1), point(s, 1), point(s + 1, 1), point(s, -1), point(s + 1, 1), point(s + 1, -1)];
      const hang = [s, s, s + 1, s, s + 1, s + 1];
      quad.forEach((p, i) => {
        positions.push(...p);
        body.push(1, hang[i] / segments);
      });
    }
  }
  const geometry = new THREE.InstancedBufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("body", new THREE.Float32BufferAttribute(body, 2));
  return geometry;
}

/** Schools of fish and drifting jellyfish along a level's course, placed from its seed */
export class SeaLife {
  readonly meshes: THREE.Mesh<THREE.InstancedBufferGeometry, THREE.ShaderMaterial>[] = [];
  private readonly glow = { value: 0 };
  /** The race clock the jellyfish discharge on, seconds */
  private readonly raceTime = { value: 0 };
  private readonly zapCycle = { value: new THREE.Vector3(DEEP.zapCycle, DEEP.zapTelegraph, DEEP.zapActive) };
  private readonly zapGlow = { value: DEEP.zapGlow };

  constructor(world: World, spec: UnderwaterSpec) {
    const { course } = world;
    const rng = makeRng(world.seed, "sea life");
    /** Open water beside the racing line with `room` metres clear of the rock all round, or null */
    const spot = (lateral: [number, number], rise: [number, number], room: number): [number, number, number] | null => {
      for (let tries = 0; tries < 6; tries++) {
        const z = range(rng, course.start.z - 60, course.endZ + 200);
        const x = course.x(z) + (rng() < 0.5 ? -1 : 1) * range(rng, lateral[0], lateral[1]);
        const y = course.y(z) + range(rng, rise[0], rise[1]);
        if (world.rock.distance(x, y, z) > room) return [x, y, z];
      }
      return null;
    };

    const shoal: number[] = [];
    const swim: number[] = [];
    const tint: number[] = [];
    const color = new THREE.Color();
    for (let i = 0; i < spec.shoals; i++) {
      const radius = range(rng, 5, 15);
      const at = spot([12, 170], [-16, 40], radius + 4);
      // A few schools are a handful of big fish instead of a cloud of small ones
      const big = rng() < 0.15;
      const count = big ? 3 + Math.floor(rng() * 4) : 14 + Math.floor(rng() * 26);
      const length = big ? range(rng, 1.8, 2.8) : range(rng, 0.6, 1.1);
      const speed = (rng() < 0.5 ? -1 : 1) * range(rng, 2.5, 5) / radius;
      const hue = spec.fish[Math.floor(rng() * spec.fish.length)];
      if (!at) continue;
      for (let k = 0; k < count; k++) {
        shoal.push(at[0], at[1], at[2], radius);
        swim.push(rng() * Math.PI * 2, speed * range(rng, 0.85, 1.15), range(rng, -0.35, 0.35) * radius, length * range(rng, 0.8, 1.25));
        color.set(hue).multiplyScalar(range(rng, 0.85, 1.15));
        tint.push(color.r, color.g, color.b);
      }
    }
    const fog = () => THREE.UniformsUtils.clone(THREE.UniformsLib.fog);
    if (shoal.length) {
      const geometry = fishGeometry();
      geometry.setAttribute("shoal", new THREE.InstancedBufferAttribute(new Float32Array(shoal), 4));
      geometry.setAttribute("swim", new THREE.InstancedBufferAttribute(new Float32Array(swim), 4));
      geometry.setAttribute("tint", new THREE.InstancedBufferAttribute(new Float32Array(tint), 3));
      geometry.instanceCount = shoal.length / 4;
      const material = new THREE.ShaderMaterial({
        uniforms: { ...fog(), atmoSunColor: ATMOSPHERE.sunColor, glow: this.glow, time: fxTime },
        vertexShader: fishVertex,
        fragmentShader: fishFragment,
        side: THREE.DoubleSide,
        fog: true,
      });
      this.add(geometry, material);
    }

    const home: number[] = [];
    const hues: number[] = [];
    for (let i = 0; i < spec.jellyfish; i++) {
      // Mostly small, now and then a giant further out. A share of them (DEEP.jellyNear, for the
      // next map) hang beside the racing line where a pilot can reach them, bigger than the small
      // scenery ones so they read at speed; the rest, and every giant, drift further out as scenery
      const giant = rng() < 0.12;
      const near = !giant && rng() < DEEP.jellyNear;
      const size = giant ? range(rng, 4, 7) : near ? range(rng, NEAR_SIZE[0], NEAR_SIZE[1]) : range(rng, 0.8, 2.4);
      const at = near ? spot(NEAR_LATERAL, NEAR_RISE, size + NEAR_ROOM) : spot([giant ? 40 : 8, 190], [-18, 60], size * 3 + 4);
      const hue = spec.jelly[Math.floor(rng() * spec.jelly.length)];
      const phase = rng() * Math.PI * 2;
      if (!at) continue;
      home.push(at[0], at[1], at[2], size);
      color.set(hue);
      hues.push(color.r, color.g, color.b, phase);
    }
    if (home.length) {
      const geometry = jellyGeometry();
      geometry.setAttribute("home", new THREE.InstancedBufferAttribute(new Float32Array(home), 4));
      geometry.setAttribute("hue", new THREE.InstancedBufferAttribute(new Float32Array(hues), 4));
      geometry.instanceCount = home.length / 4;
      const material = new THREE.ShaderMaterial({
        uniforms: { ...fog(), glow: this.glow, time: fxTime, raceTime: this.raceTime, zapCycle: this.zapCycle, zapGlow: this.zapGlow },
        vertexShader: jellyVertex,
        fragmentShader: jellyFragment,
        side: THREE.DoubleSide,
        transparent: true,
        depthWrite: false,
        fog: true,
      });
      this.add(geometry, material).renderOrder = 2;
    }
  }

  private add(geometry: THREE.InstancedBufferGeometry, material: THREE.ShaderMaterial) {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.frustumCulled = false;
    this.meshes.push(mesh);
    return mesh;
  }

  /**
   * `life`: how brightly they glow, on top of the level's own light (dim by day, bright at
   * night). `raceTime`: seconds on the race clock, which the jellyfish discharge on
   */
  update(life: number, raceTime: number) {
    this.glow.value = FX_LIGHT.glow.value * life;
    this.raceTime.value = raceTime;
    this.zapCycle.value.set(DEEP.zapCycle, DEEP.zapTelegraph, DEEP.zapActive);
    this.zapGlow.value = DEEP.zapGlow;
  }

  dispose() {
    for (const mesh of this.meshes) {
      mesh.geometry.dispose();
      mesh.material.dispose();
    }
  }
}
