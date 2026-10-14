import * as THREE from "three";
import { fxTime } from "./particles";

// Shared light parameters for glow effects (gold trims, wingtips, flora, water).

export const FX_LIGHT = {
  rimColor: { value: new THREE.Color("#fff4e0") },
  glow: { value: 0.15 },
  time: fxTime,
};

/** @deprecated Use FX_LIGHT instead */
export const TOON_LIGHT = FX_LIGHT;

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

/** @deprecated Use flatMaterial instead */
export function toonMaterial(options: { rim?: number; rimColor?: THREE.ColorRepresentation; emissive?: THREE.ColorRepresentation; side?: THREE.Side; ghost?: boolean } = {}): THREE.MeshLambertMaterial {
  return flatMaterial(options);
}
