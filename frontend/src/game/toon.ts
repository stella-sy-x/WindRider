import * as THREE from "three";
import { fxTime } from "./particles";

// Shared light parameters for glow effects (gold trims, wingtips, flora, water).

export const FX_LIGHT = {
  rimColor: { value: new THREE.Color("#fff4e0") },
  glow: { value: 0.15 },
  time: fxTime,
};

/** Pure white, shared by effects that lerp or emit towards it. Never mutate it */
export const WHITE = new THREE.Color("#ffffff");

/** The local pilot's color (light gold, the paper's own): solo, test and the menu backdrop. Rooms hand out rooms.py's COLORS, which open with the same gold */
export const PLAYER_COLOR = "#f2d27a";

/** The one gold every glowing particle uses (wingtip motes, gate shatter, skim sparks, the finish gate): the pilot's own light gold. Never mutate it */
export const GOLD = new THREE.Color(PLAYER_COLOR);

export interface MaterialOptions {
  emissive?: THREE.ColorRepresentation;
  side?: THREE.Side;
  ghost?: boolean;
}

/** A flat-shaded material with vertex colors */
export function flatMaterial(options: MaterialOptions = {}): THREE.MeshLambertMaterial {
  const ghost = !!options.ghost;
  return new THREE.MeshLambertMaterial({
    vertexColors: true,
    flatShading: true,
    side: options.side ?? THREE.FrontSide,
    transparent: ghost,
    opacity: ghost ? 0.4 : 1,
    depthWrite: !ghost,
    emissive: options.emissive ?? 0x000000,
  });
}
