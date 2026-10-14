import * as THREE from "three";
import { Builder } from "../items/models";
import type { Paint } from "../items/builder";
import { paintedModel, disposeModel } from "./models";
import { wingSpec, type WingId, type WingShape } from "./catalog";

// Chunky low-poly wings: each half of a wing is a thick spar along the arm bone
// with three broad faceted paddles fanning back from it, stacked like roof
// slates. Solid slabs, not feathers: they read as volume from any angle and
// match the voxel-cut terrain. ~360 vertices per side, 720 for the pair.

const WHITE = new THREE.Color("#ffffff");
const RAINBOW = ["#d98cc2", "#8d9fdf", "#73cbd5", "#8bd0b0", "#efc681", "#ef9a7a"];

/** How a style's paddles are cut: widths as a share of paddle length, thickness in metres, sweep curls the tip back */
const PLANS: Record<WingShape, { root: number; tip: number; thick: number; sweep: number }> = {
  feather: { root: .3, tip: .15, thick: .045, sweep: .07 },
  sail: { root: .42, tip: .26, thick: .05, sweep: .1 },
  fin: { root: .38, tip: .1, thick: .045, sweep: .17 },
  crystal: { root: .22, tip: .04, thick: .07, sweep: 0 },
  flame: { root: .3, tip: .04, thick: .045, sweep: .22 },
  blade: { root: .2, tip: .08, thick: .04, sweep: .03 },
  stars: { root: .27, tip: .13, thick: .05, sweep: .08 },
};

/**
 * A thick tapered slab along +x: a rectangle at the root narrowing to a smaller
 * one at the tip, which may be swept sideways. Eight corners, twelve flat facets.
 */
function slab(length: number, rootW: number, tipW: number, rootT: number, tipT: number, sweep: number) {
  const r = [[0, -rootW / 2, -rootT / 2], [0, rootW / 2, -rootT / 2], [0, rootW / 2, rootT / 2], [0, -rootW / 2, rootT / 2]];
  const e = [[length, sweep - tipW / 2, -tipT / 2], [length, sweep + tipW / 2, -tipT / 2], [length, sweep + tipW / 2, tipT / 2], [length, sweep - tipW / 2, tipT / 2]];
  // Each face as a quad wound counter-clockwise seen from outside
  const quads = [
    [r[0], r[3], r[2], r[1]], [e[0], e[1], e[2], e[3]], // root and tip caps
    [r[0], r[1], e[1], e[0]], [r[3], e[3], e[2], r[2]], // underside and lit face
    [r[0], e[0], e[3], r[3]], [r[1], r[2], e[2], e[1]], // trailing and leading edges
  ];
  const position = new Float32Array(quads.length * 18);
  let k = 0;
  for (const [a, b, c, d] of quads) for (const v of [a, b, c, a, c, d]) { position[k++] = v[0]; position[k++] = v[1]; position[k++] = v[2]; }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(position, 3));
  geometry.computeVertexNormals();
  return geometry;
}

/** Two-tone paddle paint with its facets baked in: a bright lit face, mid-tone edges and a shaded underside */
function paddlePaint(base: string, tip: string, length: number, thick: number): Paint {
  return (p, out) => {
    out.set(p.x > length * .64 ? tip : base);
    if (Math.abs(p.z) < thick * .3) out.multiplyScalar(.86);
    else if (p.z < 0) out.multiplyScalar(.74);
  };
}

const lighten = (hex: string, k: number) => `#${new THREE.Color(hex).lerp(WHITE, k).getHexString()}`;

/** Two merged pieces per side, attached to the existing flapping joints. */
export function buildWing(id: WingId, hand: number) {
  const spec = wingSpec(id), plan = PLANS[spec.shape];
  const inner = new Builder(), outer = new Builder();
  const trimmed = id === "gale" || id === "storm";
  // Thick spars along the arm bones give both halves a solid leading edge; gale and storm gild theirs
  inner.add(new THREE.BoxGeometry(.56, .075, .07), spec.color, 0, [.27, .035, .04], [0, 0, .13]);
  outer.add(new THREE.BoxGeometry(.42, .065, .06), spec.color, 0, [.2, -.025, .04], [0, 0, -.22]);
  if (trimmed) {
    inner.add(new THREE.BoxGeometry(.5, .028, .09), spec.accent, .3, [.27, .07, .04], [0, 0, .13]);
    outer.add(new THREE.BoxGeometry(.38, .024, .08), spec.accent, .3, [.2, .007, .04], [0, 0, -.22]);
  }
  // Three paddles per half: root position, angle (fanning back towards the feet) and length
  const paddles: [Builder, number, number, number, number][] = [
    [inner, .12, 0, -.75, .46], [inner, .26, .01, -1, .44], [inner, .4, .02, -1.25, .4],
    [outer, .06, 0, .1, .94], [outer, .12, -.03, -.38, .84], [outer, .18, -.07, -.86, .7],
  ];
  paddles.forEach(([builder, x, y, angle, length], i) => {
    const k = i % 3, z = k * .03;
    const base = id === "prism" ? RAINBOW[i % RAINBOW.length] : spec.color;
    const tip = id === "prism" ? lighten(base, .45) : spec.accent;
    const root = Math.max(.12, plan.root * length), tipW = Math.max(.03, plan.tip * length), thin = plan.thick * .55;
    const sweep = -plan.sweep * length; // the tip curls towards the trailing edge
    builder.add(slab(length, root, tipW, plan.thick, thin, sweep), paddlePaint(base, tip, length, plan.thick), 0, [x, y, z], [0, 0, angle]);
    // A faceted jewel on each primary's tip, where the wingtip particles are born
    if (builder === outer && !trimmed) {
      const gem = spec.shape === "crystal" || spec.shape === "flame" ? new THREE.ConeGeometry(.045, .13, 4) : new THREE.OctahedronGeometry(.05, 0);
      builder.add(gem, spec.accent, id === "astral" ? .7 : .45,
        [x + Math.cos(angle) * length - Math.sin(angle) * sweep, y + Math.sin(angle) * length + Math.cos(angle) * sweep, z], [0, 0, angle - Math.PI / 2]);
    }
  });
  const inside = paintedModel(inner), outside = paintedModel(outer);
  inside.scale.x = outside.scale.x = hand;
  inside.name = `${id}-inner`; outside.name = `${id}-outer`;
  return { inner: inside, outer: outside, dispose: () => { disposeModel(inside); disposeModel(outside); } };
}

/** Small paired wing token, also used by the test viewer. */
export function wingToken(id: WingId) {
  const group = new THREE.Group();
  for (const side of [-1, 1]) {
    const model = buildWing(id, side); model.outer.position.x = .54 * side;
    group.add(model.inner, model.outer);
  }
  return group;
}
