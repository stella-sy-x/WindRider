import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { sceneryTime as fxTime } from "../particles";
import { makeRng, range } from "../rng";
import { FX_LIGHT } from "../toon";
import { DEEP } from "../tuning";
import { ATMOSPHERE } from "./atmosphere";
import type { UnderwaterSpec } from "./biomes/types";
import { lookFor } from "./look";
import type { Palette } from "./palette";
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
const NEAR_SIZE: [number, number] = [1.6, 2.8];
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
  attribute vec2 body; // 0: the bell, 1: a tentacle, 2: the shock hoop; then how far towards the rim or down the tentacle
  attribute vec4 home; // where it drifts, and its size
  attribute vec4 hue; // color, and its own phase
  uniform float time;
  uniform float raceTime;
  uniform vec3 zapCycle; // seconds: the whole cycle, the charge-up telegraph, the discharge
  uniform float tentacleLength; // the tentacles' length as a share of the model's
  uniform vec2 viewRange; // metres from the camera: where a jellyfish starts to shrink away, and where it is gone
  varying float vShow;
  varying vec3 vColor;
  varying float vEdge;
  varying float vHang;
  varying float vCharge;
  varying float vZap;
  attribute float texSel; // which texture this vertex samples (0 bell, 1 tentacle)
  varying float vBell; // 1 on the bell (the model's dome and what hangs inside it)
  varying vec2 vUvB;
  varying float vTexSel;
  varying float vShell; // 1 on the shock hoop; then how far it has spread (0 just born, 1 gone) and how squarely its tube faces us
  varying float vShellSpread;
  varying float vShellRim;
  #include <fog_pars_vertex>
  float jellyHash(float x) { return fract(sin(x * 12.9898) * 43758.5453); }
  void main() {
    float phase = hue.w;
    float beat = sin(time * 1.5 + phase);
    // Where in its discharge cycle this one is (the same arithmetic as jellyCycle in deep.ts)
    float cycle = max(zapCycle.x, 0.1);
    float telegraph = clamp(zapCycle.y, 0.01, cycle);
    float burst = clamp(zapCycle.z, 0.01, cycle - telegraph);
    float ct = mod(raceTime + (phase / ${TAU.toFixed(6)}) * cycle, cycle);
    float charge = ct < telegraph ? ct / telegraph : (ct < telegraph + burst ? 1.0 : 0.0);
    float zap = (ct >= telegraph && ct < telegraph + burst) ? 1.0 : 0.0;
    vec3 p = position;
    // The shock hoop rolls out from the bell's rim to 3.5x its radius over the first 0.5 s of
    // the discharge, its tube thickening a little as it goes; the rest of the time it sits
    // collapsed at the bell's heart (zero size)
    float spread = clamp((ct - telegraph) / 0.5, 0.0, 1.0) * zap;
    vShell = body.x > 1.5 ? 1.0 : 0.0;
    vShellSpread = spread;
    vShellRim = 0.0;
    vec3 hoopNormal = vec3(0.0, 1.0, 0.0);
    if (body.x > 1.5) {
      // Where this vertex sits round the hoop, and its offset from the tube's centre line
      vec3 spoke = normalize(vec3(position.x, 0.0, position.z) + vec3(1e-5, 0.0, 0.0));
      vec3 tube = position - spoke;
      hoopNormal = normalize(tube + vec3(1e-5));
      p = (spoke * (1.0 + 2.5 * spread) + tube * (1.0 + 1.5 * spread)) * zap + vec3(0.0, 0.1, 0.0);
    } else if (body.x < 0.5) {
      // The bell squeezes in at the rim and springs open again; charging, it draws in tight
      p.xz *= (1.0 - 0.2 * beat * body.y) * (1.0 - 0.15 * charge * (1.0 - zap));
      p.y *= 1.0 + 0.1 * beat + 0.1 * zap;
    } else {
      // Tentacles trail the beat and wave about; discharging, they snap straight and shiver
      float wave = 1.0 - 0.8 * zap;
      p.y *= tentacleLength;
      p.xz *= 1.0 - 0.2 * beat;
      p.x += sin(time * 1.2 + body.y * 4.0 + phase) * 0.3 * body.y * wave;
      p.z += cos(time * 0.9 + body.y * 3.0 + phase * 1.7) * 0.3 * body.y * wave;
      p.y += sin(time * 1.5 + phase - 0.9) * 0.25 * body.y * wave;
      float shiver = jellyHash(floor(time * 40.0) + phase + body.y * 7.0) - 0.5;
      p.x += shiver * 0.18 * body.y * zap;
      p.z += (jellyHash(floor(time * 40.0) + phase * 3.0 + body.y * 5.0) - 0.5) * 0.18 * body.y * zap;
    }
    vec3 drift = vec3(sin(time * 0.21 + phase) * 2.0, sin(time * 0.33 + phase * 2.0) * 3.0, cos(time * 0.17 + phase) * 2.0);
    // Out of view range a jellyfish shrinks to nothing and costs no pixels at all
    float show = 1.0 - smoothstep(viewRange.x, viewRange.y, distance(cameraPosition, home.xyz));
    vShow = show;
    vec3 world = home.xyz + p * home.w * show + drift;
    // The bell's edge, seen side on, catches the light
    vec3 normal = normalize(position + vec3(0.0, 0.2, 0.0));
    vec3 toCamera = normalize(cameraPosition - world + vec3(1e-4));
    vEdge = body.x < 0.5 ? 1.0 - abs(dot(normal, toCamera)) : 0.5;
    // The hoop's tube is shaded round: brightest where it faces us, darker on its flanks
    if (body.x > 1.5) vShellRim = abs(dot(hoopNormal, toCamera));
    vHang = body.x < 0.5 ? 0.0 : body.y;
    vCharge = charge;
    vZap = zap;
    vColor = hue.rgb;
    vBell = body.x < 0.5 ? 1.0 : 0.0;
    vUvB = uv;
    vTexSel = texSel;
    vec4 mvPosition = viewMatrix * vec4(world, 1.0);
    gl_Position = projectionMatrix * mvPosition;
    #include <fog_vertex>
  }
`;

const jellyFragment = /* glsl */ `
  uniform float glow;
  uniform float zapGlow;
  uniform sampler2D bellMap; // the model's textures as luminance + alpha: the bell's, and the tentacles'
  uniform sampler2D tentacleMap;
  uniform float bellFill; // the bell's opacity
  uniform float alphaCut; // fragments fainter than this are dropped (the bell's material, which writes depth)
  varying float vShow;
  varying vec3 vColor;
  varying float vEdge;
  varying float vHang;
  varying float vCharge;
  varying float vZap;
  varying float vBell;
  varying vec2 vUvB;
  varying float vTexSel;
  varying float vShell;
  varying float vShellSpread;
  varying float vShellRim;
  #include <fog_pars_fragment>
  void main() {
    float edge = vEdge * vEdge;
    // Brightening through the charge-up, then a burst of pale electric light over its own
    // colour while it discharges
    // (brightness and the shift to electric white are separate: zapGlow scales only the
    // former, and the result is capped just under the bloom threshold so the burst stays crisp)
    float energy = 1.0 + vCharge * 0.9 + vZap * zapGlow;
    vec3 color = vColor * (0.4 + edge * 1.2) * (1.0 + glow) * energy;
    color = mix(color, vec3(0.78, 0.96, 1.0) * (1.0 + glow), vZap * 0.55);
    float alpha = (0.3 + edge * 0.6) * (1.0 - vHang * 0.7) * (1.0 + vZap * 0.6 + vCharge * 0.2);
    if (vShell < 0.5) {
      // The model's parts: the author's shading (luminance, with its ribs and lines) in the
      // jellyfish's own colour, its alpha, the bell as opaque as bellFill says
      vec4 tex = mix(texture2D(bellMap, vUvB), texture2D(tentacleMap, vUvB), vTexSel);
      color *= 0.3 + tex.r * 1.1;
      alpha = tex.a * clamp(alpha * 0.5 + 0.5, 0.0, 1.0) * (vBell > 0.5 ? bellFill : 1.0);
    }
    color = min(color, vec3(1.25));
    alpha = min(1.0, alpha);
    if (vShell > 0.5) {
      // The shock hoop: a tube of electric light, rounded by its facing, fading as it rolls out
      float facing = 0.45 + 0.55 * vShellRim;
      color = min(vec3(0.78, 0.96, 1.0) * (1.0 + glow) * facing * 1.2, vec3(1.25));
      alpha = (0.35 + 0.5 * vShellRim) * (1.0 - vShellSpread) * vZap;
    }
    #ifdef USE_FOG
      float fogFactor = smoothstep(fogNear, fogFar, vFogDepth);
      color = mix(color, fogColor, fogFactor);
      alpha *= 1.0 - fogFactor * 0.8;
    #endif
    alpha *= vShow;
    if (alpha < alphaCut) discard;
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

// The jellyfish model: chinabazooka's "Jellyfish" (CC BY 4.0, see CREDITS.md), decimated to
// 3.4k triangles, bell radius 1 with its rim at y = 0 and the tentacles hanging to y ≈ -4.2.
// Its COLOR_0 tags each vertex: r 0 bell / 1 tentacle, g how far down that part (0..1),
// b which texture it samples (0 bell, 1 tentacle). The textures are the author's, reduced
// to 512 px luminance + alpha, so each jellyfish can wear its own colour
const MODEL_URL = import.meta.env.BASE_URL + "models/jellyfish.glb";
const BELL_MAP_URL = import.meta.env.BASE_URL + "models/jellyfish-bell.png";
const TENTACLE_MAP_URL = import.meta.env.BASE_URL + "models/jellyfish-tentacle.png";

/** The model as the builder wants it: non-indexed positions, uvs and tags, and the two textures */
interface JellyModel {
  positions: Float32Array;
  uvs: Float32Array;
  /** Per vertex: part, how far down it, texture select (COLOR_0, normalised: read it through getX/Y/Z) */
  tags: THREE.BufferAttribute;
  bellMap: THREE.Texture;
  tentacleMap: THREE.Texture;
}

let model: Promise<JellyModel> | null = null;

/** Fetched once and shared by every level (never disposed) */
function loadModel(): Promise<JellyModel> {
  model ??= Promise.all([
    new GLTFLoader().loadAsync(MODEL_URL),
    new THREE.TextureLoader().loadAsync(BELL_MAP_URL),
    new THREE.TextureLoader().loadAsync(TENTACLE_MAP_URL),
  ]).then(([gltf, bellMap, tentacleMap]) => {
    let mesh: THREE.Mesh | null = null;
    gltf.scene.traverse((o) => {
      if (!mesh && (o as THREE.Mesh).isMesh) mesh = o as THREE.Mesh;
    });
    if (!mesh) throw new Error("jellyfish.glb has no mesh");
    const found = mesh as THREE.Mesh;
    const geometry = found.geometry.index ? found.geometry.toNonIndexed() : found.geometry;
    const tags = geometry.getAttribute("color") as THREE.BufferAttribute | undefined;
    if (!tags) throw new Error("jellyfish.glb has no COLOR_0 tags");
    for (const map of [bellMap, tentacleMap]) {
      map.colorSpace = THREE.SRGBColorSpace;
      map.wrapS = map.wrapT = THREE.RepeatWrapping;
    }
    return {
      positions: geometry.getAttribute("position").array as Float32Array,
      uvs: geometry.getAttribute("uv").array as Float32Array,
      tags,
      bellMap,
      tentacleMap,
    };
  });
  return model;
}

/**
 * A jellyfish with a bell 1 m in radius: the model (bell, the structure inside it, the
 * tentacles) and the shock hoop. `body` tags each vertex for the shaders, `texSel` picks
 * its texture, `uv` only means something on the model's parts
 */
function jellyGeometry(source: JellyModel): THREE.InstancedBufferGeometry {
  const uvs = source.uvs;
  // Two draw groups: the bell (and what hangs inside it) first, drawn solid, front faces
  // only, writing depth, so the nearest bell hides what is behind it; then the tentacles
  // and the hoop, blended. Triangles are sorted into that order here
  const positions: number[] = [];
  const bodyOut: number[] = [];
  const uvOut: number[] = [];
  const texOut: number[] = [];
  const triangles = source.positions.length / 9;
  let bellVertices = 0;
  for (const wantTentacle of [false, true]) {
    for (let t = 0; t < triangles; t++) {
      const tentacle = source.tags.getX(t * 3) > 0.5;
      if (tentacle !== wantTentacle) continue;
      for (let v = 0; v < 3; v++) {
        const i = t * 3 + v;
        positions.push(source.positions[i * 3], source.positions[i * 3 + 1], source.positions[i * 3 + 2]);
        uvOut.push(uvs[i * 2], uvs[i * 2 + 1]);
        bodyOut.push(tentacle ? 1 : 0, source.tags.getY(i));
        texOut.push(source.tags.getZ(i) > 0.5 ? 1 : 0);
      }
    }
    if (!wantTentacle) bellVertices = positions.length / 3;
  }
  // The shock hoop: a torus round the bell's rim (major radius 1, in the xz plane) that the
  // vertex shader keeps collapsed to a point until a discharge, then throws outwards and
  // fades: a hula hoop of electric light rolling off the burst
  const hoop = new THREE.TorusGeometry(1, 0.09, 5, 18).rotateX(Math.PI / 2).toNonIndexed();
  const hoopPositions = hoop.getAttribute("position").array as Float32Array;
  hoop.dispose();
  for (let i = 0; i < hoopPositions.length; i += 3) {
    positions.push(hoopPositions[i], hoopPositions[i + 1], hoopPositions[i + 2]);
    bodyOut.push(2, 0);
    uvOut.push(0, 0);
    texOut.push(0);
  }
  const geometry = new THREE.InstancedBufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("body", new THREE.Float32BufferAttribute(bodyOut, 2));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvOut, 2));
  geometry.setAttribute("texSel", new THREE.Float32BufferAttribute(texOut, 1));
  const total = positions.length / 3;
  geometry.addGroup(0, bellVertices, 0);
  geometry.addGroup(bellVertices, total - bellVertices, 1);
  return geometry;
}

/** Schools of fish and drifting jellyfish along a level's course, placed from its seed */
export class SeaLife {
  /** Everything swimming: add this to the scene (the jellyfish join it once their bell model has loaded) */
  readonly group = new THREE.Group();
  readonly meshes: THREE.Mesh<THREE.InstancedBufferGeometry, THREE.ShaderMaterial | THREE.ShaderMaterial[]>[] = [];
  private disposed = false;
  private readonly glow = { value: 0 };
  /** The mood, for its look.deep (how the life looks; set every frame in update) */
  private readonly palette: Palette;
  /** The bell's opacity, 0..1 (look.deep.jellyFill) */
  private readonly bellFill = { value: 1 };
  /** The tentacles' length as a share of the model's (look.deep.jellyTentacle) */
  private readonly tentacleLength = { value: 1 };
  /** Metres from the camera where a jellyfish starts to shrink away, and where it is gone (DEEP.jellyView) */
  private readonly viewRange = { value: new THREE.Vector2(DEEP.jellyView - 40, DEEP.jellyView) };
  /** The race clock the jellyfish discharge on, seconds */
  private readonly raceTime = { value: 0 };
  private readonly zapCycle = { value: new THREE.Vector3(DEEP.zapCycle, DEEP.zapTelegraph, DEEP.zapActive) };
  private readonly zapGlow = { value: 1 };

  constructor(world: World, spec: UnderwaterSpec) {
    const { course } = world;
    this.palette = world.palette;
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
      const size = giant ? range(rng, 2.5, 4) : near ? range(rng, NEAR_SIZE[0], NEAR_SIZE[1]) : range(rng, 0.8, 1.8);
      const at = near ? spot(NEAR_LATERAL, NEAR_RISE, size + NEAR_ROOM) : spot([giant ? 40 : 8, 190], [-18, 60], size * 3 + 4);
      const hue = spec.jelly[Math.floor(rng() * spec.jelly.length)];
      const phase = rng() * Math.PI * 2;
      if (!at) continue;
      home.push(at[0], at[1], at[2], size);
      color.set(hue);
      hues.push(color.r, color.g, color.b, phase);
    }
    if (home.length) {
      // The jellyfish pop in once the shared bell model has arrived
      loadModel().then(
        (source) => {
          if (this.disposed) return;
          const geometry = jellyGeometry(source);
          geometry.setAttribute("home", new THREE.InstancedBufferAttribute(new Float32Array(home), 4));
          geometry.setAttribute("hue", new THREE.InstancedBufferAttribute(new Float32Array(hues), 4));
          geometry.instanceCount = home.length / 4;
          const uniforms = () => ({
            ...fog(),
            glow: this.glow,
            time: fxTime,
            raceTime: this.raceTime,
            zapCycle: this.zapCycle,
            zapGlow: this.zapGlow,
            bellMap: { value: source.bellMap },
            tentacleMap: { value: source.tentacleMap },
            bellFill: this.bellFill,
            tentacleLength: this.tentacleLength,
            viewRange: this.viewRange,
          });
          // The bell: solid enough to write depth and cut its faint edges, front faces only, so
          // one bell in front hides the ones behind instead of blending over them
          const bell = new THREE.ShaderMaterial({
            uniforms: { ...uniforms(), alphaCut: { value: 0.3 } },
            vertexShader: jellyVertex,
            fragmentShader: jellyFragment,
            side: THREE.FrontSide,
            transparent: true,
            depthWrite: true,
            fog: true,
          });
          // The tentacles and the hoop: blended, no depth
          const soft = new THREE.ShaderMaterial({
            uniforms: { ...uniforms(), alphaCut: { value: 0.0 } },
            vertexShader: jellyVertex,
            fragmentShader: jellyFragment,
            side: THREE.DoubleSide,
            transparent: true,
            depthWrite: false,
            fog: true,
          });
          this.add(geometry, [bell, soft]).renderOrder = 2;
        },
        () => {},
      );
    }
  }

  private add(geometry: THREE.InstancedBufferGeometry, material: THREE.ShaderMaterial | THREE.ShaderMaterial[]) {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.frustumCulled = false;
    this.meshes.push(mesh);
    this.group.add(mesh);
    return mesh;
  }

  /**
   * `life`: how brightly they glow, on top of the level's own light (dim by day, bright at
   * night). `raceTime`: seconds on the race clock, which the jellyfish discharge on
   */
  update(life: number, raceTime: number) {
    this.glow.value = FX_LIGHT.glow.value * life;
    this.raceTime.value = raceTime;
    const deep = lookFor(this.palette).deep;
    this.zapCycle.value.set(DEEP.zapCycle, DEEP.zapTelegraph, DEEP.zapActive);
    this.zapGlow.value = deep.zapGlow;
    this.bellFill.value = deep.jellyFill;
    this.tentacleLength.value = deep.jellyTentacle;
    this.viewRange.value.set(Math.max(DEEP.jellyView - 40, 1), Math.max(DEEP.jellyView, 2));
  }

  dispose() {
    this.disposed = true;
    for (const mesh of this.meshes) {
      mesh.geometry.dispose();
      for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) material.dispose();
    }
  }
}
