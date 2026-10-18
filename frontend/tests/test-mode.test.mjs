import test from "node:test";
import assert from "node:assert/strict";
import { screenFromSearch, urlFor } from "../src/route.ts";

test("?test opens the test sandbox, however it is added to a URL", () => {
  const screen = (search) => screenFromSearch(search, true);
  assert.deepEqual(screen("?test"), { kind: "test", biome: "verdant", seed: 1 });
  assert.deepEqual(screen("?test=verdant&seed=2"), { kind: "test", biome: "verdant", seed: 2 });
  assert.deepEqual(screen("?seed=42&test"), { kind: "test", biome: "verdant", seed: 42 });
  assert.deepEqual(screen("?test=1"), { kind: "test", biome: "verdant", seed: 1 });
  assert.deepEqual(screen("?test=nowhere"), { kind: "test", biome: "verdant", seed: 1 });
  assert.deepEqual(screen("?test=toString"), { kind: "test", biome: "verdant", seed: 1 });
  // Multiplayer never runs in test mode
  assert.deepEqual(screen("?room=ABCDE&test"), { kind: "room", code: "ABCDE" });
  // Without test, nothing changed
  assert.deepEqual(screen("?seed=42"), { kind: "solo", seed: 42 });
  assert.deepEqual(screen(""), { kind: "menu" });
  assert.equal(urlFor({ kind: "test", biome: "verdant", seed: 2 }), "/?test=verdant&seed=2");
});
