// Every look-and-feel constant that isn't physics lives here, grouped so the
// ?tune panel can show one folder per group. None of these change how fast you
// fly or what you hit: the flight model (FLIGHT in flight.ts) does that.
// Tweaks made in the panel are remembered in this browser.

/** How the pilot moves on top of the flight model: rolls, the arm spread, bobbing, membranes, cloth */
export const ANIM = {
  armSpread: 1.15, // radians the arms open from the body while cruising
  spreadBrake: 0.45, // extra spread at full brake (arms out, membranes taut)
  tuckSpeed: 0.4, // how far the arms tuck in at full speed
  tuckBoost: 0.3, // extra tuck at full boost
  bankLead: 0.55, // limb/pelvis lean response to the bank rate
  bankSpring: 14, // stiffness of the lean spring; lower = floatier
  bankDamping: 0.42, // 1 = no overshoot, lower = a little wobble after a turn
  wingSweep: 0.5, // radians the wings sweep back per radian the arms tuck (forward when braking)
  wingDihedral: 0.12, // radians the wings angle up from the body plane at rest
  wingBank: 0.25, // how far the wings tilt into a bank ahead of the body
  bobAmount: 0.12, // metres of gentle up-and-down drift
  bobRate: 0.85, // cycles per second
  headLook: 0.5, // how much the head turns into a turn
  limbSwing: 1, // arm and leg reaction to turns and pitch
};

/** Trails, particles, wind and screen effects */
export const FX = {
  boostTrailGlow: 0.45,
  boostSparkles: 48, // fine gold dust and ivory slivers/second at full boost
  rollSparkles: 72, // gold twinkles and tiny flakes/second at mid-roll
  brakeWisps: 24, // particles/second at full brake
  trailLength: 1, // multiplier on ribbon length
  trailWidth: 1,
  trailGlow: 1, // brightness of the ribbons
  bodyTrail: true, // the wide silk ribbon from the cape
  sparkles: 0.65, // wingtip motes per metre, as a multiplier
  flapPuffs: 0.6, // feather puffs on each downstroke
  wingGrainSize: 0.1, // metres; small, distinct wingtip motes
  wingGrainLight: 1.1, // restrained brightness keeps adjacent grains separate
  wingPuffSize: 0.35, // metres; compact downstroke air, not glowing clouds
  skimDust: 1, // spray from the ground while skimming
  speedLines: 1, // wind streaks at speed
  speedLinesFrom: 45, // m/s where the wind streaks start
  glowShell: 1, // the pilot's glow: an unlit warm shell over the paper and a bright rim around its outline
  pilotGlow: 0.3, // the paper's own warm light (emissive), so the biome's sky never muddies it
  vignette: 1, // speed vignette at the screen edges
  bloom: 0.4, // glow strength (0 turns post-processing off)
  bloomRadius: 0.12,
  bloomHalo: 0.12, // contribution from the widest blur layers
  bloomThreshold: 1.3,
  bloomResolution: 1.5, // with bloom, the frame renders at most at this pixel ratio (its cost grows fast with it)
  bloomSamples: 0, // multisampling of the bloom's float target (very dear on integrated GPUs); 0 smooths edges with FXAA instead
  autoQuality: true, // drop effects if the frame rate can't keep up
};

/** The crystal gates */
export const RINGS = {
  crystals: 16, // crystals per gate (finish gets 1.5×); applies to the next map
  drift: 0.6, // metres each crystal bobs
  driftRate: 0.55,
  spin: 0.08, // how fast the cohort turns around the gate (rad/s)
  selfSpin: 0.6, // how fast each crystal turns on its own axis
  glow: 1, // inner glow of the lit gates (every gate still to take in a race)
  gateGlow: 0.15, // 0..1, how brightly a gate you haven't taken yet glows in a race (a whisper: they're optional); the finish glows fully
  motes: 28, // glowing motes that trace each gate's ring; applies to the next map
  moteSize: 0.7, // metres across, for a 13 m ring (smaller gates get smaller motes)
  moteDrift: 0.25, // metres each mote wanders from its place on the ring
  shatter: 1, // particles when you pass through
  passTime: 1.4, // seconds of the pass animation
  finishBeam: 1.6, // brightness of the finish gate's gold pillar (the only gate with one)
  finishBeamHeight: 2, // the finish pillar's height, in 700 m units; applies to the next map
};

/** The corridor markers: faint posts either side of the racing line, just inside the air wall. Looks only */
export const CORRIDOR = {
  postSpacing: 90, // metres of z between posts
  postLateral: 55, // metres from the racing line (the wind starts at FLIGHT.lateralLimit, 60)
  postOpacity: 0.3, // 0 hides them
  postHeight: 4, // metres
};

/** The chase camera */
export const CAMERA = {
  distance: 8.5, // metres behind at low speed
  distancePerSpeed: 0.035, // extra metres per m/s
  height: 2.6,
  lookAhead: 14,
  stiffness: 7, // how tightly it follows
  rollFollow: 0.18, // share of the pilot's bank the horizon follows
  fov: 58, // vertical degrees at low speed (about 88° across on 16:9)
  fovPerSpeed: 0.2, // extra degrees per m/s above 30
  fovMax: 14, // the speed stretch tops out here: 72° vertical, about 104° across
  shake: 0.03, // when skimming the ground at speed
  boostFov: 4,
  boostDistance: 1.2,
  pathFollow: 0.6,
  horizonRecovery: 1.5, // max camera roll correction in rad/s away from vertical
  ringPunch: 3, // FOV kick when passing a gate (degrees)
  // After a crash the camera arcs up over the pilot and looks down on the fall
  fallDistance: 11, // metres from the pilot once overhead…
  fallAngle: 70, // …at this many degrees above the horizon
  fallSwing: 3.2, // how fast it arcs up
  fallTrack: 7, // how tightly it keeps up with the falling body
};

export const TERRAIN_DETAIL = { mountainRelief: 3, facetScatter: 0.16 }; // bounded relief × biome roughness; reload workers after edits

// Worker geometry settings: changing these requires rebuilding/reloading workers.
export const MESH_CLEANUP = {
  fragmentMaxSize: 36, // only small closed fragments are removed (m)
  fragmentMinThickness: 0.18, // 3 * enclosed volume / surface area (m)
  fragmentThinRatio: 0.055, // thickness / longest extent: reject sheets and needles
  stoneMaxSize: 24, // compact pebbles get one subdivision below this size (m)
  stoneMaxFaces: 80, // cap refinement work; broad terrain stays coarse
  tipMinHeight: 1.5, // minimum attached needle height (m)
  tipWidthRatio: 0.3, // neighbour-ring radius / tip height
  tipMaxTrim: 3, // maximum attached-tip shortening (m)
};

/** Generator-v2 terrain streaming and appearance. Collisions follow the visible meshes. */
export const TERRAIN = {
  lodLookAheadSeconds: 3, // prepare approaching terrain three seconds ahead of current velocity
  lodLookAheadMax: 240, // cap extra detail extent during fast dives (m)
  freezeRadius: 80, // metres from the camera within which land already on screen keeps its level of detail (no split/merge, no plants popping)
  lodDetail: 140, // metres from any terrain node: finest 3 m cells, including side mountains
  lodNear: 300, // metres: 6 m cells before the finest approach tier
  lodFar: 700, // closer than this at half detail (12 m), further at quarter (24 m)
  lodHysteresis: 48, // extra distance before merging fine detail again
  cacheMiB: 48, // bounded cache of hidden terrain (estimated CPU + GPU buffers)
  viewDistance: 700, // metres: LOD 2 ceiling; LOD 3 (24 m) is skipped — sky silhouettes fill the far distance
  prefetchDistance: 1200, // metres: the workers generate land ahead out to here, held off screen until it comes within viewDistance
  decorationLateral: 80, // metres from the racing line beyond which land is decoration: never finer than decorationMaxLod
  decorationMaxLod: 2, // the finest level decoration land reaches (2: 12 m cells)
  readyRadius: 260, // the start waits until the land this close has arrived
  arrivalsPerFrame: 12, // arrived land meshes taken in per frame once you're flying (each costs about 0.04 ms)
  fadeIn: 1.8, // seconds for land that has just arrived to fade in out of the haze and its plants to grow in (a change of detail is instant)
  snowLine: 0, // metres added to the biome's snow line
  coverSlope: 0, // added to the slope where grass (moss, sand…) gives way to rock
  texture: 1, // strength of the painted noise on cliffs
  textureScale: 1,
  glow: 1, // glowing cracks and spots
};

/** Plants and grass. Looks only: colliders don't move with the wind */
export const FLORA = {
  wind: 1, // how hard the wind moves leaves and grass
  glow: 1, // self-lit mushroom caps and crystals
  grassDistance: 140, // metres: grass and flowers grow on screen within this
};

/** Towers, lanterns, windmills. Looks only: colliders are the swept shapes */
export const STRUCTURES = {
  lights: 1, // windows and lanterns (dim by day, glowing at night)
  sails: 1, // how fast windmill sails turn
};

/** Rivers, falls and seas */
export const WATER = {
  glitter: 1, // sun glitter on the water
  glow: 1, // lava and bioluminescent pools
  spray: 1, // spray when skimming the water, mist at the foot of falls
  fallBlend: 0.2, // short join just below the edge; the flat river keeps its shading
  fallSpeed: 3, // foam flows downward, accelerating as it falls
  lipFoam: 0.45, // subtle broken foam along outgoing waterfall edges
  lipFoamWidth: 0.9, // maximum upstream reach of edge foam, in metres
};

/** Levels under the sea (Sunken Reef). Looks only */
export const DEEP = {
  caustics: 1, // ripples of light running over the seabed
  shafts: 1, // shafts of light slanting down from the surface
  surface: 1, // how bright the water's surface is from below
  life: 1, // how brightly fish and jellyfish glow
  zapCycle: 4, // seconds between a jellyfish's discharges
  zapTelegraph: 0.5, // seconds it visibly charges up before one
  zapActive: 1, // seconds the discharge lasts
  zapGlow: 1.5, // how much brighter it burns while discharging (the shader caps the result just under the bloom threshold)
  jellyNear: 0.6, // share of the small jellyfish placed beside the racing line, in reach; applies to the next map
};

/** The autopilot (the menu's chase view): flies the racing line on rails */
export const AUTOPILOT = {
  railMinSpeed: 28, // m/s: the slowest it glides…
  railMaxSpeed: 48, // …and the fastest it dives
  railBank: 55, // degrees it banks into turns at most
  railLead: 0.35, // seconds it banks ahead of a turn
};

/** Music and sound levels */
export const AUDIO = {
  music: 0.45, // volume of the background music
  sfx: 1, // volume of the wingbeat samples
  crossfade: 3, // seconds to blend into the next biome's track
  nightDim: 0.25, // how much quieter the music gets at night
  nightMuffle: 0.55, // how much the highs are rolled off at night
};

const GROUPS = { ANIM, FX, RINGS, CORRIDOR, CAMERA, TERRAIN, FLORA, STRUCTURES, WATER, DEEP, AUTOPILOT, AUDIO } as const;
const DEFAULTS = JSON.parse(JSON.stringify(GROUPS)) as typeof GROUPS;
const STORAGE_KEY = "windrider.tuning.speed-control-v1";

type Group = Record<string, number | boolean>;

/** Applies tweaks saved in this browser (only keys that still exist, with the same type) */
export function loadTuning() {
  let saved: Record<string, Group>;
  try {
    saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}");
  } catch {
    return;
  }
  for (const [name, group] of Object.entries(GROUPS) as [string, Group][]) {
    for (const [key, value] of Object.entries(saved[name] ?? {})) {
      if (key in group && typeof group[key] === typeof value) group[key] = value;
    }
  }
}

export function saveTuning(extra: Record<string, Group> = {}) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...GROUPS, ...extra }));
  } catch {
    // Not persisted, still applies for this visit
  }
}

export function resetTuning() {
  for (const [name, group] of Object.entries(GROUPS) as [string, Group][]) {
    Object.assign(group, (DEFAULTS as unknown as Record<string, Group>)[name]);
  }
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Nothing saved
  }
}

/** Slider ranges for the ?tune panel; anything missing gets a range from its default */
export const RANGES: Record<string, [number, number, number?]> = {
  armSpread: [0.3, 1.6],
  spreadBrake: [0, 0.8],
  tuckSpeed: [0, 1],
  tuckBoost: [0, 0.8],
  boostTrailGlow: [0, 2],
  brakeWisps: [0, 60],
  boostFov: [0, 8],
  boostDistance: [0, 3],
  pathFollow: [0, 0.8],
  horizonRecovery: [0.1, 3],
  bankLead: [0, 1.5],
  bankSpring: [2, 40],
  bankDamping: [0.1, 1],
  wingSweep: [0, 1.5],
  wingDihedral: [-0.3, 0.6],
  wingBank: [0, 1],
  bobAmount: [0, 0.6],
  bobRate: [0, 3],
  headLook: [0, 1.5],
  limbSwing: [0, 2],
  trailLength: [0.2, 2.5],
  trailWidth: [0.2, 3],
  trailGlow: [0, 3],
  boostSparkles: [0, 100, 1],
  rollSparkles: [0, 140, 1],
  sparkles: [0, 4],
  flapPuffs: [0, 4],
  wingGrainSize: [0.04, 0.25],
  wingGrainLight: [0.2, 2],
  wingPuffSize: [0.1, 0.8],
  skimDust: [0, 4],
  speedLines: [0, 3],
  speedLinesFrom: [10, 100],
  glowShell: [0, 3],
  pilotGlow: [0, 1],
  vignette: [0, 2],
  bloom: [0, 2.5],
  bloomRadius: [0, 1],
  bloomHalo: [0, 1],
  bloomThreshold: [0.5, 1.5],
  bloomResolution: [0.5, 2, 0.05],
  bloomSamples: [0, 4, 1],
  crystals: [6, 32, 1],
  drift: [0, 3],
  driftRate: [0, 3],
  spin: [-1, 1],
  selfSpin: [0, 4],
  glow: [0, 3],
  gateGlow: [0, 1, 0.05],
  shatter: [0, 4],
  passTime: [0.4, 3],
  finishBeam: [0, 4],
  finishBeamHeight: [1, 4, 0.25],
  postSpacing: [40, 200, 10],
  postLateral: [20, 90],
  postOpacity: [0, 1, 0.05],
  postHeight: [1, 12, 0.5],
  distance: [3, 20],
  distancePerSpeed: [0, 0.1],
  height: [0, 8],
  lookAhead: [2, 40],
  stiffness: [1, 20],
  rollFollow: [0, 1],
  fov: [40, 100],
  fovPerSpeed: [0, 1],
  fovMax: [0, 50],
  shake: [0, 0.5],
  ringPunch: [0, 15],
  fallDistance: [5, 30],
  fallAngle: [20, 85],
  fallSwing: [0.5, 10],
  fallTrack: [1, 20],
  lodHysteresis: [0, 120, 4],
  cacheMiB: [0, 128, 8],
  lodLookAheadSeconds: [0, 5, 0.25],
  lodLookAheadMax: [0, 360, 20],
  freezeRadius: [0, 240, 10],
  lodDetail: [60, 240, 10],
  lodNear: [120, 600, 10],
  lodFar: [300, 1400, 10],
  viewDistance: [600, 2500, 10],
  prefetchDistance: [600, 4000, 50],
  decorationLateral: [20, 300, 10],
  decorationMaxLod: [0, 3, 1],
  readyRadius: [100, 500, 10],
  arrivalsPerFrame: [1, 32, 1],
  fadeIn: [0, 3, 0.05],
  snowLine: [-300, 300],
  coverSlope: [-0.4, 0.25],
  texture: [0, 3],
  textureScale: [0.2, 4],
  wind: [0, 4],
  lights: [0, 4],
  sails: [0, 4],
  glitter: [0, 4],
  spray: [0, 4],
  caustics: [0, 3],
  shafts: [0, 3],
  surface: [0, 2],
  life: [0, 3],
  zapCycle: [1, 12],
  zapTelegraph: [0.1, 2],
  zapActive: [0.2, 4],
  zapGlow: [0, 5],
  jellyNear: [0, 1],
  railMinSpeed: [15, 45],
  railMaxSpeed: [30, 80],
  railBank: [0, 80],
  railLead: [0, 1],
  grassDistance: [40, 300, 5],
  fallBlend: [0.05, 1, 0.05],
  fallSpeed: [0.5, 6, 0.1],
  lipFoam: [0, 1, 0.05],
  lipFoamWidth: [0.1, 2, 0.1],
  music: [0, 1],
  sfx: [0, 2],
  crossfade: [0.5, 10],
  nightDim: [0, 0.6],
  nightMuffle: [0, 1],
};

export const TUNING_GROUPS: [string, Group][] = [
  ["Pilot animation", ANIM],
  ["Trails & particles", FX],
  ["Crystal gates", RINGS],
  ["Corridor markers", CORRIDOR],
  ["Camera", CAMERA],
  ["Terrain", TERRAIN],
  ["Plants", FLORA],
  ["Structures", STRUCTURES],
  ["Water", WATER],
  ["Underwater", DEEP],
  ["Autopilot", AUTOPILOT],
  ["Audio", AUDIO],
];
