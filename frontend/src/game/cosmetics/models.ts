import * as THREE from "three";
import type { Builder } from "../items/models";
import { flatMaterial } from "../toon";

// Shared helpers for small painted models (the companion pets): one flat
// material for the lifetime of this module, and a disposer that frees each
// geometry once. The wardrobe that used to live here is gone; the pilot has
// one fixed look (avatar.ts).
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
