import * as THREE from "three";
import { PAINT, PAINT_DEFAULTS } from "./tuning";
import type { PaintGrade, Palette } from "./world/palette";

// The painted (storybook) look, step one: a colour grade over the finished frame, a vignette
// and a paper grain. A full-screen pass after the bloom and the output pass, so it works in
// display (sRGB) space like a colour-grading LUT would; the LUT is computed from PAINT's
// numbers instead of loaded, so the ?tune sliders move it live. Looks only: nothing here
// touches the simulation. Off (and skipped) while PAINT.grade is 0.

export const PAINT_SHADER = {
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    strength: { value: 0 },
    lift: { value: 0 },
    warmth: { value: 0 },
    shadowTint: { value: 0 },
    contrast: { value: 1 },
    saturation: { value: 1 },
    vignette: { value: 0 },
    grain: { value: 0 },
    aspect: { value: 1 },
    sunTint: { value: new THREE.Color(1, 1, 1) },
    skyTint: { value: new THREE.Color(1, 1, 1) },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float strength;
    uniform float lift;
    uniform float warmth;
    uniform float shadowTint;
    uniform float contrast;
    uniform float saturation;
    uniform float vignette;
    uniform float grain;
    uniform float aspect;
    uniform vec3 sunTint; // the mood's sun colour as a tint (mean 1): where the highlights go
    uniform vec3 skyTint; // the mood's sky colour as a tint: where the shadows go
    varying vec2 vUv;

    float luma(vec3 c) { return dot(c, vec3(0.299, 0.587, 0.114)); }

    void main() {
      vec4 source = texture2D(tDiffuse, vUv);
      vec3 c = clamp(source.rgb, 0.0, 1.0);
      float l = luma(c);
      // The painter's rule: the highlights take the colour of the light, the shadows the colour of
      // the sky. Which colours those are is the mood's own (its sun and sky), not a fixed warm/cool
      float shade = (1.0 - l) * (1.0 - l);
      c += shadowTint * shade * (skyTint - 1.0) * 0.6;
      c += warmth * smoothstep(0.35, 1.0, l) * (sunTint - 1.0) * 1.2;
      // No pure black: ink on paper lifts to a dark warm grey
      c = c * (1.0 - lift) + lift * vec3(0.16, 0.13, 0.17);
      c = (c - 0.5) * contrast + 0.5;
      c = mix(vec3(luma(c)), c, saturation);
      // Vignette: the corners darken, the middle is untouched
      vec2 off = (vUv - 0.5) * vec2(aspect, 1.0);
      float edge = smoothstep(0.45, 1.1, length(off));
      c *= 1.0 - vignette * 0.6 * edge;
      // Paper grain: fixed to the screen like the tooth of the paper, not television static
      float g = fract(sin(dot(floor(gl_FragCoord.xy * 0.5), vec2(12.9898, 78.233))) * 43758.5453);
      c += (g - 0.5) * grain * 0.3;
      c = clamp(c, 0.0, 1.0);
      gl_FragColor = vec4(mix(source.rgb, c, strength), source.a);
    }
  `,
};

/** A mood's numbers as written: its own over PAINT's defaults */
function fresh(palette: Palette): PaintGrade {
  const d = PAINT_DEFAULTS;
  return {
    grade: d.grade, lift: d.lift, warmth: d.warmth, shadowTint: d.shadowTint, contrast: d.contrast, saturation: d.saturation, vignette: d.paintVignette, grain: d.grain,
    ramp: d.ramp, steps: d.steps, soft: d.soft, warmLight: d.warmLight, coolShade: d.coolShade, gradient: d.gradient,
    ...palette.paint,
  };
}

/** Each mood's numbers as written, and the ?tune sliders' numbers for it (yours, from the written ones) */
const written = new WeakMap<Palette, PaintGrade>();
const edited = new WeakMap<Palette, PaintGrade>();

function writtenFor(palette: Palette): PaintGrade {
  let r = written.get(palette);
  if (!r) written.set(palette, (r = fresh(palette)));
  return r;
}

/** The sliders' numbers for a mood: what Copy settings as JSON carries */
export function paintEdited(palette: Palette): PaintGrade {
  let r = edited.get(palette);
  if (!r) edited.set(palette, (r = fresh(palette)));
  return r;
}

/** The grade and light in use for a mood: the sliders' numbers with PAINT.override on, else the numbers as written */
export function paintFor(palette: Palette): PaintGrade {
  return PAINT.override ? paintEdited(palette) : writtenFor(palette);
}

/** The ?tune sliders take the mood's numbers (yours for it, as written until you move them) */
export function paintToSliders(palette: Palette) {
  const r = paintEdited(palette);
  PAINT.grade = r.grade;
  PAINT.lift = r.lift;
  PAINT.warmth = r.warmth;
  PAINT.shadowTint = r.shadowTint;
  PAINT.contrast = r.contrast;
  PAINT.saturation = r.saturation;
  PAINT.paintVignette = r.vignette;
  PAINT.grain = r.grain;
  PAINT.ramp = r.ramp;
  PAINT.steps = r.steps;
  PAINT.soft = r.soft;
  PAINT.warmLight = r.warmLight;
  PAINT.coolShade = r.coolShade;
  PAINT.gradient = r.gradient;
}

/** A moved slider changes your numbers for the mood (seen with PAINT.override on; the JSON goes into its palette to keep them) */
export function slidersToPaint(palette: Palette) {
  const r = paintEdited(palette);
  r.grade = PAINT.grade;
  r.lift = PAINT.lift;
  r.warmth = PAINT.warmth;
  r.shadowTint = PAINT.shadowTint;
  r.contrast = PAINT.contrast;
  r.saturation = PAINT.saturation;
  r.vignette = PAINT.paintVignette;
  r.grain = PAINT.grain;
  r.ramp = PAINT.ramp;
  r.steps = PAINT.steps;
  r.soft = PAINT.soft;
  r.warmLight = PAINT.warmLight;
  r.coolShade = PAINT.coolShade;
  r.gradient = PAINT.gradient;
}

/** Your numbers for the mood back to the ones as written, and the sliders with them */
export function resetPaint(palette: Palette) {
  edited.set(palette, fresh(palette));
  paintToSliders(palette);
}

/** Step two, the light: uniforms shared by every atmospheric (land, plant, structure) material */
export const PAINT_LIGHT = {
  ramp: { value: 0 },
  steps: { value: 3 },
  soft: { value: 0.12 },
  warm: { value: 0.5 },
  cool: { value: 0.5 },
  sunTint: { value: new THREE.Color(1, 1, 1) },
  skyTint: { value: new THREE.Color(1, 1, 1) },
  groundTint: { value: new THREE.Color(1, 1, 1) },
  viewUp: { value: new THREE.Vector3(0, 1, 0) },
  gradient: { value: 0 },
};

/**
 * A colour as a tint: scaled to a mean of 1, so it changes the hue of what it multiplies and not
 * the brightness, each channel kept within [0.55, 1.6] (a night zenith is nearly black, and its
 * ratios would run away)
 */
function tint(color: THREE.Color, out: THREE.Color): THREE.Color {
  const mean = Math.max((color.r + color.g + color.b) / 3, 1e-4);
  out.setRGB(
    Math.min(Math.max(color.r / mean, 0.55), 1.6),
    Math.min(Math.max(color.g / mean, 0.55), 1.6),
    Math.min(Math.max(color.b / mean, 0.55), 1.6),
  );
  return out;
}

const tints = new WeakMap<Palette, { sun: THREE.Color; sky: THREE.Color; ground: THREE.Color }>();
const scratch = new THREE.Color();

/**
 * The mood's sun, sky and ground as tints: the lit side goes towards the sun's colour, shade
 * facing up towards the sky's, shade facing down towards the ground's (the light bounced up
 * from the sea of clouds, the valley: the hemisphere light's own ground colour)
 */
export function paintTints(palette: Palette): { sun: THREE.Color; sky: THREE.Color; ground: THREE.Color } {
  let t = tints.get(palette);
  if (!t) {
    const sun = tint(new THREE.Color(palette.sun), new THREE.Color());
    const sky = tint(scratch.set(palette.horizon).lerp(new THREE.Color(palette.zenith), 0.5), new THREE.Color());
    const ground = tint(new THREE.Color(palette.cloud), new THREE.Color());
    t = { sun, sky, ground };
    tints.set(palette, t);
  }
  return t;
}

/**
 * Replaces three's `lights_lambert_pars_fragment`: the sun's light quantised into `paintSteps`
 * bands with soft edges, the lit side tinted towards the mood's sun colour, and the shade (what
 * the sun does not reach, lit by the hemisphere light alone) towards the mood's sky colour: the
 * painter's rule, so an amber mood goes gold and violet and a crisp blue one stays crisp. At
 * paintRamp 0 it is Lambert exactly. The faces are
 * flat-shaded, so each face takes one band: that is the painted, paper-cut look; smoothing the
 * normals on the low-poly land was tried once and turned every facet into a gradient
 */
export const PAINT_LAMBERT_GLSL = /* glsl */ `
varying vec3 vViewPosition;
uniform float paintRamp;
uniform float paintSteps;
uniform float paintSoft;
uniform float paintWarm;
uniform float paintCool;
uniform vec3 paintSunTint; // the mood's sun colour as a tint (mean 1)
uniform vec3 paintSkyTint; // the mood's sky colour as a tint
uniform vec3 paintGroundTint; // the mood's ground (bounce) colour as a tint: what undersides see
uniform vec3 paintViewUp; // the world's up, in view space
uniform float paintGradient; // the vertical wash, bottom towards the ground's colour, top towards the sun's
float paintLitness = 1.0;

struct LambertMaterial {
  vec3 diffuseColor;
  float specularStrength;
};

void RE_Direct_Lambert( const in IncidentLight directLight, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in LambertMaterial material, inout ReflectedLight reflectedLight ) {
  float dotNL = saturate( dot( geometryNormal, directLight.direction ) );
  float steps = max( paintSteps, 1.0 );
  float q = dotNL * steps;
  float edge = smoothstep( 1.0 - 2.0 * paintSoft, 1.0, fract( q ) );
  float ramped = min( ( floor( q ) + edge ) / steps, 1.0 );
  float lit = mix( dotNL, ramped, paintRamp );
  paintLitness = lit;
  vec3 warm = mix( vec3( 1.0 ), paintSunTint, paintWarm * paintRamp );
  vec3 irradiance = lit * directLight.color * warm;
  reflectedLight.directDiffuse += irradiance * BRDF_Lambert( material.diffuseColor );
}

void RE_IndirectDiffuse_Lambert( const in vec3 irradiance, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in LambertMaterial material, inout ReflectedLight reflectedLight ) {
  // Shade facing the sky takes the sky's colour; shade facing the ground takes the bounce light's
  float down = clamp( -dot( geometryNormal, paintViewUp ), 0.0, 1.0 );
  vec3 cool = mix( vec3( 1.0 ), mix( paintSkyTint, paintGroundTint, down ), paintCool * paintRamp * ( 1.0 - paintLitness ) );
  reflectedLight.indirectDiffuse += irradiance * cool * BRDF_Lambert( material.diffuseColor );
}

#define RE_Direct RE_Direct_Lambert
#define RE_IndirectDiffuse RE_IndirectDiffuse_Lambert
`;

/** Feeds the light uniforms the mood's numbers each frame (any quality: the light needs no post-processing) */
export function updatePaintLight(palette: Palette, camera: THREE.Camera) {
  const p = paintFor(palette);
  const t = paintTints(palette);
  PAINT_LIGHT.sunTint.value.copy(t.sun);
  PAINT_LIGHT.skyTint.value.copy(t.sky);
  PAINT_LIGHT.groundTint.value.copy(t.ground);
  PAINT_LIGHT.viewUp.value.set(0, 1, 0).transformDirection(camera.matrixWorldInverse);
  PAINT_LIGHT.ramp.value = p.ramp;
  PAINT_LIGHT.steps.value = p.steps;
  PAINT_LIGHT.soft.value = p.soft;
  PAINT_LIGHT.warm.value = p.warmLight;
  PAINT_LIGHT.cool.value = p.coolShade;
  PAINT_LIGHT.gradient.value = p.gradient;
}

/** Feeds the pass the mood's grade each frame; the pass is skipped altogether at grade 0 */
export function updatePaintPass(pass: { enabled: boolean; uniforms: Record<string, THREE.IUniform> }, aspect: number, palette: Palette) {
  const p = paintFor(palette);
  pass.enabled = p.grade > 0;
  if (!pass.enabled) return;
  const u = pass.uniforms;
  const t = paintTints(palette);
  (u.sunTint.value as THREE.Color).copy(t.sun);
  (u.skyTint.value as THREE.Color).copy(t.sky);
  u.strength.value = p.grade;
  u.lift.value = p.lift;
  u.warmth.value = p.warmth;
  u.shadowTint.value = p.shadowTint;
  u.contrast.value = p.contrast;
  u.saturation.value = p.saturation;
  u.vignette.value = p.vignette;
  u.grain.value = p.grain;
  u.aspect.value = aspect;
}
