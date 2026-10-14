import * as THREE from "three";
import { Builder, buildItem, cyl, sphere, star } from "../items/models";
import { flatMaterial } from "../toon";
import type { HatId, ShoeId } from "./catalog";

const GOLD = "#f3c869", IVORY = "#fff4df";
// Each accessory owns its geometry; materials live for the lifetime of this module.
const flat = flatMaterial({ side: THREE.DoubleSide });
export function paintedModel(builder: Builder): THREE.Group {
  const group = new THREE.Group(), geometry = builder.build();
  group.add(new THREE.Mesh(geometry, flat));
  return group;
}
export function disposeModel(group: THREE.Group) {
  const geometries = new Set<THREE.BufferGeometry>();
  group.traverse(o => { if (o instanceof THREE.Mesh) geometries.add(o.geometry); });
  geometries.forEach(g => g.dispose());
  group.removeFromParent();
}

/** Centered on Avatar.slots.head, in the standing body's frame. */
export function buildHat(id: Exclude<HatId, "none">): THREE.Group {
  if (id === "aviatorCap") {
    const group = buildItem(id);
    group.position.set(0, 0.02, 0.01);
    group.rotation.x = 0.25;
    return group;
  }
  // starwitch
  const b = new Builder();
  b.add(cyl(0.28, 0.27, 0.022, 8), "#766098", 0, [0, 0.18, 0], [0, 0, 0], [1, 1, 0.85])
    .add(new THREE.ConeGeometry(0.18, 0.4, 6), "#9181bb", 0, [0.03, 0.39, 0.02], [0.05, 0, -0.18])
    .add(new THREE.TorusGeometry(0.169, 0.017, 6, 8), GOLD, 0.5, [0, 0.22, 0], [Math.PI / 2, 0, 0])
    .add(new THREE.TorusGeometry(0.044, 0.012, 6, 8, Math.PI * 1.5), GOLD, 0.5, [0, 0.27, -0.156], [0, 0, -0.7]);
  for (const s of [-1, 1]) b.add(star(0.025, 0.011, 0.008), IVORY, 0.3, [s * 0.09, 0.32, -0.125]);
  const group = paintedModel(b); group.name = id; return group;
}

/** Boots replace the original boot mesh, at the animated knee, so feet never double up. */
export function buildShoe(id: Exclude<ShoeId, "classic">, side: number): THREE.Group {
  const color = id === "cloud" ? IVORY : id === "petal" ? "#d586a6" : id === "frost" ? "#99c5dc" : "#dc8062";
  const b = new Builder()
    .add(new THREE.CapsuleGeometry(0.044, 0.18, 4, 6), color, 0, [0, -0.13, 0])
    .add(new THREE.CapsuleGeometry(0.038, 0.08, 4, 6), color, 0, [0, -0.3, -0.012], [0.25, 0, 0])
    .add(new THREE.TorusGeometry(0.047, 0.012, 6, 8), GOLD, 0.35, [0, -0.03, 0], [Math.PI / 2, 0, 0]);
  // Decorative leaves (cloud wings, petal cuffs, ember fins) were removed: thin plates are
  // regenerated later in the chunky style. `side` stays for the mirrored decorations to come.
  void side;
  if (id === "cloud") {
    // (winged ankles to be redone)
  } else if (id === "petal") {
    // (petal cuffs to be redone)
  } else if (id === "frost") {
    for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4; b.add(sphere(0.018, 6, 5), IVORY, 0, [Math.sin(a) * 0.044, -0.03, Math.cos(a) * 0.044]); }
    b.add(new THREE.OctahedronGeometry(0.025), "#c1eeef", 0.45, [0, -0.12, -0.043]);
  } else {
    b.add(sphere(0.04, 8, 6), GOLD, 0.3, [0, -0.32, -0.026], [0, 0, 0], [0.95, 0.85, 0.8]);
  }
  const group = paintedModel(b); group.name = id; return group;
}
