import * as THREE from "three";
import { PAINT } from "./tuning";
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
    varying vec2 vUv;

    float luma(vec3 c) { return dot(c, vec3(0.299, 0.587, 0.114)); }

    void main() {
      vec4 source = texture2D(tDiffuse, vUv);
      vec3 c = clamp(source.rgb, 0.0, 1.0);
      float l = luma(c);
      // Shadows go violet-blue, highlights gold: the painter's warm light and cool shade
      float shade = (1.0 - l) * (1.0 - l);
      c += shadowTint * shade * vec3(0.05, 0.03, 0.16);
      c += warmth * smoothstep(0.35, 1.0, l) * vec3(0.10, 0.04, -0.06);
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

/** PAINT's sliders as a grade */
function sliders(): PaintGrade {
  return {
    grade: PAINT.grade, lift: PAINT.lift, warmth: PAINT.warmth, shadowTint: PAINT.shadowTint, contrast: PAINT.contrast, saturation: PAINT.saturation, vignette: PAINT.paintVignette, grain: PAINT.grain,
    ramp: PAINT.ramp, steps: PAINT.steps, soft: PAINT.soft, warmLight: PAINT.warmLight, coolShade: PAINT.coolShade,
  };
}

/** Step two, the light: uniforms shared by every atmospheric (land, plant, structure) material */
export const PAINT_LIGHT = {
  ramp: { value: 0 },
  steps: { value: 3 },
  soft: { value: 0.12 },
  warm: { value: 0.5 },
  cool: { value: 0.5 },
};

/**
 * Replaces three's `lights_lambert_pars_fragment`: the sun's light quantised into `paintSteps`
 * bands with soft edges, the lit side warmed, and the shade (what the sun does not reach, lit
 * by the hemisphere light alone) cooled. At paintRamp 0 it is Lambert exactly. The faces are
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
  vec3 warm = mix( vec3( 1.0 ), vec3( 1.12, 1.02, 0.86 ), paintWarm * paintRamp );
  vec3 irradiance = lit * directLight.color * warm;
  reflectedLight.directDiffuse += irradiance * BRDF_Lambert( material.diffuseColor );
}

void RE_IndirectDiffuse_Lambert( const in vec3 irradiance, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in LambertMaterial material, inout ReflectedLight reflectedLight ) {
  vec3 cool = mix( vec3( 1.0 ), vec3( 0.78, 0.86, 1.15 ), paintCool * paintRamp * ( 1.0 - paintLitness ) );
  reflectedLight.indirectDiffuse += irradiance * cool * BRDF_Lambert( material.diffuseColor );
}

#define RE_Direct RE_Direct_Lambert
#define RE_IndirectDiffuse RE_IndirectDiffuse_Lambert
`;

/** Feeds the light uniforms the mood's numbers each frame (any quality: the light needs no post-processing) */
export function updatePaintLight(palette: Palette) {
  const p = paintFor(palette);
  PAINT_LIGHT.ramp.value = p.ramp;
  PAINT_LIGHT.steps.value = p.steps;
  PAINT_LIGHT.soft.value = p.soft;
  PAINT_LIGHT.warm.value = p.warmLight;
  PAINT_LIGHT.cool.value = p.coolShade;
}

/**
 * The grade for a mood: its own numbers over PAINT's defaults, or the sliders alone while
 * PAINT.override is on (tuning a mood that has numbers of its own already)
 */
export function paintFor(palette: Palette): PaintGrade {
  const base = sliders();
  return PAINT.override || !palette.paint ? base : { ...base, ...palette.paint };
}

/** Feeds the pass the mood's grade each frame; the pass is skipped altogether at grade 0 */
export function updatePaintPass(pass: { enabled: boolean; uniforms: Record<string, THREE.IUniform> }, aspect: number, palette: Palette) {
  const p = paintFor(palette);
  pass.enabled = p.grade > 0;
  if (!pass.enabled) return;
  const u = pass.uniforms;
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
