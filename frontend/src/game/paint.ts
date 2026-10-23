import * as THREE from "three";
import { PAINT } from "./tuning";

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

/** Feeds the pass PAINT's numbers each frame; the pass is skipped altogether at grade 0 */
export function updatePaintPass(pass: { enabled: boolean; uniforms: Record<string, THREE.IUniform> }, aspect: number) {
  pass.enabled = PAINT.grade > 0;
  if (!pass.enabled) return;
  const u = pass.uniforms;
  u.strength.value = PAINT.grade;
  u.lift.value = PAINT.lift;
  u.warmth.value = PAINT.warmth;
  u.shadowTint.value = PAINT.shadowTint;
  u.contrast.value = PAINT.contrast;
  u.saturation.value = PAINT.saturation;
  u.vignette.value = PAINT.paintVignette;
  u.grain.value = PAINT.grain;
  u.aspect.value = aspect;
}
