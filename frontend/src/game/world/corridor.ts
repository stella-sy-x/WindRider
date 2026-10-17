import * as THREE from "three";
import { CORRIDOR, TERRAIN } from "../tuning";
import type { Course } from "./course";

// The corridor markers: a row of faint glowing posts either side of the racing
// line, just inside the air wall (Game.airWall, FLIGHT.lateralLimit), so the
// boundary that pushes the pilot back can be seen before it is felt. One
// InstancedMesh; the posts ahead of the camera are re-placed as it flies on
// (those left behind move to the front). Looks only: the wall itself is in Game.

/** Posts per side at most, whatever the spacing and view distance are tuned to */
const MAX_PER_SIDE = 48;

const tmpMatrix = new THREE.Matrix4();
const tmpPosition = new THREE.Vector3();
const tmpScale = new THREE.Vector3();
const tmpLine = new THREE.Vector3();
const identity = new THREE.Quaternion();
const hidden = new THREE.Matrix4().makeScale(0, 0, 0);

export class CorridorMarkers {
  readonly mesh: THREE.InstancedMesh;
  private readonly course: Course;
  private readonly geometry: THREE.BufferGeometry;
  private readonly material: THREE.MeshBasicMaterial;
  /** z of the first (rearmost) post pair placed, and the settings it was placed with */
  private placedZ = NaN;
  private placedSpacing = NaN;
  private placedLateral = NaN;
  private placedHeight = NaN;
  private placedCount = -1;

  constructor(course: Course, accent: THREE.Color) {
    this.course = course;
    // A tapered pillar, 5-sided, standing on its origin; its height comes from the instance scale
    this.geometry = new THREE.CylinderGeometry(0.3, 0.15, 1, 5, 1);
    this.geometry.translate(0, 0.5, 0);
    this.material = new THREE.MeshBasicMaterial({
      color: accent.clone().lerp(new THREE.Color("#ffffff"), 0.2),
      transparent: true,
      opacity: CORRIDOR.postOpacity,
      depthWrite: false,
    });
    this.mesh = new THREE.InstancedMesh(this.geometry, this.material, MAX_PER_SIDE * 2);
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 1;
  }

  /** Per frame: the posts cover the stretch of corridor from just behind the camera to the view distance ahead */
  update(camera: THREE.Camera) {
    const spacing = Math.max(20, CORRIDOR.postSpacing);
    const perSide = Math.min(MAX_PER_SIDE, Math.ceil(TERRAIN.viewDistance / spacing) + 2);
    const z0 = Math.floor((camera.position.z - spacing) / spacing) * spacing;
    this.material.opacity = CORRIDOR.postOpacity;
    this.mesh.visible = CORRIDOR.postOpacity > 0.001;
    if (
      z0 === this.placedZ &&
      spacing === this.placedSpacing &&
      CORRIDOR.postLateral === this.placedLateral &&
      CORRIDOR.postHeight === this.placedHeight &&
      perSide === this.placedCount
    )
      return;
    this.placedZ = z0;
    this.placedSpacing = spacing;
    this.placedLateral = CORRIDOR.postLateral;
    this.placedHeight = CORRIDOR.postHeight;
    this.placedCount = perSide;

    const { course } = this;
    const first = course.start.z - 60;
    const last = course.endZ + 40;
    tmpScale.set(1, Math.max(0.1, CORRIDOR.postHeight), 1);
    for (let i = 0; i < perSide; i++) {
      const z = z0 + i * spacing;
      if (z < first || z > last) {
        this.mesh.setMatrixAt(i * 2, hidden);
        this.mesh.setMatrixAt(i * 2 + 1, hidden);
        continue;
      }
      course.pointAt(z, tmpLine);
      for (let side = 0; side < 2; side++) {
        const x = tmpLine.x + (side === 0 ? -1 : 1) * CORRIDOR.postLateral;
        // Standing at the line's height, centred on it
        tmpPosition.set(x, tmpLine.y - CORRIDOR.postHeight * 0.5, z);
        this.mesh.setMatrixAt(i * 2 + side, tmpMatrix.compose(tmpPosition, identity, tmpScale));
      }
    }
    this.mesh.count = perSide * 2;
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  dispose() {
    this.geometry.dispose();
    this.material.dispose();
  }
}
