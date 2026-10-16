/**
 * Appearance only. Stable ids are saved independently of controls and scores.
 * The cape slot now colors the wingsuit's tail fin (the fabric between the legs):
 * `color` is its fabric and `trim` its lit edges; "classic" uses the pilot's own color.
 */
export const CAPES = [
  { id: "classic", name: "Wayfarer", description: "Your suit's own tail fin, in your pilot color.", color: null, trim: "#f3c869", pattern: "diamond", width: 1, length: 1 },
  { id: "dawn", name: "Dawn sail", description: "An ivory swallowtail with a golden sun.", color: "#fff0cd", trim: "#eeb75c", pattern: "sun", width: 1.12, length: 1.05 },
  { id: "verdant", name: "Leafwhisper", description: "A scalloped green mantle with branching veins.", color: "#479d86", trim: "#e3d793", pattern: "leaf", width: 1.18, length: 0.9 },
  { id: "aurora", name: "Aurora veil", description: "A long violet cape embroidered with starlight.", color: "#8573bd", trim: "#b7ede8", pattern: "stars", width: 0.95, length: 1.15 },
  { id: "ember", name: "Phoenix mantle", description: "Warm coral feathers edged in molten gold.", color: "#d96657", trim: "#ffd885", pattern: "feathers", width: 1.16, length: 1.03 },
  { id: "royal", name: "Cloud court", description: "A broad sapphire cape with a gilded border.", color: "#4e7eb3", trim: "#f3d18b", pattern: "border", width: 1.22, length: 1.08 },
] as const;
export const HATS = [
  { id: "none", name: "Flight helmet", description: "Keep your suit's own helmet and visor.", color: "#b7a1c4" },
  { id: "aviatorCap", name: "Aviator cap", description: "The original cap and gold-rimmed goggles.", color: "#916449" },
  { id: "starwitch", name: "Stargazer hat", description: "A soft violet point, crescent and tiny stars.", color: "#8b78ba" },
] as const;
export const SHOES = [
  { id: "classic", name: "Wayfarer boots", description: "Your original dark boots with gold cuffs.", color: "#3a3245" },
  { id: "cloud", name: "Cloud slippers", description: "Ivory slippers with little winged ankles.", color: "#f7edd9" },
  { id: "petal", name: "Petal steps", description: "Rose shoes with overlapping petal cuffs.", color: "#d586a6" },
  { id: "frost", name: "Frost walkers", description: "Powder-blue boots, fluffy cuffs and crystal buckles.", color: "#99c5dc" },
  { id: "ember", name: "Ember greaves", description: "Coral boots with gold toes and flame-shaped fins.", color: "#dc8062" },
] as const;
export type CapeId = typeof CAPES[number]["id"];
/**
 * The wingsuit's arm membranes (the fabric between each arm and the torso); all are
 * visual only. `color` is the membrane fabric and `accent` its lit edges and the
 * wingtip particles; "classic" uses the pilot's own suit color. `shape` is kept for
 * the wardrobe token (wings.ts), which still shows the old paddle wings.
 */
export const WINGS = [
  { id: "classic", name: "Wayfarer membranes", description: "Your suit's own fabric, edged in its accent light.", color: "#b98a63", accent: "#f6e6c8", shape: "feather" },
  { id: "prism", name: "Prismatic membranes", description: "Jewel-violet fabric with sea-glass edge light.", color: "#bc8aca", accent: "#69d9ce", shape: "feather" },
  { id: "gale", name: "Zephyr sails", description: "Slate-blue fabric seamed in gold.", color: "#7f93ad", accent: "#f3c869", shape: "sail" },
  { id: "tide", name: "Pearl tide", description: "Sea-green fabric with pearl-white edges.", color: "#4f9fa6", accent: "#eef6ff", shape: "fin" },
  { id: "frost", name: "Glacial sails", description: "Frosted ice-blue fabric, white at the edges.", color: "#a9d6ea", accent: "#faf4ff", shape: "crystal" },
  { id: "ember", name: "Phoenix sunrise", description: "Flame-red fabric burning gold along the edges.", color: "#dd5a3c", accent: "#ffc864", shape: "flame" },
  { id: "storm", name: "Thunder sovereign", description: "Dark fabric edged in crackling light.", color: "#5a4f6e", accent: "#f1c7ff", shape: "blade" },
  { id: "astral", name: "Constellation sails", description: "Deep indigo fabric lit with starlight at the edges.", color: "#4a4f9c", accent: "#dff0ff", shape: "stars" },
] as const;
export type WingId = typeof WINGS[number]["id"];
export type WingShape = typeof WINGS[number]["shape"];
const wingById = Object.fromEntries(WINGS.map(w => [w.id, w])) as Record<WingId, typeof WINGS[number]>;
export const wingSpec = (id: WingId) => wingById[id] ?? WINGS[0];
export type HatId = typeof HATS[number]["id"];
export type ShoeId = typeof SHOES[number]["id"];
export type CapeSpec = typeof CAPES[number];
const capeById = Object.fromEntries(CAPES.map(c => [c.id, c])) as Record<CapeId, CapeSpec>;
export const capeSpec = (id: CapeId): CapeSpec => capeById[id];
