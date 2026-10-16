import * as THREE from "three";
import { TERRAIN } from "../../tuning";
import { bornFresh, bornSwapped } from "../atmosphere";
import { PLANT_STRIDE } from "../flora/species";
import type { FloraView } from "../flora/view";
import { kindInfo } from "../structures/kinds";
import { Plant } from "../trees";
import type { LandCollider } from "../landCollider";
import type { World } from "../World";
import { NODE_SIZE, type TerrainMesh, VOXEL, nodeKey } from "./mesh";

// Streams generator-v2 land around the camera as an octree of nodes: 384 m
// nodes far away, split into 192, 96 and finally 48 m nodes as you get close. Every
// node has 16 cells a side, so the triangle count per node stays the same and
// far land is coarse. A coarse node stays on screen until all of its finer
// replacements have arrived (and the other way round when merging), so the land
// never shows holes. The change of level is then instant: the old level comes off
// and the new one goes on, in its full color, in the same frame (the `born`
// attribute, BORN_FRESH in atmosphere.ts), collisions included. The two levels
// never overlap on screen: their surfaces are triangulated differently and
// interpenetrate, so drawing both at once (as an earlier cross-fade did) mottled
// the land with faces of each. Only land that comes on screen where none was
// shown before fades in out of the haze over TERRAIN.fadeIn.
//
// Land within TERRAIN.freezeRadius of the camera is frozen: a node already on
// screen there keeps its level (no split, no merge, so no trees popping in or
// detail changing right in front of you). Levels change while the land is still
// far off, in the haze, so by the time you reach it it is already at its final
// detail; you only ever fly forward, so what is frozen stays as it is until it
// is behind you and out of frame, where it is discarded like any land left
// behind (merged back into coarse land, then dropped past the view distance).
// The freeze never holds back land arriving where none was shown (that would
// leave holes), and it never stops the workers: the finer replacements still
// load ahead of you, so the land is complete before it enters the radius.
//
// Beyond the view distance, out to TERRAIN.prefetchDistance, land ahead of you is
// generated too and held off screen (loaded, never shown): when it comes within the
// view distance it is already there and fades in at once, instead of waiting for a
// worker. Prefetch requests always queue behind requests for land on screen.
//
// Requests are ordered by distance, but the land under the racing line comes first:
// land more than LINE_LATERAL metres off the line (decoration) is pushed back in the
// queue, and land past TERRAIN.decorationLateral never splits finer than
// TERRAIN.decorationMaxLod. The lateral distance is from the node's box to the line
// at its centre z, in x and y (the plane the air wall is measured in), so a coarse
// node the line runs through counts as on the line.

export const LOD_LEVELS = 4;
/** Land further than this from the racing line is decoration: its requests queue behind the rest */
const LINE_LATERAL = 60;
/** Metres added to a decoration node's request order */
const DECORATION_PENALTY = 200;
/** Metres added to a prefetch request's order: always after everything wanted on screen */
const PREFETCH_AFTER = 1e6;
const ROOT_LOD = LOD_LEVELS - 1;

export interface NodeRequest {
  kind: "node";
  key: number;
  lod: number;
  ix: number;
  iy: number;
  iz: number;
}

export type NodeResult = TerrainMesh & { key: number; plants: Float32Array; tufts: Float32Array };

interface Node {
  lod: number;
  ix: number;
  iy: number;
  iz: number;
  key: number;
  box: THREE.Box3;
  parent: Node | null;
  children: Node[] | null; // null until first needed
  state: "idle" | "pending" | "loaded";
  mesh: THREE.Mesh | null; // null when loaded but empty
  plants: Float32Array | null;
  tufts: Float32Array | null;
  shown: boolean;
  split: boolean; // hysteresis: keep fine detail until beyond the outer threshold
  desired: number; // the update stamp it was last wanted in
  prefetched: number; // the update stamp it was last wanted ahead in (loaded and held, not shown)
  lateral: number; // metres from the node to the racing line at its centre z, in x and y (0: the line runs through it)
}

export class LandStreamer {
  ready = false;
  private readonly world: World;
  private readonly group: THREE.Group;
  private readonly material: THREE.Material;
  private readonly flora: FloraView | null;
  private readonly collider: LandCollider;
  private readonly roots: Node[] = [];
  private readonly byKey = new Map<number, Node>();
  private readonly ranges = new Map<number, [number, number] | null>();
  private readonly lastUpdate = new THREE.Vector3(Infinity, 0, 0);
  private stamp = 0;
  private readonly lookAhead = new THREE.Vector3();
  private readonly lastLookAhead = new THREE.Vector3(Infinity, 0, 0);
  private predicting = false;
  private readonly cache = new Map<number, { node: Node; bytes: number }>();
  private cacheBytes = 0;
  private desired: Node[] = [];
  private readonly prefetch: Node[] = [];
  private readonly wanted: { node: Node; d: number }[] = [];
  private readonly linePoint = new THREE.Vector3();

  constructor(world: World, group: THREE.Group, material: THREE.Material, flora: FloraView | null, collider: LandCollider) {
    this.world = world;
    this.collider = collider;
    this.group = group;
    this.material = material;
    this.flora = flora;
    const field = world.land!;
    const { course } = world;
    const extent = field.ground?.spec.extent ?? 900;
    const size = NODE_SIZE << ROOT_LOD;
    // The land's footprint: the course from before the start to past the end, out to its extent either side
    let xMin = Infinity;
    let xMax = -Infinity;
    for (let z = course.start.z - 600; z <= course.endZ + 900; z += 50) {
      xMin = Math.min(xMin, course.x(z));
      xMax = Math.max(xMax, course.x(z));
    }
    for (const s of field.shapes) {
      xMin = Math.min(xMin, s.min.x + extent);
      xMax = Math.max(xMax, s.max.x - extent);
    }
    const ix0 = Math.floor((xMin - extent) / size);
    const ix1 = Math.floor((xMax + extent) / size);
    const iz0 = Math.floor((course.start.z - 600) / size);
    const iz1 = Math.floor((course.endZ + 900) / size);
    for (let ix = ix0; ix <= ix1; ix++) {
      for (let iz = iz0; iz <= iz1; iz++) {
        const range = this.columnRange(ROOT_LOD, ix, iz);
        if (!range) continue;
        for (let iy = Math.floor(range[0] / size); iy <= Math.floor(range[1] / size); iy++) {
          this.roots.push(this.node(ROOT_LOD, ix, iy, iz, null));
        }
      }
    }
  }

  private node(lod: number, ix: number, iy: number, iz: number, parent: Node | null): Node {
    const size = NODE_SIZE << lod;
    const key = nodeKey(lod, ix, iy, iz);
    const box = new THREE.Box3(new THREE.Vector3(ix * size, iy * size, iz * size), new THREE.Vector3((ix + 1) * size, (iy + 1) * size, (iz + 1) * size));
    const node: Node = {
      lod,
      ix,
      iy,
      iz,
      key,
      box,
      parent,
      children: null,
      state: "idle",
      mesh: null,
      plants: null,
      tufts: null,
      shown: false,
      split: false,
      desired: -1,
      prefetched: -1,
      lateral: this.lateral(box),
    };
    this.byKey.set(key, node);
    return node;
  }

  /** How far a node stands off the racing line: from its box to the line at its centre z, in x and y */
  private lateral(box: THREE.Box3): number {
    const line = this.world.course.pointAt((box.min.z + box.max.z) / 2, this.linePoint);
    const dx = Math.max(box.min.x - line.x, line.x - box.max.x, 0);
    const dy = Math.max(box.min.y - line.y, line.y - box.max.y, 0);
    return Math.hypot(dx, dy);
  }

  /** Land height range over a node column, cached (null: no land) */
  private columnRange(lod: number, ix: number, iz: number): [number, number] | null {
    const key = nodeKey(lod, ix, 0, iz);
    let range = this.ranges.get(key);
    if (range === undefined) {
      const size = NODE_SIZE << lod;
      range = this.world.land!.columnRange(ix * size, iz * size, (ix + 1) * size, (iz + 1) * size);
      this.ranges.set(key, range);
    }
    return range;
  }

  private childrenOf(node: Node): Node[] {
    if (!node.children) {
      node.children = [];
      const lod = node.lod - 1;
      const size = NODE_SIZE << lod;
      for (let dx = 0; dx < 2; dx++) {
        for (let dz = 0; dz < 2; dz++) {
          const ix = node.ix * 2 + dx;
          const iz = node.iz * 2 + dz;
          const range = this.columnRange(lod, ix, iz);
          if (!range) continue;
          for (let dy = 0; dy < 2; dy++) {
            const iy = node.iy * 2 + dy;
            if ((iy + 1) * size < range[0] || iy * size > range[1]) continue;
            node.children.push(this.node(lod, ix, iy, iz, node));
          }
        }
      }
    }
    return node.children;
  }

  /** Which nodes should be on screen from here, and which to ask the workers for next */
  update(at: THREE.Vector3, request: (r: NodeRequest) => boolean, velocity?: THREE.Vector3) {
    this.lookAhead.copy(at);
    this.predicting = !!velocity && velocity.lengthSq() > 1;
    if (this.predicting) {
      const seconds = Math.min(TERRAIN.lodLookAheadSeconds, TERRAIN.lodLookAheadMax / velocity!.length());
      this.lookAhead.addScaledVector(velocity!, seconds);
    }
    this.trimCache();
    // Take in a few of the arrived meshes (all of them while nothing is on screen yet)
    if (this.arrived.length) {
      const budget = this.ready ? TERRAIN.arrivalsPerFrame : this.arrived.length;
      for (const result of this.arrived.splice(0, budget)) this.take(result);
      this.settle(at);
    }
    // Every 8 m of travel: which nodes are wanted now, and (settle) frozen changes of
    // level go on once the camera has left the freeze radius
    if (this.lastUpdate.distanceToSquared(at) > 8 * 8 || this.lastLookAhead.distanceToSquared(this.lookAhead) > 8 * 8 || this.stamp === 0) {
      this.lastUpdate.copy(at);
      this.lastLookAhead.copy(this.lookAhead);
      this.stamp++;
      this.desired.length = 0;
      this.prefetch.length = 0;
      for (const root of this.roots) this.visit(root, at);
      for (const root of this.roots) this.pruneTree(root, false);
      this.settle(at);
    }

    // Ask for missing nodes, nearest first. A small preference for finer nodes at
    // like distances only: the near land must always come before the far, whatever
    // its level, so it is at its final detail before it enters the freeze radius.
    // Land off to the side of the racing line (decoration) queues behind the land
    // you fly over, and land prefetched beyond the view behind everything on screen
    const wanted = this.wanted;
    wanted.length = 0;
    let missingNearby = false;
    for (const node of this.desired) {
      if (node.shown) continue;
      const d = node.box.distanceToPoint(at);
      if (d < TERRAIN.readyRadius && !this.shownAncestor(node) && !this.visibleCoverage(node)) missingNearby = true;
      if (node.state === "idle") wanted.push({ node, d: this.order(node, d) });
    }
    this.ready = !missingNearby;
    for (const node of this.prefetch) {
      if (node.state === "idle") wanted.push({ node, d: PREFETCH_AFTER + this.order(node, node.box.distanceToPoint(at)) });
    }
    wanted.sort((a, b) => a.d - b.d);
    for (const { node } of wanted) {
      if (!request({ kind: "node", key: node.key, lod: node.lod, ix: node.ix, iy: node.iy, iz: node.iz })) break;
      node.state = "pending";
    }
  }

  /** A node's place in the request queue: its distance, a little later for coarser levels, later again for decoration */
  private order(node: Node, d: number): number {
    return d + node.lod * 30 + (node.lateral > LINE_LATERAL ? DECORATION_PENALTY : 0);
  }

  private visit(node: Node, at: THREE.Vector3) {
    const d = node.box.distanceToPoint(at);
    const ahead = d > TERRAIN.viewDistance;
    // Beyond the view: prefetched (loaded, not shown) out to the prefetch distance, and
    // only ahead of the camera; the course runs towards +z and you never fly back
    if (ahead && (d > TERRAIN.prefetchDistance || node.box.max.z < at.z)) return;
    const split = node.lod === 3 ? TERRAIN.lodFar : node.lod === 2 ? TERRAIN.lodNear : TERRAIN.lodDetail;
    const detailDistance = this.predicting ? Math.min(d, node.box.distanceToPoint(this.lookAhead)) : d;
    // Decoration, off to the side of the racing line, never splits finer than decorationMaxLod
    const finest = node.lateral > TERRAIN.decorationLateral ? Math.min(Math.max(TERRAIN.decorationMaxLod, 0), ROOT_LOD) : 0;
    node.split = node.lod > finest && detailDistance < split + (node.split ? TERRAIN.lodHysteresis : 0);
    if (node.split) {
      for (const child of this.childrenOf(node)) this.visit(child, at);
    } else if (ahead) {
      node.prefetched = this.stamp;
      this.prefetch.push(node);
    } else {
      node.desired = this.stamp;
      this.desired.push(node);
    }
  }

  /** Results wait here and are taken in a few per frame, so uploads don't pile into one frame */
  private readonly arrived: NodeResult[] = [];

  receive(result: NodeResult) {
    this.arrived.push(result);
  }

  private take(result: NodeResult) {
    const node = this.byKey.get(result.key);
    if (!node || node.state !== "pending") return;
    // A worker may finish after we have flown away. Avoid uploading obsolete
    // geometry or planting its colliders; it can be requested again if needed.
    // Prefetched land is kept (loaded, off screen) for when it comes into view
    if (node.desired !== this.stamp && node.prefetched !== this.stamp) {
      node.state = "idle";
      return;
    }
    node.state = "loaded";
    if (result.positions.length) {
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute("position", new THREE.BufferAttribute(result.positions, 3));
      geometry.setAttribute("rock", new THREE.BufferAttribute(result.rock, 4, true));
      geometry.setAttribute("cover", new THREE.BufferAttribute(result.cover, 4, true));
      geometry.setAttribute("crystal", new THREE.BufferAttribute(result.crystal ?? new Uint8Array(result.positions.length / 3), 1, true));
      geometry.setAttribute("snow", new THREE.BufferAttribute(result.snow, 1));
      geometry.setAttribute("born", new THREE.BufferAttribute(new Float32Array(result.positions.length / 3), 1));
      geometry.computeBoundingSphere();
      node.mesh = new THREE.Mesh(geometry, this.material);
      node.mesh.matrixAutoUpdate = false;
    }
    node.plants = result.plants;
    node.tufts = result.tufts;
    // Full-detail nodes are the ones near you: their plants collide from now on
    if (node.lod === 0) this.world.trees.add(node.key, this.colliders(result.plants));
  }

  private colliders(plants: Float32Array): Plant[] {
    const out: Plant[] = [];
    for (let o = 0; o < plants.length; o += PLANT_STRIDE) {
      const info = kindInfo(this.world.biome, plants[o]);
      out.push(new Plant(plants[o + 1], plants[o + 2], plants[o + 3], plants[o + 4], plants[o + 5], plants[o + 6], info.collider));
    }
    return out;
  }

  /**
   * Puts arrived nodes on screen once they cover their area, and takes off what they
   * replace. A change of level (split or merge) whose land is within TERRAIN.freezeRadius
   * of the camera `at` waits: the land there stays as it is until the camera has moved on
   */
  private settle(at: THREE.Vector3) {
    for (const node of this.desired) {
      if (node.state !== "loaded" || node.shown) continue;
      const shownAncestor = this.shownAncestor(node);
      if (shownAncestor) {
        // Splitting: wait until everything wanted under the coarse node has arrived
        if (!this.allLoaded(shownAncestor)) continue;
        // The whole coarse node would change: frozen while any of it is near
        if (this.frozen(shownAncestor, at)) continue;
        this.showUnder(shownAncestor);
        // The coarse node comes off in the same frame: the two levels must never be drawn together
        this.hide(shownAncestor);
      } else {
        // Fresh: no finer land stood here either, so this is land arriving, not changing detail
        const fresh = !this.anyShown(node);
        // Merging: the finer land under it would change, frozen while near (fresh land is never held back)
        if (!fresh && this.frozen(node, at)) continue;
        this.show(node, fresh);
        // Merging: the finer nodes it replaces come off in the same frame
        if (node.children) for (const child of node.children) this.hideTree(child);
      }
    }
  }

  /**
   * Is a change of level over this node's land too close to the camera to show now?
   * Only once the land around the camera has arrived (`ready`): before that the
   * right detail as soon as possible beats a frozen coarse start
   */
  private frozen(node: Node, at: THREE.Vector3): boolean {
    return this.ready && node.box.distanceToPoint(at) < TERRAIN.freezeRadius;
  }

  private shownAncestor(node: Node): Node | null {
    for (let a = node.parent; a; a = a.parent) if (a.shown) return a;
    return null;
  }

  /** Is land drawn here? Then what comes is a change of detail, not an arrival */
  private anyShown(node: Node): boolean {
    if (node.shown) return true;
    if (node.children) for (const child of node.children) if (this.anyShown(child)) return true;
    return false;
  }

  /** Existing collision/render coverage remains usable while its LOD replacement loads. */
  private visibleCoverage(node: Node): boolean {
    return node.shown || (!!node.children?.length && node.children.every(child => this.visibleCoverage(child)));
  }

  /** Are all the nodes wanted under `node` loaded? */
  private allLoaded(node: Node): boolean {
    if (!node.children) return true;
    for (const child of node.children) {
      if (child.desired === this.stamp) {
        if (child.state !== "loaded") return false;
      } else if (!this.allLoaded(child)) {
        return false;
      }
    }
    return true;
  }

  private showUnder(node: Node) {
    if (!node.children) return;
    for (const child of node.children) {
      if (child.desired === this.stamp) this.show(child);
      else this.showUnder(child);
    }
  }

  private show(node: Node, fresh = false) {
    const cached = this.cache.get(node.key);
    if (cached) {
      this.cacheBytes -= cached.bytes;
      this.cache.delete(node.key);
    }
    // Arriving where nothing stood it melts out of the haze; replacing another level it is in full color at once
    const born = fresh ? bornFresh() : bornSwapped();
    node.shown = true;
    if (node.mesh) {
      this.setBorn(node.mesh, born);
      this.group.add(node.mesh);
      // What is on screen is what you hit
      this.collider.add(node.key, node.mesh.geometry.getAttribute("position").array as Float32Array, VOXEL << node.lod);
    }
    if (node.plants && this.flora) this.flora.show(node.key, node.lod, node.plants, node.tufts!, node.box, born);
  }

  private setBorn(mesh: THREE.Mesh, born: number) {
    const attribute = mesh.geometry.getAttribute("born") as THREE.BufferAttribute;
    (attribute.array as Float32Array).fill(born);
    attribute.needsUpdate = true;
  }

  /** Off screen at once (and out of the collider); kept in the cache if loaded */
  private hide(node: Node) {
    if (node.shown) this.flora?.hide(node.key);
    node.shown = false;
    this.collider.remove(node.key);
    if (node.mesh) this.group.remove(node.mesh);
    if (node.state !== "loaded" || this.cache.has(node.key)) return;
    // Retain recently replaced nodes, bounded by both bytes and entry count.
    // This avoids regenerating them when turning around or crossing a LOD ring.
    let bytes = 128 + (node.plants?.byteLength ?? 0) + (node.tufts?.byteLength ?? 0);
    if (node.mesh) for (const attribute of Object.values(node.mesh.geometry.attributes)) bytes += attribute.array.byteLength * 2; // CPU + GPU
    this.cache.set(node.key, { node, bytes });
    this.cacheBytes += bytes;
    this.trimCache();
  }

  private trimCache(budget = TERRAIN.cacheMiB * 1024 * 1024, entries = 256) {
    while (this.cacheBytes > budget || this.cache.size > entries) {
      const entry = this.cache.values().next().value;
      if (!entry) break;
      const { node, bytes } = entry;
      this.cache.delete(node.key);
      this.cacheBytes -= bytes;
      node.mesh?.geometry.dispose();
      node.mesh = null;
      node.plants = null;
      node.tufts = null;
      node.state = "idle";
    }
  }

  /** A merge: everything on screen (or loaded) under the coarse node comes off at once */
  private hideTree(node: Node) {
    if (node.shown || node.state === "loaded") this.hide(node);
    if (node.children) for (const child of node.children) this.hideTree(child);
  }

  /**
   * Drops what is no longer wanted (left behind as you fly on). Keeps nodes
   * that still stand in for wanted ones: coarse nodes waiting for their finer
   * replacements, and fine nodes waiting for a coarse one (`covered`), and
   * prefetched nodes held off screen for when they come into view.
   * Returns whether anything in this subtree is wanted.
   */
  private pruneTree(node: Node, covered: boolean): boolean {
    const here = node.desired === this.stamp || node.prefetched === this.stamp;
    let wanted = here;
    if (node.children) for (const child of node.children) wanted = this.pruneTree(child, covered || here) || wanted;
    if (!wanted && !covered && (node.shown || node.state === "loaded")) this.hide(node);
    return wanted;
  }

  /**
   * Is the land at this point on screen (or is there none to show)? Until it
   * is, collisions there fall back to the distance field
   */
  covers(x: number, y: number, z: number): boolean {
    for (const root of this.roots) if (inside(root.box, x, y, z)) return this.coveredIn(root, x, y, z);
    return true;
  }

  private coveredIn(node: Node, x: number, y: number, z: number): boolean {
    if (node.shown) return true;
    if (!node.children) return false;
    for (const child of node.children) if (inside(child.box, x, y, z)) return this.coveredIn(child, x, y, z);
    // No finer node holds this spot: no land there
    return true;
  }

  /** Set aside (its workers stopped): what was asked for is asked again later, hidden meshes go */
  park() {
    for (const node of this.byKey.values()) if (node.state === "pending") node.state = "idle";
    this.arrived.length = 0;
    this.trimCache(0, 0);
  }

  dispose() {
    for (const node of this.byKey.values()) if (node.mesh) node.mesh.geometry.dispose();
    this.byKey.clear();
    this.cache.clear();
    this.cacheBytes = 0;
    this.arrived.length = 0;
  }
}

function inside(box: THREE.Box3, x: number, y: number, z: number): boolean {
  return x >= box.min.x && x < box.max.x && y >= box.min.y && y < box.max.y && z >= box.min.z && z < box.max.z;
}
