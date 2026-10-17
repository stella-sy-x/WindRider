import * as THREE from "three";
import { FX_LIGHT, sceneryTime as fxTime, pixelScale } from "../particles";
import { makeRng, range } from "../rng";
import { GOLD } from "../toon";
import { RINGS } from "../tuning";
import type { Ring } from "./course";

// The gates: a cohort of floating crystals around every ring, each bobbing and
// turning on its own, orbiting a ring of glowing motes that trace the gate.
// Passing a gate makes its crystals flare white, burst outward and dissolve,
// and the motes flash and scatter. In a race every gate is an optional speed
// boost: all the gates still to take glow a little, the finish (the one goal)
// glows fully, and taken ones stay gone. The gates are landmarks of the world,
// not power-ups: their stone is muted, a soft grey-blue and a warm sand tinted
// a touch by the biome, so they sit in the landscape; only the finish is gold
// and only the finish raises a pillar of light. All gates share three draw
// calls (crystals, motes, the finish beam); the motion runs in the vertex
// shader from a few numbers per gate.

export type RingMode = "race" | "free" | "hidden";

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));

/** The gates' muted stone, as the crystal and mote shaders use it (`ice` unlit, `accent` when lit) */
export interface GateColors {
  ice: THREE.Color;
  accent: THREE.Color;
}

/**
 * The gates' colors for a biome: soft grey-blue stone and a warm sand glow, each tinted a little
 * by the biome's accent so a gate belongs to its world without taking on its neon
 */
export function gateColors(biomeAccent: THREE.ColorRepresentation): GateColors {
  const accent = new THREE.Color(biomeAccent);
  return {
    ice: new THREE.Color("#c8d8e0").lerp(accent, 0.08),
    accent: new THREE.Color("#e8d8c0").lerp(accent, 0.15),
  };
}

/** Per-gate state on the CPU; uploaded as one vec4 per gate */
interface GateState {
  visible: number; // 0..1, crystals grow in and out
  highlight: number; // 0..1, how brightly it glows: a little for a gate still to take, fully for the finish
  passedAt: number; // fxTime of the last pass, or -1e3
  passed: boolean; // taken this race: it stays gone until the next one
}

const crystalVertex = /* glsl */ `
  attribute float gate;
  attribute vec4 crystal; // angle, distance from the center, phase, tilt
  attribute vec3 size; // half-length, thickness, lean
  uniform vec4 gates[GATE_COUNT]; // visible, highlight, passedAt, finish
  uniform float time;
  uniform vec4 motion; // drift, drift rate, spin, self-spin
  uniform float passDuration;
  varying vec3 vViewPosition;
  varying float vHighlight;
  varying float vFlash;
  varying float vFinish;
  varying float vSeed;
  #include <fog_pars_vertex>

  mat3 rotX(float a) { float c = cos(a), s = sin(a); return mat3(1.0, 0.0, 0.0, 0.0, c, s, 0.0, -s, c); }
  mat3 rotY(float a) { float c = cos(a), s = sin(a); return mat3(c, 0.0, -s, 0.0, 1.0, 0.0, s, 0.0, c); }
  mat3 rotZ(float a) { float c = cos(a), s = sin(a); return mat3(c, s, 0.0, -s, c, 0.0, 0.0, 0.0, 1.0); }

  void main() {
    vec4 g = gates[int(gate + 0.5)];
    float since = time - g.z;
    float k = since >= 0.0 && since < passDuration ? since / passDuration : 0.0;
    float passing = since >= 0.0 && since < passDuration ? 1.0 : 0.0;

    float phase = crystal.z;
    float angle = crystal.x + time * motion.z + passing * k * k * 2.5;
    float bob = sin(time * motion.y * 6.2831 + phase) * motion.x;
    float burst = passing * pow(k, 0.6) * 10.0;
    float radius = crystal.y + bob * 0.4 + burst;
    float pulse = 1.0 + g.y * 0.12 * sin(time * 4.0 + phase);
    float scale = g.x * pulse * (1.0 - passing * smoothstep(0.45, 1.0, k)) * (1.0 + passing * 0.35 * sin(3.14159 * min(k * 2.5, 1.0)));

    vec3 p = position * vec3(size.y, size.x, size.y) * scale;
    p = rotY(time * motion.w * (0.6 + 0.8 * fract(phase)) + phase + passing * k * 14.0) * p;
    p = rotX(crystal.w) * p;
    p = rotZ(angle - 1.5708 + size.z) * p;
    p += vec3(cos(angle) * radius, sin(angle) * radius, bob + passing * k * 3.0);

    vec4 mvPosition = modelViewMatrix * instanceMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mvPosition;
    vViewPosition = mvPosition.xyz;
    vHighlight = g.y;
    vFlash = passing * (exp(-k * 5.0) * 1.4 + 0.25 * (1.0 - k));
    vFinish = g.w;
    vSeed = phase;
    #include <fog_vertex>
  }
`;

const crystalFragment = /* glsl */ `
  uniform vec3 ice;
  uniform vec3 accent;
  uniform vec3 gold;
  uniform vec3 sunDirection; // view space
  uniform float glow;
  uniform float time;
  varying vec3 vViewPosition;
  varying float vHighlight;
  varying float vFlash;
  varying float vFinish;
  varying float vSeed;
  #include <fog_pars_fragment>

  void main() {
    // Flat facets from screen-space derivatives
    vec3 n = normalize(cross(dFdx(vViewPosition), dFdy(vViewPosition)));
    vec3 v = normalize(-vViewPosition);
    float facing = abs(dot(n, v));
    float fresnel = pow(clamp(1.0 - facing, 0.0, 1.0), 2.2);
    float diffuse = abs(dot(n, sunDirection)) * 0.5 + 0.5;
    float spec = pow(max(dot(reflect(-sunDirection, n), v), 0.0), 28.0);
    float facet = fract(sin(dot(floor(n * 3.0 + vSeed), vec3(12.9898, 78.233, 37.719))) * 43758.5453);

    vec3 base = mix(mix(ice, accent, vHighlight), gold, vFinish);
    vec3 color = base * (0.35 + 0.45 * diffuse + 0.3 * facet);
    // Soft rims in the stone's own color, a quiet highlight: glowing stone, not a cut gem.
    // The finish keeps a brighter rim, the one gate meant to be seen from afar
    float rim = 0.35 + vHighlight * 0.5 * glow + vFinish * 0.5;
    color += fresnel * mix(base, vec3(1.0), 0.3 + vFinish * 0.3) * rim;
    color += spec * (0.7 + vFinish * 0.8);
    color *= 1.0 + vHighlight * glow * (0.3 + 0.15 * sin(time * 3.0 + vSeed));
    color += vFlash * vec3(3.2, 3.0, 2.6);

    #ifdef USE_FOG
      float fogFactor = smoothstep(fogNear, fogFar, vFogDepth) * (1.0 - vHighlight);
      color = mix(color, fogColor, fogFactor);
    #endif
    gl_FragColor = vec4(color, 1.0);
  }
`;

// The gate ring: a circle of glowing motes, one point each, drawn as a single
// THREE.Points for every gate. Each mote sits at its place on the ring in world
// space and wanders a little in the vertex shader: in and out along the ring
// (`radial`) and through it (`axis`). A lit gate's motes breathe together and
// glow; a pass flashes them white and scatters them outward as they fade.
const moteVertex = /* glsl */ `
  attribute float gate;
  attribute vec3 radial; // unit, from the ring's center out to this mote
  attribute vec3 axis; // unit, the way you fly through the gate
  attribute vec4 mote; // angle on the ring, ring radius, phase, twinkle rate
  uniform vec4 gates[GATE_COUNT]; // visible, highlight, passedAt, finish
  uniform float time;
  uniform float passDuration;
  uniform float pixelScale;
  uniform vec2 moteLook; // size (m, for a 13 m ring), drift (m)
  varying vec4 vGate;
  varying float vK;
  varying float vFade;
  #include <fog_pars_vertex>

  void main() {
    vGate = gates[int(gate + 0.5)];
    float since = time - vGate.z;
    vK = since >= 0.0 && since < passDuration ? since / passDuration : -1.0;
    float passing = vK >= 0.0 ? 1.0 : 0.0;
    float k = max(vK, 0.0);
    float angle = mote.x;
    float phase = mote.z;
    // Smaller gates get smaller motes, and shorter wanders
    float fit = min(1.0, mote.y / 13.0);

    // Each mote drifts on its own; a lit gate's motes also breathe as one
    float wander = moteLook.y * fit;
    float outward = sin(time * 1.1 + phase) * wander + vGate.y * 0.18 * fit * sin(time * 2.0 + angle);
    float through = sin(time * 0.8 + phase * 1.7) * wander * 1.6;
    // The pass: motes scatter outward and thin out as the crystals dissolve
    outward += passing * pow(k, 0.6) * mote.y * 0.25;
    through += passing * k * 2.0 * fit;
    vec3 p = position + radial * outward + axis * through;

    vec4 mvPosition = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mvPosition;

    // A slow twinkle, and a soft glint travelling around the ring
    float twinkle = 0.75 + 0.25 * sin(time * mote.w + phase);
    float shimmer = 0.85 + 0.15 * sin(angle * 3.0 - time * 1.6);
    float scale = vGate.x * (1.0 - passing * smoothstep(0.4, 1.0, k));
    float size = moteLook.x * fit * twinkle * (1.0 + vGate.y * 0.45) * (1.0 + passing * 0.9 * sin(3.14159 * min(k * 2.0, 1.0)));
    float px = size * scale * pixelScale / max(0.1, -mvPosition.z);
    // Far off a mote would shrink below a pixel and flicker: hold it at a few pixels and dim it instead
    float least = 2.5 * step(0.001, scale);
    vFade = scale * shimmer * twinkle * min(1.0, px / max(least, 0.001));
    gl_PointSize = min(max(px, least), 96.0);
    #include <fog_vertex>
  }
`;

const moteFragment = /* glsl */ `
  uniform vec3 ice;
  uniform vec3 accent;
  uniform vec3 gold;
  uniform float glow;
  uniform float boost;
  varying vec4 vGate;
  varying float vK;
  varying float vFade;
  #include <fog_pars_fragment>

  void main() {
    vec2 uv = gl_PointCoord * 2.0 - 1.0;
    float r2 = dot(uv, uv);
    if (r2 > 1.0) discard;
    // A soft glowing dot: a wide halo with a brighter heart
    float a = exp(-r2 * 4.0) * 0.7 + exp(-r2 * 16.0) * 0.5;

    vec3 base = mix(mix(ice, accent, vGate.y), gold, vGate.w);
    // Quiet when idle, lit up for the gates still to take and most for the finish
    float lit = 0.4 + vGate.y * 1.1 * glow + vGate.w * 0.4;
    vec3 color = mix(base, vec3(1.0), 0.2 + vGate.y * 0.2) * lit;
    if (vK >= 0.0) {
      // The pass: the whole ring flashes white and fades
      color += exp(-vK * 7.0) * 2.6 * mix(vec3(1.0), base, 0.2);
    }
    color *= a * vFade * boost;
    #ifdef USE_FOG
      color *= 1.0 - smoothstep(fogNear, fogFar, vFogDepth) * (1.0 - vGate.y);
    #endif
    if (max(color.r, max(color.g, color.b)) < 0.002) discard;
    gl_FragColor = vec4(color, 1.0);
  }
`;

// A pillar of gold light rising from the finish gate alone, the race's beacon, visible from the start line.
// The other gates raise none: they are optional pickups, not the way to go
const beamVertex = /* glsl */ `
  attribute float gate;
  uniform vec4 gates[GATE_COUNT];
  uniform float time;
  uniform float passDuration;
  varying float vHeight;
  varying float vFacing;
  varying float vAngle;
  varying vec4 vGate;
  varying float vK;
  varying float vDepth;
  void main() {
    vGate = gates[int(gate + 0.5)];
    float since = time - vGate.z;
    vK = since >= 0.0 && since < passDuration ? since / passDuration : -1.0;
    vHeight = position.y;
    vAngle = atan(position.z, position.x);
    vec4 mvPosition = modelViewMatrix * instanceMatrix * vec4(position, 1.0);
    vec3 n = normalize(normalMatrix * mat3(instanceMatrix) * normal);
    vFacing = abs(dot(n, normalize(-mvPosition.xyz)));
    vDepth = -mvPosition.z;
    gl_Position = projectionMatrix * mvPosition;
  }
`;

const beamFragment = /* glsl */ `
  uniform vec3 ice;
  uniform vec3 accent;
  uniform vec3 gold;
  uniform float glow;
  uniform float time;
  uniform float finishBeam;
  varying float vHeight;
  varying float vFacing;
  varying float vAngle;
  varying vec4 vGate;
  varying float vK;
  varying float vDepth;
  void main() {
    // Only the finish (gold, slowly breathing) has a pillar; vGate.w is its finish flag, so any other
    // gate's instance (there are none, but a stale buffer would draw nothing) is discarded. A flare
    // runs up it on a pass
    float breathe = 1.0 + 0.12 * sin(time * 1.3);
    float strength = vGate.x * vGate.w * finishBeam * breathe;
    if (vK >= 0.0) strength += vGate.w * (1.0 - vK) * 1.5 * step(abs(vHeight - vK * 1.2), 0.25);
    if (strength < 0.002) discard;
    float streaks = 0.65 + 0.35 * sin(vHeight * 60.0 - time * 2.5 + vAngle * 3.0);
    // pow() of a negative number is NaN, and bloom would smear one NaN pixel over the whole screen.
    // The finish pillar fades more slowly up its (taller) length, so it reads from the start line
    float fade = pow(clamp(1.0 - vHeight, 0.0, 1.0), mix(2.2, 1.6, vGate.w)) * smoothstep(0.0, 0.03, vHeight);
    float soft = pow(clamp(vFacing, 0.0, 1.0), 1.5);
    // Close up it would fill the screen: fade it out near the camera
    float near = smoothstep(20.0, 120.0, vDepth);
    vec3 base = mix(accent, gold, vGate.w);
    vec3 color = mix(base, vec3(1.0), 0.3) * strength * streaks * fade * soft * near * glow * 0.9;
    gl_FragColor = vec4(color, 1.0);
  }
`;

/** A crystal: a six-sided spindle, long axis y, from -1 to 1 */
function crystalGeometry(): THREE.BufferGeometry {
  const profile = [
    [0, -1],
    [0.42, -0.5],
    [0.5, 0.15],
    [0.38, 0.55],
    [0, 1],
  ].map(([r, y]) => new THREE.Vector2(r, y));
  const geometry = new THREE.LatheGeometry(profile, 6).toNonIndexed();
  geometry.deleteAttribute("uv");
  geometry.deleteAttribute("normal");
  return geometry;
}

const tmpMatrix = new THREE.Matrix4();
const tmpQuaternion = new THREE.Quaternion();
const tmpScale = new THREE.Vector3();
const Z = new THREE.Vector3(0, 0, 1);

export class CrystalGates {
  readonly group = new THREE.Group();
  private readonly rings: Ring[];
  private readonly states: GateState[];
  private readonly gateUniform: THREE.Vector4[];
  private readonly materials: THREE.ShaderMaterial[] = [];
  private readonly geometries: THREE.BufferGeometry[] = [];
  private readonly sunView = new THREE.Vector3();
  private readonly sunDirection: THREE.Vector3;
  /** Per gate: the crystals' angle and distance from the center, for particle bursts */
  private readonly layout: { angle: number; radius: number }[][] = [];
  private mode: RingMode = "free";
  private readonly crystals: THREE.InstancedMesh;
  /** The ring motes of every gate, `motesPerGate` each in gate order */
  private readonly motes: THREE.Points;
  private readonly motesPerGate: number;
  /** Per gate: its first crystal's instance */
  private readonly firstCrystal: number[] = [];
  /** Per gate: the direction it faces now (Resonance can turn it; looks only, the run keeps its own) */
  private readonly facing: THREE.Vector3[];

  constructor(seed: number, rings: Ring[], colors: GateColors, sunDirection: THREE.Vector3) {
    this.rings = rings;
    this.sunDirection = sunDirection;
    this.states = rings.map(() => ({ visible: 1, highlight: 0, passedAt: -1e3, passed: false }));
    this.facing = rings.map((r) => r.normal.clone());
    this.gateUniform = rings.map((r) => new THREE.Vector4(1, 0, -1e3, r.finish ? 1 : 0));
    const defines = { GATE_COUNT: Math.max(1, rings.length) };
    const shared = {
      gates: { value: this.gateUniform },
      time: fxTime,
      passDuration: { value: RINGS.passTime },
      ice: { value: colors.ice },
      accent: { value: colors.accent },
      gold: { value: GOLD },
      glow: { value: RINGS.glow },
      finishBeam: { value: RINGS.finishBeam },
    };

    // Crystals: per gate, a main circle of big ones and a scatter of small satellites
    const rng = makeRng(seed, "crystals");
    const gateIndex: number[] = [];
    const crystal: number[] = [];
    const size: number[] = [];
    rings.forEach((ring, g) => {
      const layout: { angle: number; radius: number }[] = [];
      const main = Math.round(RINGS.crystals * (ring.finish ? 1.5 : 1));
      const satellites = Math.round(main * 0.7);
      for (let i = 0; i < main + satellites; i++) {
        const big = i < main;
        const angle = big ? (i / main) * Math.PI * 2 + range(rng, -0.08, 0.08) : range(rng, 0, Math.PI * 2);
        // Sized for a 13 m ring; smaller gates get smaller crystals so the crown stays clear of the rock
        const k = Math.min(1, ring.radius / 13);
        const halfLength = (big ? range(rng, 1.3, 2.1) * (ring.finish ? 1.25 : 1) : range(rng, 0.35, 0.7)) * k;
        const radius = big ? ring.radius + 0.5 * k + halfLength : ring.radius + range(rng, 1.5, 5.5) * k;
        gateIndex.push(g);
        crystal.push(angle, radius, range(rng, 0, Math.PI * 2), range(rng, -0.4, 0.4));
        size.push(halfLength, (big ? range(rng, 1.1, 1.6) : range(rng, 0.6, 0.9)) * k, big ? 0.5 + range(rng, -0.2, 0.2) : range(rng, -1, 1));
        layout.push({ angle, radius });
      }
      this.layout.push(layout);
    });
    const count = gateIndex.length;
    const geometry = this.geometry(crystalGeometry());
    geometry.setAttribute("gate", new THREE.InstancedBufferAttribute(new Float32Array(gateIndex), 1));
    geometry.setAttribute("crystal", new THREE.InstancedBufferAttribute(new Float32Array(crystal), 4));
    geometry.setAttribute("size", new THREE.InstancedBufferAttribute(new Float32Array(size), 3));
    const crystalMaterial = this.material(
      new THREE.ShaderMaterial({
        defines,
        uniforms: {
          ...THREE.UniformsUtils.clone(THREE.UniformsLib.fog),
          ...shared,
          motion: { value: new THREE.Vector4() },
          sunDirection: { value: this.sunView },
        },
        vertexShader: crystalVertex,
        fragmentShader: crystalFragment,
        fog: true,
      }),
    );
    const crystals = new THREE.InstancedMesh(geometry, crystalMaterial, Math.max(1, count));
    crystals.count = count;
    let k = 0;
    rings.forEach((ring, g) => {
      const placement = this.placement(ring, 1);
      this.firstCrystal.push(k);
      for (let i = 0; i < this.layout[g].length; i++) crystals.setMatrixAt(k++, placement);
    });
    crystals.frustumCulled = false;

    // The ring: a circle of glowing motes per gate, all in one THREE.Points. Their places on
    // the ring are world positions, written here and again whenever a gate turns (orient)
    this.motesPerGate = Math.max(3, Math.round(RINGS.motes));
    const moteCount = rings.length * this.motesPerGate;
    const moteGeometry = this.geometry(new THREE.BufferGeometry());
    const moteGate = new Float32Array(moteCount);
    const moteSpec = new Float32Array(moteCount * 4);
    for (let g = 0; g < rings.length; g++) {
      for (let i = 0; i < this.motesPerGate; i++) {
        const m = g * this.motesPerGate + i;
        moteGate[m] = g;
        moteSpec[m * 4] = (i / this.motesPerGate) * Math.PI * 2;
        moteSpec[m * 4 + 1] = rings[g].radius;
        moteSpec[m * 4 + 2] = range(rng, 0, Math.PI * 2);
        moteSpec[m * 4 + 3] = range(rng, 1.5, 3.5);
      }
    }
    moteGeometry.setAttribute("position", new THREE.BufferAttribute(new Float32Array(moteCount * 3), 3));
    moteGeometry.setAttribute("radial", new THREE.BufferAttribute(new Float32Array(moteCount * 3), 3));
    moteGeometry.setAttribute("axis", new THREE.BufferAttribute(new Float32Array(moteCount * 3), 3));
    moteGeometry.setAttribute("gate", new THREE.BufferAttribute(moteGate, 1));
    moteGeometry.setAttribute("mote", new THREE.BufferAttribute(moteSpec, 4));
    const moteMaterial = this.material(
      new THREE.ShaderMaterial({
        defines,
        uniforms: {
          ...THREE.UniformsUtils.clone(THREE.UniformsLib.fog),
          ...shared,
          pixelScale,
          boost: FX_LIGHT.boost,
          moteLook: { value: new THREE.Vector2(RINGS.moteSize, RINGS.moteDrift) },
        },
        vertexShader: moteVertex,
        fragmentShader: moteFragment,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        fog: true,
      }),
    );
    const motes = new THREE.Points(moteGeometry, moteMaterial);
    motes.frustumCulled = false;
    motes.renderOrder = 3;
    this.motes = motes;
    rings.forEach((_, g) => this.placeMotes(g));

    // The finish beam: an open cylinder, 700 m × finishBeamHeight tall, from the finish gate(s) only,
    // the one landmark that shows from the start line. Regular gates get no pillar
    // (`gate` is the ring's place in `rings`, the index into the gates uniform)
    const finishGates = rings.map((ring, g) => (ring.finish ? g : -1)).filter((g) => g >= 0);
    const finishRings = finishGates.map((g) => rings[g]);
    const tube = this.geometry(new THREE.CylinderGeometry(1, 1, 1, 20, 1, true));
    tube.translate(0, 0.5, 0);
    tube.setAttribute("gate", new THREE.InstancedBufferAttribute(new Float32Array(finishGates), 1));
    const beamMaterial = this.material(
      new THREE.ShaderMaterial({
        defines,
        uniforms: { ...shared },
        vertexShader: beamVertex,
        fragmentShader: beamFragment,
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
      }),
    );
    const beams = new THREE.InstancedMesh(tube, beamMaterial, Math.max(1, finishRings.length));
    beams.count = finishRings.length;
    const finishHeight = Math.max(1, RINGS.finishBeamHeight);
    finishRings.forEach((ring, i) => {
      const width = ring.radius * 0.5;
      tmpMatrix.compose(
        tmpScale.copy(ring.position).setY(ring.position.y - ring.radius),
        tmpQuaternion.identity(),
        new THREE.Vector3(width, 700 * finishHeight, width),
      );
      beams.setMatrixAt(i, tmpMatrix);
    });
    beams.frustumCulled = false;
    beams.renderOrder = 2;

    this.group.add(crystals, motes, beams);
    this.crystals = crystals;
  }

  /** Turns gate `index` (its crystals and ring) to face along `normal` (Resonance; looks only) */
  orient(index: number, normal: THREE.Vector3) {
    const ring = this.rings[index];
    if (!ring) return;
    this.facing[index].copy(normal).normalize();
    tmpQuaternion.setFromUnitVectors(Z, this.facing[index]);
    const placement = tmpMatrix.compose(ring.position, tmpQuaternion, tmpScale.setScalar(1));
    const first = this.firstCrystal[index];
    const count = this.layout[index].length;
    for (let i = 0; i < count; i++) this.crystals.setMatrixAt(first + i, placement);
    this.crystals.instanceMatrix.addUpdateRange(first * 16, count * 16);
    this.crystals.instanceMatrix.needsUpdate = true;
    this.placeMotes(index);
  }

  /** Writes gate `index`'s motes around its ring, in world space, facing the way the gate faces now */
  private placeMotes(index: number) {
    const ring = this.rings[index];
    const geometry = this.motes.geometry;
    const position = geometry.getAttribute("position") as THREE.BufferAttribute;
    const radial = geometry.getAttribute("radial") as THREE.BufferAttribute;
    const axis = geometry.getAttribute("axis") as THREE.BufferAttribute;
    const facing = this.facing[index];
    tmpQuaternion.setFromUnitVectors(Z, facing);
    const first = index * this.motesPerGate;
    for (let i = 0; i < this.motesPerGate; i++) {
      const angle = (i / this.motesPerGate) * Math.PI * 2;
      tmpScale.set(Math.cos(angle), Math.sin(angle), 0).applyQuaternion(tmpQuaternion);
      radial.setXYZ(first + i, tmpScale.x, tmpScale.y, tmpScale.z);
      axis.setXYZ(first + i, facing.x, facing.y, facing.z);
      tmpScale.multiplyScalar(ring.radius).add(ring.position);
      position.setXYZ(first + i, tmpScale.x, tmpScale.y, tmpScale.z);
    }
    for (const attribute of [position, radial, axis]) {
      attribute.addUpdateRange(first * 3, this.motesPerGate * 3);
      attribute.needsUpdate = true;
    }
  }

  private material(material: THREE.ShaderMaterial) {
    this.materials.push(material);
    return material;
  }

  private geometry<T extends THREE.BufferGeometry>(geometry: T): T {
    this.geometries.push(geometry);
    return geometry;
  }

  private placement(ring: Ring, scale: number): THREE.Matrix4 {
    tmpQuaternion.setFromUnitVectors(Z, this.facing[ring.index] ?? ring.normal);
    return tmpMatrix.compose(ring.position, tmpQuaternion, tmpScale.setScalar(scale));
  }

  /**
   * "race": every gate still to take glows (the finish most), taken ones are gone. "free": all shown
   * quietly. `restart` (or a change of mode) forgets which gates were taken: they all grow back
   */
  setMode(mode: RingMode, restart = false) {
    restart ||= mode !== this.mode;
    this.mode = mode;
    if (restart) {
      for (const state of this.states) {
        state.passedAt = -1e3;
        state.passed = false;
        if (mode !== "hidden") state.visible = 0; // grow back in
      }
    }
  }

  /** Plays the pass animation on a gate; in a race it then stays gone */
  pass(index: number) {
    const state = this.states[index];
    if (!state) return;
    state.passedAt = fxTime.value;
    state.passed = true;
  }

  /** Are a gate's crystals (mostly) showing? */
  shown(index: number): boolean {
    return (this.states[index]?.visible ?? 0) > 0.5;
  }

  /** Is a gate in the middle of its pass animation? */
  passing(index: number): boolean {
    const since = fxTime.value - (this.states[index]?.passedAt ?? -1e3);
    return since >= 0 && since < RINGS.passTime;
  }

  /** World positions of a gate's crystals (roughly: without their bobbing), for particle bursts */
  crystalPositions(index: number, out: THREE.Vector3[]): THREE.Vector3[] {
    const ring = this.rings[index];
    const spin = fxTime.value * RINGS.spin;
    tmpQuaternion.setFromUnitVectors(Z, this.facing[index]);
    const layout = this.layout[index] ?? [];
    // Reuses the vectors already in `out`
    while (out.length < layout.length) out.push(new THREE.Vector3());
    out.length = layout.length;
    layout.forEach(({ angle, radius }, i) => {
      out[i]
        .set(Math.cos(angle + spin) * radius, Math.sin(angle + spin) * radius, 0)
        .applyQuaternion(tmpQuaternion)
        .add(ring.position);
    });
    return out;
  }

  update(dt: number, camera: THREE.Camera) {
    const k = 1 - Math.exp(-dt * 3);
    const now = fxTime.value;
    for (let i = 0; i < this.rings.length; i++) {
      const state = this.states[i];
      const passing = now - state.passedAt < RINGS.passTime && now >= state.passedAt;
      // In a race a taken gate stays gone; in free flight it grows back
      const open = this.mode !== "race" || !state.passed;
      const wanted = this.mode === "hidden" || !open ? 0 : 1;
      if (passing) {
        state.visible = 1;
      } else if (state.passedAt > -1e3) {
        // The pass animation dissolved the crystals: in free flight they grow back from nothing
        state.passedAt = -1e3;
        state.visible = 0;
      } else {
        state.visible += (wanted - state.visible) * k;
      }
      // Every gate still to take glows a little (they are all speed boosts); the finish, the one goal, fully
      const finish = this.rings[i].finish;
      const highlight = this.mode === "race" && open ? (finish ? 1 : clamp01(RINGS.gateGlow)) : 0;
      state.highlight += (highlight - state.highlight) * k * 2;
      this.gateUniform[i].set(state.visible, state.highlight, state.passedAt, finish ? 1 : 0);
    }
    const material = this.materials[0];
    material.uniforms.motion.value.set(RINGS.drift, RINGS.driftRate, RINGS.spin, RINGS.selfSpin);
    (this.motes.material as THREE.ShaderMaterial).uniforms.moteLook.value.set(RINGS.moteSize, RINGS.moteDrift);
    for (const m of this.materials) {
      m.uniforms.passDuration.value = RINGS.passTime;
      m.uniforms.glow.value = RINGS.glow;
      m.uniforms.finishBeam.value = RINGS.finishBeam;
    }
    this.sunView.copy(this.sunDirection).transformDirection(camera.matrixWorldInverse);
  }

  dispose() {
    this.geometries.forEach((g) => g.dispose());
    this.materials.forEach((m) => m.dispose());
  }
}
