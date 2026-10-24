import * as THREE from "three";
import { PAINT_LAMBERT_GLSL, PAINT_LIGHT } from "../paint";
import { sceneryTime as fxTime } from "../particles";

// The air between you and the world: one set of light uniforms shared by the
// sky, the terrain and the rocks, set per biome (palette). The patch adds what
// the plain Lambert material lacks:
// - haze that turns the sun's color when you look towards it, matching the sky,
// - mist that thickens below you, down towards the sea of clouds,
// - rims that light up on edges seen against the sun (backlight),
// - rock strata: soft horizontal bands on cliffs,
// - under the sea: ripples of light from the surface running over everything,
// - land and plants that have just arrived fade in out of the haze's color, and a level of
//   detail on its way out fades back into it (the `born` attribute, BORN_FRESH).
// The sky is a dome with the same light; under the sea it shows the water's
// surface from below instead.

export const ATMOSPHERE = {
  sunDirection: { value: new THREE.Vector3(0, 1, 0) },
  sunColor: { value: new THREE.Color("#ffffff") },
  mistColor: { value: new THREE.Color("#ffffff") },
  mistDensity: { value: 0.5 },
  // Where mist gathers: 0 = below the camera (over a sea of clouds), 1 = below mistHeight (in a valley)
  mistMode: { value: 0 },
  mistHeight: { value: 0 },
  mistThickness: { value: 120 },
  horizon: { value: new THREE.Color("#ffffff") },
  zenith: { value: new THREE.Color("#3366cc") },
  clouds: { value: new THREE.Color("#ffffff") },
  night: { value: 0 },
  aurora: { value: 0 },
  // Distant land painted on the sky dome around the horizon, 0 (none) to 1 (full): shapes
  // for the real land to arrive into, so it is not seen to pop out of an empty haze
  silhouettes: { value: 1 },
  // Under the sea (0 or 1): the height of the water's surface, how bright the
  // ripples of light on the land are, and how bright the surface is from below
  underwater: { value: 0 },
  surface: { value: 0 },
  caustics: { value: 1 },
  surfaceGlow: { value: 1 },
  time: fxTime,
  // Arriving land: the wall clock in seconds (not the scenery's, which can slow or stand
  // still), and one over the seconds a fade takes. WorldView sets both every frame
  now: { value: 0 },
  revealRate: { value: 1 },
  // The mood's air (look.ts AirLook), set by WorldView every frame: the sun's glow across the
  // sky and the haze (wide disc exponent and strength, core exponent and strength), the sun's
  // and the moon's disc, the sky gradient's curve, the far silhouettes (towards the zenith,
  // shade), the dome clouds' brightness, where the mist begins under the camera, over what
  // distance it builds and how much it may hide, the backlit rims, and the puffs' shading
  // (shaded side towards the horizon, its brightness, the lit side, the sun through the edge)
  glow: { value: new THREE.Vector4(6, 0.35, 48, 0.5) },
  discs: { value: new THREE.Vector2(2.6, 1.4) },
  skyCurve: { value: 0.6 },
  silhouette: { value: new THREE.Vector2(1, 1) },
  cloudBright: { value: 1 },
  mistDrop: { value: 40 },
  mistRange: { value: 280 },
  mistCap: { value: 0.85 },
  rim: { value: 0.45 },
  puff: { value: new THREE.Vector4(0.45, 0.72, 1.05, 1.2) },
};

/**
 * The `born` attribute (per vertex for land, per instance for plants) says how something came
 * to be on screen, in one float against the wall clock `atmoNow`:
 *   0           long there (geometry without the attribute reads this)
 *   t           swapped in at time t for another level of detail: drawn in its full color at
 *               once (the old level came off the same frame; the two never overlap)
 *   FRESH + t   arrived at t where nothing was drawn: fades in out of the haze's color over
 *               TERRAIN.fadeIn, and its plants grow out of the ground
 *   -t          on its way out since t: its color fades back into the haze's over
 *               TERRAIN.fadeIn (supported by the shaders; the land streamer no longer uses it)
 * The fades are plain color blends (no discard or dither), so nothing needs sorting and nothing
 * speckles: a surface only ever moves between its own color and the haze's.
 * FRESH is 2^17: float32 still keeps 1/64 s above it, and the wall clock stays below it for 36 h.
 */
export const BORN_FRESH = 131072;

/** The wall clock the fades run on, in seconds (the scenery's clock can slow or stand still) */
export function wallNow(): number {
  return ATMOSPHERE.now.value;
}

/** `born` for land or plants arriving where nothing was drawn: out of the haze, from now */
export function bornFresh(): number {
  return BORN_FRESH + wallNow();
}

/** `born` for a level of detail taking over from another: in its full color from now */
export function bornSwapped(): number {
  return wallNow();
}

/** `born` for a level of detail being taken over: fades into the haze from now */
export function bornLeaving(): number {
  return -wallNow();
}

/**
 * `born` for something on its way out since `since` that is wanted again: arriving out of the
 * haze at the point it had faded to, so its color carries on from there instead of snapping back
 */
export function bornResuming(since: number): number {
  const now = wallNow();
  const fadeIn = 1 / Math.max(ATMOSPHERE.revealRate.value, 1e-6);
  // Leaving has faded (now - since) / fadeIn of the way into the haze; arriving at t shows
  // (now - t) / fadeIn of its color, so t is where the two meet
  return BORN_FRESH + Math.min(now, Math.max(0, now - fadeIn + (now - since)));
}

/** GLSL to read `born` (see BORN_FRESH); needs the uniforms atmoNow and atmoRevealRate */
export const BORN_GLSL = /* glsl */ `
  // How far along its fade something is, 0 to 1 (1 when long there)
  float atmoAge(float born) {
    float t = abs(born);
    t -= step(${BORN_FRESH}.0, t) * ${BORN_FRESH}.0;
    return born == 0.0 ? 1.0 : clamp((atmoNow - t) * atmoRevealRate, 0.0, 1.0);
  }
  // 1 where it arrived out of nothing (melts out of the haze, plants grow), 0 for a change of detail
  float atmoFresh(float born) { return step(${BORN_FRESH}.0, born); }
  // 1 where it is on its way out
  float atmoLeaving(float born) { return step(born, -1e-3); }
  // How much of its own color it shows against the haze's, 0 to 1: arriving out of nothing
  // grows from 0, leaving shrinks to 0, a change of detail arriving (and anything long there) is 1
  float atmoReveal(float born) {
    float age = atmoAge(born);
    return mix(mix(1.0, age, atmoFresh(born)), 1.0 - age, atmoLeaving(born));
  }
`;

/**
 * Mist: below a level a little under the camera (rock far beneath you sinks into
 * the haze over a sea of clouds), or below a fixed height (pooling in a valley).
 * Needs atmoMistDensity, atmoMistMode, atmoMistHeight and atmoMistThickness; declares the rest
 * (ATMOSPHERE.mistDrop, mistRange, mistCap), so a material only adds their values.
 */
export const MIST = /* glsl */ `
  uniform float atmoMistDrop;
  uniform float atmoMistRange;
  uniform float atmoMistCap;
  float atmoMist(vec3 world, float dist) {
    float level = mix(cameraPosition.y - atmoMistDrop, atmoMistHeight, atmoMistMode);
    float above = world.y - level;
    return atmoMistDensity * (1.0 - exp(-max(-above, 0.0) / max(atmoMistThickness, 1.0))) * (1.0 - exp(-dist / max(atmoMistRange, 1.0)));
  }
`;

/**
 * Light through a rippling surface: bright threads where two drifting fields of
 * ripples cross. 0 to about 1.6. (No pow() of anything negative, nothing divided.)
 */
const CAUSTICS = /* glsl */ `
  float atmoHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float atmoNoise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(atmoHash(i), atmoHash(i + vec2(1.0, 0.0)), u.x), mix(atmoHash(i + vec2(0.0, 1.0)), atmoHash(i + vec2(1.0, 1.0)), u.x), u.y);
  }
  float atmoCaustic(vec2 p, float t) {
    float a = atmoNoise(p + vec2(t * 0.31, t * 0.17));
    float b = atmoNoise(p * 1.31 + vec2(11.7 - t * 0.23, t * 0.29));
    float c = atmoNoise(p * 2.37 + vec2(3.1 + t * 0.19, 5.3 - t * 0.27));
    float fine = clamp(1.0 - abs(a - b) * 6.0, 0.0, 1.0);
    float finer = clamp(1.0 - abs(b - c) * 5.0, 0.0, 1.0);
    return fine * fine * fine + finer * finer * finer * 0.6;
  }
`;

/**
 * The sky's glow around the sun: a wide disc and a bright core (ATMOSPHERE.glow); the haze uses
 * the same curve so distant terrain melts into the sky. Needs atmoSunDirection and
 * atmoSunColor; declares atmoGlow itself. One chunk for the sky, the land, the water and the
 * far plants, so they all sit in the same air
 */
export const SUN_GLOW = /* glsl */ `
  uniform vec4 atmoGlow;
  vec3 sunGlow(vec3 dir) {
    float d = max(dot(dir, atmoSunDirection), 0.0);
    return atmoSunColor * (pow(d, atmoGlow.x) * atmoGlow.y + pow(d, atmoGlow.z) * atmoGlow.w);
  }
`;

const PARS = /* glsl */ `
  varying float vPaintRise;
  uniform vec3 atmoSunDirection;
  uniform vec3 atmoSunColor;
  uniform vec3 atmoMistColor;
  uniform float atmoMistDensity;
  uniform float atmoMistMode;
  uniform float atmoMistHeight;
  uniform float atmoMistThickness;
  uniform float atmoRim;
  uniform float atmoStrata;
  uniform float atmoUnderwater;
  uniform float atmoCaustics;
  uniform float atmoTime;
  varying vec3 vAtmoWorld;
  varying float vAtmoReveal;
  ${SUN_GLOW}
  ${MIST}
  ${CAUSTICS}
`;

/** Adds the haze, mist, backlight and strata to a Lambert material (terrain, rocks) */
export function atmospheric<T extends THREE.MeshLambertMaterial>(material: T, strata = 0): T {
  const strataUniform = { value: strata };
  material.onBeforeCompile = (shader) => {
    shader.uniforms.atmoSunDirection = ATMOSPHERE.sunDirection;
    shader.uniforms.atmoSunColor = ATMOSPHERE.sunColor;
    shader.uniforms.atmoMistColor = ATMOSPHERE.mistColor;
    shader.uniforms.atmoMistDensity = ATMOSPHERE.mistDensity;
    shader.uniforms.atmoMistMode = ATMOSPHERE.mistMode;
    shader.uniforms.atmoMistHeight = ATMOSPHERE.mistHeight;
    shader.uniforms.atmoMistThickness = ATMOSPHERE.mistThickness;
    shader.uniforms.atmoMistDrop = ATMOSPHERE.mistDrop;
    shader.uniforms.atmoMistRange = ATMOSPHERE.mistRange;
    shader.uniforms.atmoMistCap = ATMOSPHERE.mistCap;
    shader.uniforms.atmoGlow = ATMOSPHERE.glow;
    shader.uniforms.atmoRim = ATMOSPHERE.rim;
    shader.uniforms.atmoStrata = strataUniform;
    shader.uniforms.atmoUnderwater = ATMOSPHERE.underwater;
    shader.uniforms.atmoCaustics = ATMOSPHERE.caustics;
    shader.uniforms.atmoTime = ATMOSPHERE.time;
    shader.uniforms.atmoNow = ATMOSPHERE.now;
    shader.uniforms.atmoRevealRate = ATMOSPHERE.revealRate;
    shader.uniforms.paintRamp = PAINT_LIGHT.ramp;
    shader.uniforms.paintSteps = PAINT_LIGHT.steps;
    shader.uniforms.paintSoft = PAINT_LIGHT.soft;
    shader.uniforms.paintWarm = PAINT_LIGHT.warm;
    shader.uniforms.paintCool = PAINT_LIGHT.cool;
    shader.uniforms.paintSunTint = PAINT_LIGHT.sunTint;
    shader.uniforms.paintSkyTint = PAINT_LIGHT.skyTint;
    shader.uniforms.paintGroundTint = PAINT_LIGHT.groundTint;
    shader.uniforms.paintViewUp = PAINT_LIGHT.viewUp;
    shader.uniforms.paintBounce = PAINT_LIGHT.bounce;
    shader.uniforms.paintShade = PAINT_LIGHT.shade;
    shader.uniforms.paintGradient = PAINT_LIGHT.gradient;
    shader.vertexShader = shader.vertexShader
      .replace(
        "void main() {",
        `attribute float born;
        uniform float atmoNow;
        uniform float atmoRevealRate;
        varying vec3 vAtmoWorld;
        varying float vAtmoReveal;
        varying float vPaintRise;
        ${BORN_GLSL}
        void main() {
          vPaintRise = 0.5;`,
      )
      .replace(
        "#include <project_vertex>",
        `#include <project_vertex>
        vec4 atmoWorld = vec4(transformed, 1.0);
        #ifdef USE_INSTANCING
          atmoWorld = instanceMatrix * atmoWorld;
        #endif
        vAtmoWorld = (modelMatrix * atmoWorld).xyz;
        // How much of its own color against the haze's: arriving out of nothing fades in,
        // a level on its way out fades back (born: BORN_FRESH)
        vAtmoReveal = atmoReveal(born);`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <lights_lambert_pars_fragment>", PAINT_LAMBERT_GLSL)
      .replace(
        "void main() {",
        `${PARS}
        void main() {`,
      )
      .replace(
        "#include <color_fragment>",
        `#include <color_fragment>
        {
          // Sediment layers, wavering a little so they don't look ruled
          float waver = sin(vAtmoWorld.x * 0.013 + vAtmoWorld.z * 0.009) * 4.0;
          float bands = sin(vAtmoWorld.y * 0.45 + waver) * 0.07 + sin(vAtmoWorld.y * 1.7 + waver) * 0.018;
          diffuseColor.rgb *= 1.0 + atmoStrata * bands;
          // The painted look's vertical gradient: darker at the bottom of a thing, in the colour of the
          // light bounced up from below, lighter at its top in the sun's, each a few percent, like a wash
          diffuseColor.rgb *= mix(vec3(1.0), mix(paintGroundTint * 0.8, paintSunTint * 1.04, vPaintRise), paintGradient);
        }`,
      )
      .replace(
        "#include <fog_fragment>",
        `{
          vec3 toFrag = vAtmoWorld - cameraPosition;
          float dist = length(toFrag);
          vec3 viewDir = toFrag / max(dist, 0.001);
          float towardsSun = max(dot(viewDir, atmoSunDirection), 0.0);
          // Edges seen against the sun catch its light
          vec3 worldNormal = inverseTransformDirection(normal, viewMatrix);
          float rim = pow(1.0 - clamp(dot(worldNormal, -viewDir), 0.0, 1.0), 3.0);
          gl_FragColor.rgb += atmoSunColor * rim * pow(towardsSun, 3.0) * atmoRim;
          if (atmoUnderwater > 0.0) {
            // Under the sea: ripples of light from the surface, cast along the sun's rays,
            // brightest on what faces up, fading into the haze
            vec2 shone = vAtmoWorld.xz - atmoSunDirection.xz * (vAtmoWorld.y / max(atmoSunDirection.y, 0.25));
            float facing = clamp(worldNormal.y * 0.75 + 0.35, 0.0, 1.0);
            float ripples = atmoCaustic(shone * 0.1, atmoTime) * facing * exp(-dist / 240.0) * atmoCaustics * atmoUnderwater;
            gl_FragColor.rgb += (gl_FragColor.rgb * 0.85 + 0.05) * atmoSunColor * ripples;
          }
          #ifdef USE_FOG
            float fogFactor = smoothstep(fogNear, fogFar, vFogDepth);
            float mist = atmoMist(vAtmoWorld, dist);
            gl_FragColor.rgb = mix(gl_FragColor.rgb, atmoMistColor, clamp(mist, 0.0, atmoMistCap) * (1.0 - fogFactor));
            gl_FragColor.rgb = mix(gl_FragColor.rgb, fogColor + sunGlow(viewDir), fogFactor);
            // Just arrived: out of the haze, the color the far land already has, not out of nothing;
            // on its way out: back into it. A plain blend, no dither, so nothing speckles
            float reveal = vAtmoReveal * vAtmoReveal * (3.0 - 2.0 * vAtmoReveal);
            gl_FragColor.rgb = mix(fogColor + sunGlow(viewDir), gl_FragColor.rgb, reveal);
          #endif
        }`,
      );
  };
  material.customProgramCacheKey = () => `windrider-atmosphere-${strata > 0}`;
  return material;
}

const skyVertex = /* glsl */ `
  varying vec3 vDirection;
  void main() {
    vDirection = position;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const skyFragment = /* glsl */ `
  uniform vec3 atmoSunDirection;
  uniform vec3 atmoSunColor;
  uniform vec3 horizon;
  uniform vec3 zenith;
  uniform vec3 clouds;
  uniform float night;
  uniform float aurora;
  uniform float silhouettes;
  uniform float underwater;
  uniform float surface;
  uniform float surfaceGlow;
  uniform float time;
  uniform float skyCurve;
  uniform vec2 silhouette;
  uniform vec2 discs;
  uniform float cloudBright;
  varying vec3 vDirection;
  ${SUN_GLOW}
  ${CAUSTICS}

  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float noise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
  }
  float fbm(vec2 p) {
    float sum = 0.0, amp = 0.5;
    for (int i = 0; i < 4; i++) { sum += noise(p) * amp; p = p * 2.03 + 17.0; amp *= 0.5; }
    return sum;
  }

  void main() {
    vec3 dir = normalize(vDirection);
    if (underwater > 0.0) {
      // Under the sea there is no sky: the haze all around (the horizon color, as the
      // fog), darker in the deep below, and the water's surface far overhead
      vec3 color = mix(horizon, horizon * 0.55, clamp(-dir.y * 1.4 - 0.2, 0.0, 1.0)) + sunGlow(dir);
      if (dir.y > 0.02) {
        float reach = max(surface - cameraPosition.y, 6.0) / dir.y;
        vec2 hit = cameraPosition.xz + dir.xz * reach;
        float ripples = atmoCaustic(hit * 0.03, time);
        float swell = atmoNoise(hit * 0.009 + vec2(time * 0.05, time * 0.03));
        // Snell's window: the world above squeezed into a bright disc overhead, its edge
        // wobbling with the swell; outside it the surface mirrors the deep
        float window = smoothstep(0.56, 0.8, dir.y + (swell - 0.5) * 0.16);
        float d = max(dot(dir, atmoSunDirection), 0.0);
        vec3 above = mix(horizon, zenith, 0.72) * (0.78 + swell * 0.3) + atmoSunColor * ripples * 0.4;
        // The sun, a blaze broken up by the ripples
        above += atmoSunColor * (pow(d, 40.0) * 0.3 + pow(d, 400.0) * (0.9 + ripples * 1.2));
        vec3 mirror = mix(horizon, zenith, 0.22) * (0.9 + swell * 0.2) + zenith * ripples * 0.22;
        float seen = exp(-reach / 430.0) * surfaceGlow;
        color = mix(color, mix(mirror, above, window), clamp(seen, 0.0, 1.0));
      }
      gl_FragColor = vec4(color, 1.0);
      return;
    }
    float up = max(dir.y, 0.0);
    vec3 color = mix(horizon, zenith, pow(up, skyCurve));

    // Horizon silhouettes: distant land painted on the dome, so the real land, arriving out
    // of the haze at the edge of the fog, comes into a place that already had a shape there.
    // Three layers, far to near: each a wavy skyline (noise around the horizon as a circle,
    // so it has no seam; rounded bumps, which read as islands and hills in every biome), filled
    // below with a shade of the horizon's color, cooler and darker the nearer the layer. The
    // sun's haze is added after, so they sit in the air the same way the land does.
    if (silhouettes > 0.0) {
      vec2 ring = normalize(dir.xz + vec2(1e-5, 0.0));
      // Only around the horizon: nothing overhead, and nothing far below, where real land is
      float band = smoothstep(-0.3, -0.1, dir.y) * silhouettes;
      // Far: faint low hills right on the horizon
      float sky0 = noise(ring * 3.0 + vec2(11.0, 5.0)) * 0.03;
      // The mood's air says how far towards the zenith the layers go (silhouette.x) and how dark they are (.y)
      float fill = smoothstep(0.0, 0.008, sky0 - dir.y) * 0.15 * band;
      color = mix(color, mix(horizon, zenith, 0.12 * silhouette.x) * mix(1.0, 0.95, silhouette.y), fill);
      // Mid: a little lower and darker, with a second octave of detail
      float sky1 = (noise(ring * 5.0 + vec2(37.0, 19.0)) * 0.7 + noise(ring * 10.0 + vec2(3.0, 71.0)) * 0.3) * 0.05 - 0.012;
      fill = smoothstep(0.0, 0.005, sky1 - dir.y) * 0.25 * band;
      color = mix(color, mix(horizon, zenith, 0.18 * silhouette.x) * mix(1.0, 0.9, silhouette.y), fill);
      // Near: the darkest, the land the fog is about to give up
      float sky2 = (noise(ring * 8.0 + vec2(53.0, 29.0)) * 0.65 + noise(ring * 16.0 + vec2(91.0, 13.0)) * 0.35) * 0.08 - 0.025;
      fill = smoothstep(0.0, 0.003, sky2 - dir.y) * 0.4 * band;
      color = mix(color, mix(horizon, zenith, 0.22 * silhouette.x) * mix(1.0, 0.84, silhouette.y), fill);
    }

    color += sunGlow(dir);
    // The sun (or moon) itself, brighter than white so it blooms
    float d = dot(dir, atmoSunDirection);
    color += atmoSunColor * smoothstep(0.9990, 0.9994, d) * mix(discs.x, discs.y, night);

    // Painted clouds drifting overhead, lit from the sun's side with a silver lining
    // Project onto a cloud layer; clamp so directions below the horizon don't divide by zero
    vec2 uv = dir.xz / max(dir.y + 0.22, 0.05) * 1.4 + vec2(time * 0.006, time * 0.003);
    float shape = fbm(uv * 1.3) * 0.75 + fbm(uv * 4.1) * 0.25;
    float cover = smoothstep(0.52, 0.78, shape) * smoothstep(0.0, 0.18, dir.y);
    float lit = pow(max(d, 0.0), 4.0);
    vec3 cloud = mix(clouds * mix(0.85, 0.55, night) * cloudBright, atmoSunColor, lit * 0.55 + 0.1);
    cloud += atmoSunColor * pow(max(d, 0.0), 24.0) * (1.0 - smoothstep(0.6, 0.85, shape)) * 1.5;
    color = mix(color, cloud, cover * 0.85);

    // Aurora: curtains of green and violet light rippling along the sky
    if (aurora > 0.0) {
      // Around the horizon as a circle, so the noise has no seam
      vec2 ring = normalize(dir.xz + vec2(1e-5, 0.0));
      float wave = fbm(ring * 2.2 + vec2(time * 0.015, time * 0.04)) * 2.0;
      float top = 0.42 + 0.12 * sin(ring.x * 3.0 + ring.y * 2.0 + wave);
      float band = smoothstep(0.05, 0.16, dir.y) * (1.0 - smoothstep(top - 0.2, top, dir.y));
      float rays = pow(clamp(fbm(ring * 18.0 + vec2(wave * 2.5, time * 0.06)), 0.0, 1.0), 2.2);
      float fold = 0.45 + 0.55 * sin(ring.x * 7.0 - ring.y * 5.0 + wave * 3.0 + time * 0.12);
      vec3 hue = mix(vec3(0.2, 1.0, 0.55), vec3(0.65, 0.35, 1.0), smoothstep(0.12, top, dir.y));
      color += hue * band * rays * fold * aurora * 1.8 * (1.0 - cover * 0.6);
    }
    // Stars at night, twinkling
    if (night > 0.0) {
      vec3 cell = floor(dir * 220.0);
      float star = hash(cell.xy + cell.z * 7.31);
      float twinkle = 0.6 + 0.4 * sin(time * (2.0 + star * 4.0) + star * 40.0);
      float on = step(0.9965, star) * smoothstep(0.02, 0.25, dir.y) * (1.0 - cover);
      color += vec3(0.9, 0.92, 1.0) * on * twinkle * night * 1.6;
    }
    gl_FragColor = vec4(color, 1.0);
  }
`;

/** A sky dome: gradient, distant land along the horizon, sun disc and halo, clouds, and stars at night; under the sea, the water's surface from below */
export function skyMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      atmoSunDirection: ATMOSPHERE.sunDirection,
      atmoSunColor: ATMOSPHERE.sunColor,
      horizon: ATMOSPHERE.horizon,
      zenith: ATMOSPHERE.zenith,
      clouds: ATMOSPHERE.clouds,
      night: ATMOSPHERE.night,
      aurora: ATMOSPHERE.aurora,
      silhouettes: ATMOSPHERE.silhouettes,
      underwater: ATMOSPHERE.underwater,
      surface: ATMOSPHERE.surface,
      surfaceGlow: ATMOSPHERE.surfaceGlow,
      time: ATMOSPHERE.time,
      atmoGlow: ATMOSPHERE.glow,
      skyCurve: ATMOSPHERE.skyCurve,
      silhouette: ATMOSPHERE.silhouette,
      discs: ATMOSPHERE.discs,
      cloudBright: ATMOSPHERE.cloudBright,
    },
    vertexShader: skyVertex,
    fragmentShader: skyFragment,
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
  });
}
