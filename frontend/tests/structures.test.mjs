import test from "node:test";
import assert from "node:assert/strict";
import { World } from "../src/game/world/World.ts";
import { makeLevel } from "../src/game/world/biomes/index.ts";
import { placeFlora } from "../src/game/world/flora/placement.ts";
import { PLANT_STRIDE } from "../src/game/world/flora/species.ts";
import { STRUCTURE_INFO, kindInfo } from "../src/game/world/structures/kinds.ts";
import { Plant } from "../src/game/world/trees.ts";

test("a windmill collides with its tower and the disc its sails sweep, turned by its yaw", () => {
  const shape = STRUCTURE_INFO.windmill.collider;
  const h = 20;
  // Yaw 0: the sails face +z, 0.21 h out front, around the hub at 0.78 h
  const mill = new Plant(0, 0, 0, h, h, 0, shape);
  assert.ok(mill.distance(0, 0.4 * h, 0) < 0, "inside the tower");
  assert.ok(mill.distance(0.4 * h, 0.78 * h, 0.21 * h) < 0, "a sail's tip");
  assert.ok(mill.distance(0.4 * h, 0.78 * h, -0.1 * h) > 1, "beside the tower, behind the sails");
  assert.ok(mill.distance(0.4 * h, 0.78 * h, 0.21 * h + 3) > 1, "in front of the sails");
  // A quarter turn: the sails face +x
  const turned = new Plant(0, 0, 0, h, h, Math.PI / 2, shape);
  assert.ok(turned.distance(0.21 * h, 0.78 * h, 0.4 * h) < 0);
  assert.ok(turned.distance(0.4 * h, 0.78 * h, 0.21 * h) > 1);
});

test("structures stand in the same spots at every level of detail, clear of the racing line", () => {
  const world = new World(makeLevel({ biome: "archipelago", seed: 2, mood: 0 }));
  const species = world.biome.vegetation.species.length;
  const built = (box) => {
    const out = [];
    const { plants } = placeFlora(world, box, 1); // (LOD 1: every kind, no grass)
    for (let o = 0; o < plants.length; o += PLANT_STRIDE) if (plants[o] >= species) out.push(Array.from(plants.slice(o, o + PLANT_STRIDE)));
    return out;
  };
  const key = (p) => p.map((n) => n.toFixed(3)).join(",");
  const z0 = 768;
  const x0 = Math.floor(world.course.x(z0 + 192) / 384) * 384;
  const y0 = Math.floor(world.course.y(z0 + 192) / 384) * 384;
  const coarse = [];
  const fine = [];
  for (const dy of [-384, 0]) {
    coarse.push(...built({ x0, y0: y0 + dy, z0, x1: x0 + 384, y1: y0 + dy + 384, z1: z0 + 384 }));
    for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) for (let k = 0; k < 4; k++) {
      const x = x0 + i * 96, y = y0 + dy + j * 96, z = z0 + k * 96;
      fine.push(...built({ x0: x, y0: y, z0: z, x1: x + 96, y1: y + 96, z1: z + 96 }));
    }
  }
  assert.ok(coarse.length > 3, `only ${coarse.length} structures`);
  assert.deepEqual(fine.map(key).sort(), coarse.map(key).sort());
  for (const p of coarse) {
    const [kind, x, y, z, height, radius, yaw] = p;
    const collider = new Plant(x, y, z, height, radius, yaw, kindInfo(world.biome, kind).collider);
    for (let cz = z - 30; cz <= z + 30; cz += 2) {
      assert.ok(collider.distance(world.course.x(cz), world.course.y(cz), cz) > 3, "a structure reaches into the racing line");
    }
  }
});

test("a shrine gate collides with its posts and lintel, and is open in between", () => {
  const h = 20;
  // Yaw 0: the posts stand 0.36 h either side along x, the opening looks along z
  const gate = new Plant(0, 0, 0, h, h, 0, STRUCTURE_INFO.shrineGate.collider);
  assert.ok(gate.distance(0.36 * h, 0.4 * h, 0) < 0, "inside a post");
  assert.ok(gate.distance(0, 0.86 * h, 0) < 0, "inside the lintel");
  assert.ok(gate.distance(0, 0.4 * h, 0) > 4, "through the opening");
  const turned = new Plant(0, 0, 0, h, h, Math.PI / 2, STRUCTURE_INFO.shrineGate.collider);
  assert.ok(turned.distance(0, 0.4 * h, 0.36 * h) < 0, "a post, turned a quarter");
});

test("every run biome has a landmark and scattered structures, the same at every level of detail", () => {
  for (const biome of ["glacier", "archipelago", "lagoon", "twilight", "reef"]) {
    const world = new World(makeLevel({ biome, seed: 5, mood: 0 }));
    const species = world.biome.vegetation.species.length;
    const kinds = world.biome.structures;
    assert.ok(species + kinds.length <= 16, `${biome}: more kinds than the impostor atlas has cells`);
    assert.ok(kinds[0].landmark, `${biome}: the landmark comes first`);
    const built = (box, out) => {
      const { plants } = placeFlora(world, box, 1);
      for (let o = 0; o < plants.length; o += PLANT_STRIDE) if (plants[o] >= species) out.push(Array.from(plants.slice(o, o + PLANT_STRIDE)).map((n) => n.toFixed(3)).join(","));
    };
    const coarse = [];
    const fine = [];
    const landmarks = new Set();
    for (let band = 0; band < 6; band++) {
      const z0 = band * 384;
      const x0 = Math.floor(world.course.x(z0 + 192) / 384) * 384;
      const y0 = Math.floor(world.course.y(z0 + 192) / 384) * 384;
      for (const dx of [-384, 0, 384]) for (const dy of [-384, 0]) built({ x0: x0 + dx, y0: y0 + dy, z0, x1: x0 + dx + 384, y1: y0 + dy + 384, z1: z0 + 384 }, coarse);
      if (band !== 2) continue;
      for (const dy of [-384, 0]) for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) for (let k = 0; k < 4; k++) {
        const x = x0 + i * 96, y = y0 + dy + j * 96, z = z0 + k * 96;
        built({ x0: x, y0: y, z0: z, x1: x + 96, y1: y + 96, z1: z + 96 }, fine);
      }
    }
    for (const p of coarse) if (Number(p.split(",")[0]) === species) landmarks.add(p);
    assert.ok(landmarks.size >= 1 && landmarks.size <= 3, `${biome}: ${landmarks.size} landmarks`);
    assert.ok(coarse.length > 15, `${biome}: only ${coarse.length} structures`);
    const here = new Set(coarse);
    assert.ok(fine.length > 0 && fine.every((p) => here.has(p)), `${biome}: full-detail nodes disagree with coarse ones`);
  }
});

test("the Einstein bust is a rare landmark close to the racing line", () => {
  // On the islands now: about one level in three has one, never more than one, always beside the line
  const find = (seed) => {
    const world = new World(makeLevel({ biome: "archipelago", seed, mood: 0 }));
    assert.equal(world.biome.structures[1].id, "einsteinBust");
    const kind = world.biome.vegetation.species.length + 1;
    const out = [];
    for (let iz = 0; iz < 7; iz++) {
      const cx = Math.floor(world.course.x(iz * 384 + 192) / 384), cy = Math.floor(world.course.y(iz * 384 + 192) / 384);
      for (let ix = cx - 1; ix <= cx + 1; ix++) for (let iy = cy - 1; iy <= cy + 1; iy++) {
        const { plants } = placeFlora(world, { x0: ix * 384, y0: iy * 384, z0: iz * 384, x1: ix * 384 + 384, y1: iy * 384 + 384, z1: iz * 384 + 384 }, 3);
        for (let o = 0; o < plants.length; o += PLANT_STRIDE) if (plants[o] === kind && plants[o + 3] < 2400) out.push(Math.abs(plants[o + 1] - world.course.x(plants[o + 3])));
      }
    }
    return out;
  };
  // One per 2400 m stretch at most: the scan stops at the first stretch's end
  let levels = 0;
  for (let seed = 1; seed <= 24; seed++) {
    const near = find(seed);
    assert.ok(near.length <= 1, `seed ${seed}: ${near.length} busts`);
    if (near.length) {
      levels++;
      assert.ok(near[0] >= 25 && near[0] <= 140, `seed ${seed}: ${near[0]} m from the line`);
    }
  }
  assert.ok(levels >= 3 && levels <= 14, `${levels} of 24 levels have the bust`);
});

test("island ponds sit in clean bowls under a rock lip, their water is solid, and lanterns gather by them", () => {
  for (const seed of [2, 5]) {
    const world = new World(makeLevel({ biome: "archipelago", seed, mood: 0 }));
    const field = world.land;
    const ponds = world.islandPonds;
    assert.ok(ponds.length >= 12, `seed ${seed}: only ${ponds.length} ponds`);
    for (const p of ponds) {
      assert.ok(field.distance(p.x, p.level + 0.3, p.z) > 0.5, "air over the water");
      assert.ok(field.distance(p.x, p.level - 1.5, p.z) > 0.3, "the bowl is open under the water");
      assert.ok(field.distance(p.x, p.level - 4.5, p.z) < 0, "rock under the bowl");
      for (let k = 0; k < 12; k++) {
        const a = (k / 12) * Math.PI * 2;
        assert.ok(field.distance(p.x + Math.cos(a) * (p.r + 1.8), p.level + 0.3, p.z + Math.sin(a) * (p.r + 1.8)) < 0.2, "the lip is rock all round");
      }
      // The water is solid like a river pool, though the rock under it is open
      assert.ok(world.distance(p.x, p.level - 0.5, p.z) < 0, "the water counts as solid");
      assert.ok(world.course.distance(p.x, p.level, p.z) >= 24, "clear of the racing tube");
    }
    // The wet lanterns (the last structure) all stand by a pond
    const wetKind = world.biome.vegetation.species.length + world.biome.structures.length - 1;
    assert.equal(world.biome.structures.at(-1).where.wet, true);
    let lanterns = 0;
    for (let iz = 0; iz < 6; iz++) {
      const cx = Math.floor(world.course.x(iz * 384 + 192) / 384), cy = Math.floor(world.course.y(iz * 384 + 192) / 384);
      for (let ix = cx - 1; ix <= cx + 1; ix++) for (let iy = cy - 1; iy <= cy + 1; iy++) {
        const { plants } = placeFlora(world, { x0: ix * 384, y0: iy * 384, z0: iz * 384, x1: ix * 384 + 384, y1: iy * 384 + 384, z1: iz * 384 + 384 }, 1);
        for (let o = 0; o < plants.length; o += PLANT_STRIDE) {
          if (plants[o] !== wetKind) continue;
          lanterns++;
          assert.ok(ponds.some((p) => Math.hypot(plants[o + 1] - p.x, plants[o + 3] - p.z) < p.r + 12), "a wet lantern away from any pond");
        }
      }
    }
    assert.ok(lanterns >= 10, `seed ${seed}: only ${lanterns} lanterns by the ponds`);
  }
});

test("island bridges: gate bridges arch over a clear line, scenery bridges join two islands off it", async () => {
  const { Bridge } = await import("../src/game/world/terrain/shapes.ts");
  let gateBridges = 0, scenery = 0;
  for (const seed of [2, 5, 7]) {
    const world = new World(makeLevel({ biome: "archipelago", seed, mood: 0 }));
    const field = world.land;
    const all = field.shapes.filter((s) => s instanceof Bridge);
    const off = new Set(world.islandBridges);
    scenery += off.size;
    for (const b of all) {
      const top = b.water + b.span.crown;
      const onLine = !off.has(b);
      if (onLine) gateBridges++;
      // The deck: rock under its crown, air over it, the arch open under it
      assert.ok(field.distance(b.cx, top - 1.5, b.cz) < 0, `${seed}: no deck under the crown`);
      assert.ok(field.distance(b.cx, top + 2.5, b.cz) > 0, `${seed}: rock over the deck`);
      assert.ok(field.distance(b.cx, b.water, b.cz) > 2, `${seed}: the arch is closed`);
      // The ends land in rock (the deck's own, or the island's)
      for (const s of [-1, 1]) {
        const u = s * (b.span.half - 1.5);
        assert.ok(field.distance(b.cx + b.ax * u, b.water + b.slope * u + b.span.foot - 1.5, b.cz + b.az * u) < 0.5, `${seed}: an end hangs in the air`);
      }
      if (onLine) {
        // A gate bridge: its arch centred on the line, and the tube under it clear
        assert.ok(world.course.distance(b.cx, b.water, b.cz) < 5, `${seed}: a gate bridge off the line`);
        assert.ok(world.land.distance(world.course.x(b.cz), world.course.y(b.cz), b.cz) >= 10.9, `${seed}: the tube is blocked under a bridge`);
      } else {
        // Scenery: nowhere near the tube
        assert.ok(world.course.distance(b.cx, top, b.cz) >= 20, `${seed}: a scenery bridge crowds the line`);
      }
    }
  }
  assert.ok(gateBridges >= 3, `only ${gateBridges} gate bridges over three courses`);
  assert.ok(scenery >= 15, `only ${scenery} scenery bridges over three courses`);
});

test("a shipwreck collides with its hull and its mast, which leans back with the bow up", () => {
  const h = 26;
  // Yaw 0: the hull runs along x, bow towards +x
  const wreck = new Plant(0, 0, 0, h, h, 0, STRUCTURE_INFO.shipwreck.collider);
  assert.ok(wreck.distance(0.7 * h, 0.15 * h, 0) < 0, "inside the bow");
  assert.ok(wreck.distance(-0.7 * h, 0.15 * h, 0) < 0, "inside the stern");
  assert.ok(wreck.distance(-0.13 * h, 0.9 * h, 0) < 0, "the top of the mast, leaning aft");
  assert.ok(wreck.distance(0.13 * h, 0.9 * h, 0) > 2, "ahead of the mast");
  assert.ok(wreck.distance(0.5 * h, 0.6 * h, 0) > 4, "over the foredeck");
  assert.ok(wreck.distance(0, 0.15 * h, 0.4 * h) > 3, "beside the hull");
});

