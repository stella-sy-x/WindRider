import test from "node:test";
import assert from "node:assert/strict";
import { BIOMES } from "../src/game/world/biomes/index.ts";
import { LOOK_DEFAULTS, LOOK_TUNING, biomeOf, lookDiff, lookEdited, lookFor, lookWritten, resetLook, resolveLook } from "../src/game/world/look.ts";

const moods = Object.values(BIOMES).flatMap((biome) => biome.moods.map((palette) => ({ biome, palette })));

test("every mood has a one-sentence brief and belongs to its biome", () => {
  for (const { biome, palette } of moods) {
    assert.ok(palette.brief.length > 20, `${biome.id} ${palette.name} has a brief`);
    assert.equal(biomeOf(palette), biome);
  }
});

test("a mood's look is the defaults under its biome's look under its own, with every number present", () => {
  const leaves = (o, path = "") => Object.entries(o).flatMap(([k, v]) => (v && typeof v === "object" && !Array.isArray(v) ? leaves(v, `${path}${k}.`) : [[`${path}${k}`, v]]));
  const wanted = leaves(LOOK_DEFAULTS).map(([k]) => k);
  for (const { biome, palette } of moods) {
    const look = resolveLook(palette);
    const have = leaves(look);
    for (const key of wanted) assert.ok(have.some(([k, v]) => k === key && v !== undefined), `${biome.id} ${palette.name} has ${key}`);
    // Whatever the biome writes shows unless the mood writes it too
    for (const [group, part] of Object.entries(biome.look ?? {})) {
      for (const [key, value] of Object.entries(part)) {
        const own = palette.look?.[group]?.[key];
        assert.deepEqual(look[group][key], own === undefined ? value : own, `${biome.id} ${palette.name} ${group}.${key}`);
      }
    }
    for (const [group, part] of Object.entries(palette.look ?? {})) {
      for (const [key, value] of Object.entries(part)) assert.deepEqual(look[group][key], value, `${biome.id} ${palette.name} ${group}.${key}`);
    }
  }
});

test("the look in use follows the override: edited numbers with it on, the written ones off", () => {
  const { palette } = moods[0];
  const written = lookWritten(palette);
  const edited = lookEdited(palette);
  assert.notEqual(written, edited);
  assert.deepEqual(edited, written);
  edited.air.fogNear = written.air.fogNear + 50;
  assert.equal(lookFor(palette), written);
  LOOK_TUNING.override = true;
  assert.equal(lookFor(palette), edited);
  assert.deepEqual(lookDiff(palette).air, { fogNear: written.air.fogNear + 50 });
  LOOK_TUNING.override = false;
  const reset = resetLook(palette);
  assert.deepEqual(reset, written);
  assert.equal(lookEdited(palette), reset);
  assert.deepEqual(lookDiff(palette), {});
});

test("the defaults are shared with nobody: resolving never hands out LOOK_DEFAULTS' own objects", () => {
  const look = resolveLook(moods[0].palette);
  assert.notEqual(look.air, LOOK_DEFAULTS.air);
  assert.notEqual(look.particles.motes, LOOK_DEFAULTS.particles.motes);
  assert.notEqual(look.gates.flash, LOOK_DEFAULTS.gates.flash);
});
