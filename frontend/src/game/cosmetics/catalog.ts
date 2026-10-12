/** Appearance only. Stable ids are saved independently of controls and scores. */
export const CAPES = [
  { id: "classic", name: "Wayfarer", description: "Your original cape, in your pilot color.", color: null, trim: "#f3c869", pattern: "diamond", width: 1, length: 1 },
  { id: "dawn", name: "Dawn sail", description: "An ivory swallowtail with a golden sun.", color: "#fff0cd", trim: "#eeb75c", pattern: "sun", width: 1.12, length: 1.05 },
  { id: "verdant", name: "Leafwhisper", description: "A scalloped green mantle with branching veins.", color: "#479d86", trim: "#e3d793", pattern: "leaf", width: 1.18, length: 0.9 },
  { id: "aurora", name: "Aurora veil", description: "A long violet cape embroidered with starlight.", color: "#8573bd", trim: "#b7ede8", pattern: "stars", width: 0.95, length: 1.15 },
  { id: "ember", name: "Phoenix mantle", description: "Warm coral feathers edged in molten gold.", color: "#d96657", trim: "#ffd885", pattern: "feathers", width: 1.16, length: 1.03 },
  { id: "royal", name: "Cloud court", description: "A broad sapphire cape with a gilded border.", color: "#4e7eb3", trim: "#f3d18b", pattern: "border", width: 1.22, length: 1.08 },
] as const;
export const HATS = [
  { id: "none", name: "Wind in your hair", description: "Keep your original hairstyle.", color: "#b7a1c4" },
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
 * Chunky faceted wings on the pilot's two animated wing joints; all are visual only.
 * `shape` picks the paddles' proportions (see PLANS in wings.ts), `color` the body
 * and `accent` the tip band, jewels and wingtip particles.
 */
export const WINGS = [
  { id: "classic", name: "Wayfarer feathers", description: "Your original feathered glider.", color: "#b98a63", accent: "#f6e6c8", shape: "feather" },
  { id: "prism", name: "Prismatic plumage", description: "Broad jewel-colored plates, a different hue on every one.", color: "#bc8aca", accent: "#69d9ce", shape: "feather" },
  { id: "gale", name: "Zephyr filigree", description: "Wide slate-blue sails on gilded spars.", color: "#7f93ad", accent: "#f3c869", shape: "sail" },
  { id: "tide", name: "Pearl tide", description: "Curling sea-green fins tipped with pearl.", color: "#4f9fa6", accent: "#eef6ff", shape: "fin" },
  { id: "frost", name: "Glacial cathedral", description: "Thick faceted ice shards with frosted points.", color: "#a9d6ea", accent: "#faf4ff", shape: "crystal" },
  { id: "ember", name: "Phoenix sunrise", description: "Swept flame tongues burning gold at the tips.", color: "#dd5a3c", accent: "#ffc864", shape: "flame" },
  { id: "storm", name: "Thunder sovereign", description: "Dark angular blades edged in crackling light.", color: "#5a4f6e", accent: "#f1c7ff", shape: "blade" },
  { id: "astral", name: "Constellation wings", description: "Deep indigo plates ending in glowing starlight.", color: "#4a4f9c", accent: "#dff0ff", shape: "stars" },
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
