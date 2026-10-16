import * as THREE from "three";
import { hash3 } from "../rng";
import { ATMOSPHERE, skyMaterial } from "./atmosphere";
import { CrystalGates, type RingMode } from "./crystals";
import { LandCollider } from "./landCollider";
import type { MeshRequest } from "./mesher.worker";
import { levelId } from "./biomes";
import { applyTerrainTuning, type TerrainUniforms, terrainMaterial } from "./terrain/material";
import { LandStreamer, type NodeRequest, type NodeResult } from "./terrain/streamer";
import { FloraView } from "./flora/view";
import { WaterView } from "./water";
import { SoftClouds } from "./clouds";
import { LightShafts, SeaLife } from "./deep";
import { sunDirection } from "./palette";
import type { World } from "./World";
import { reloadForNewBuild } from "../../staleBuild";
import { DEEP, TERRAIN } from "../tuning";

// Near enough that the haze is already on the land where detail changes (TERRAIN.lodDetail, lodNear)
const FOG_NEAR = 120;
const FOG_FAR = 1300;
const REQUESTS_PER_WORKER = 4;

export type { RingMode };

type MeshResult = NodeResult & { kind: "node"; level: string };

/**
 * All the meshes for one World, as its biome describes them: land streamed in
 * around the camera (cut in web workers), what grows on it, mist and clouds,
 * crystal gates and sky.
 */
export class WorldView {
  readonly group = new THREE.Group();
  /** False until the rock near the camera has arrived */
  ready = false;
  private readonly world: World;
  private readonly levelId: string;
  /** The land, streamed with levels of detail */
  private readonly land: LandStreamer;
  private readonly terrainUniforms: TerrainUniforms;
  private readonly flora: FloraView | null = null;
  private readonly water: WaterView | null = null;
  private readonly softClouds: SoftClouds | null = null;
  /** Under the sea: shafts of light from the surface, fish and jellyfish */
  private readonly shafts: LightShafts | null = null;
  private readonly seaLife: SeaLife | null = null;
  /** The land on screen, as triangles: collisions with exactly what is drawn */
  readonly collider = new LandCollider();
  private readonly workers: Worker[] = [];
  private readonly busy: number[] = [];
  private readonly materials: THREE.Material[] = [];
  private readonly geometries: THREE.BufferGeometry[] = [];
  readonly gates: CrystalGates;
  private readonly sky: THREE.Mesh;
  private disposed = false;

  constructor(world: World, scene: THREE.Scene) {
    this.world = world;
    this.levelId = levelId(world.level.key);
    const palette = world.palette;
    const accent = new THREE.Color(palette.accent);
    const sun = sunDirection(palette);
    const underwater = world.biome.sky.underwater;
    this.light(scene);
    // The sky lights the shadows from above, the sea of clouds bounces light from below
    const hemi = new THREE.HemisphereLight(
      new THREE.Color(palette.horizon).lerp(new THREE.Color(palette.zenith), 0.25),
      palette.cloud,
      palette.ambient,
    );
    const sunLight = new THREE.DirectionalLight(palette.sun, palette.sunIntensity);
    sunLight.position.copy(sun);
    this.group.add(hemi, sunLight);

    this.sky = new THREE.Mesh(this.geometry(new THREE.SphereGeometry(4000, 32, 16)), this.material(skyMaterial()));
    // After the land (it writes no depth and is tested against the land's), so its clouds
    // and stars are only worked out for the pixels where the sky actually shows
    this.sky.renderOrder = 0.5;
    this.group.add(this.sky);
    const { cloudSea, puffs, puffLift, banks } = world.biome.sky;
    if (cloudSea) this.buildCloudSea(cloudSea.depth);
    if (puffs > 0 || banks) {
      this.softClouds = new SoftClouds(world, puffs, puffLift, banks ?? 0);
      this.group.add(this.softClouds.mesh);
    }
    if (underwater) {
      this.shafts = new LightShafts();
      this.seaLife = new SeaLife(world, underwater);
      this.group.add(this.shafts.mesh, ...this.seaLife.meshes);
    }
    this.gates = new CrystalGates(
      world.seed,
      world.course.rings,
      { ice: new THREE.Color("#e6f7ff").lerp(accent, 0.12), accent },
      sun,
    );
    this.group.add(this.gates.group);
    this.setRings("free", 0);

    const { material, uniforms } = terrainMaterial(world.biome.terrain.layers);
    this.material(material);
    this.terrainUniforms = uniforms;
    if (world.biome.vegetation.kind === "flora") this.flora = new FloraView(world, this.group);
    if (world.steps || world.hasSea || world.islandFalls.length) {
      this.water = new WaterView(world);
      this.group.add(this.water.group);
    }
    this.land = new LandStreamer(world, this.group, material, this.flora, this.collider);

    this.startWorkers();
  }

  /** One set of light uniforms for the sky and the rock, the fog and the background: this biome's mood */
  private light(scene: THREE.Scene) {
    const { world } = this;
    const palette = world.palette;
    ATMOSPHERE.sunDirection.value.copy(sunDirection(palette));
    ATMOSPHERE.sunColor.value.set(palette.sun);
    ATMOSPHERE.mistColor.value.set(palette.mist);
    ATMOSPHERE.mistDensity.value = palette.mistDensity;
    const mist = world.biome.sky.mist;
    ATMOSPHERE.mistMode.value = mist.mode === "valley" ? 1 : 0;
    ATMOSPHERE.mistThickness.value = mist.mode === "valley" ? mist.thickness : 120;
    ATMOSPHERE.horizon.value.set(palette.horizon);
    ATMOSPHERE.zenith.value.set(palette.zenith);
    ATMOSPHERE.clouds.value.set(palette.cloud);
    ATMOSPHERE.night.value = palette.night;
    ATMOSPHERE.aurora.value = palette.aurora ?? 0;
    ATMOSPHERE.underglow.value.set(palette.underglow ?? "#000000");
    const underwater = world.biome.sky.underwater;
    ATMOSPHERE.underwater.value = underwater ? 1 : 0;
    if (underwater) ATMOSPHERE.surface.value = world.course.start.y + underwater.surface;

    scene.background = new THREE.Color(palette.horizon);
    const [fogNear, fogFar] = world.biome.sky.fog ?? [FOG_NEAR, FOG_FAR];
    scene.fog = new THREE.Fog(palette.horizon, fogNear, fogFar);
  }

  /**
   * Set aside but kept built (the menu's backdrop keeps a few maps for its map select): the workers stop
   * and what they were asked for is forgotten, the hidden meshes go; what is on screen stays
   */
  park() {
    this.workers.forEach((w) => w.terminate());
    this.workers.length = 0;
    this.busy.length = 0;
    this.land.park();
  }

  /** Back on screen after `park`: its light again, and workers to stream on */
  resume(scene: THREE.Scene) {
    this.light(scene);
    this.startWorkers();
  }

  private startWorkers() {
    // Up to three on laptops, as many as six where there are cores to spare: the land arrives sooner
    const cores = navigator.hardwareConcurrency || 4;
    const count = Math.max(1, Math.min(cores >= 12 ? 6 : 3, cores - 1));
    for (let i = 0; i < count; i++) {
      const worker = new Worker(new URL("./mesher.worker.ts", import.meta.url), { type: "module" });
      worker.onmessage = (event: MessageEvent<MeshResult>) => {
        this.busy[i]--;
        const result = event.data;
        if (this.disposed || result.level !== this.levelId) return;
        this.land.receive(result);
      };
      // Fires when the worker's script can't be loaded, e.g. it belongs to an older build
      worker.onerror = (event) => reloadForNewBuild(event.message || "mesher worker failed to load");
      this.workers.push(worker);
      this.busy.push(0);
    }
  }

  private material<T extends THREE.Material>(material: T): T {
    this.materials.push(material);
    return material;
  }

  private geometry<T extends THREE.BufferGeometry>(geometry: T): T {
    this.geometries.push(geometry);
    return geometry;
  }

  // --- clouds ------------------------------------------------------------------

  /** A lumpy, faceted floor of clouds far below the islands, sloping down with the course */
  private buildCloudSea(depth: number) {
    const { course, palette } = this.world;
    const step = 50;
    const columns = 80;
    const z0 = course.start.z - 1500;
    const rows = Math.ceil((course.endZ + 2000 - z0) / step);
    const point = (row: number, column: number) => {
      const z = z0 + row * step;
      const bump = (hash3(row, column, 11) - 0.5) * 14;
      return [course.x(z) + (column - columns / 2) * step, course.y(z) - depth + bump, z];
    };
    const positions: number[] = [];
    const colors: number[] = [];
    const base = new THREE.Color(palette.cloud);
    const color = new THREE.Color();
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < columns; c++) {
        for (const tri of [
          [point(r, c), point(r + 1, c), point(r + 1, c + 1)],
          [point(r, c), point(r + 1, c + 1), point(r, c + 1)],
        ]) {
          color.copy(base).multiplyScalar(0.9 + 0.1 * hash3(r, c, tri[2][0] | 0));
          for (const v of tri) {
            positions.push(...v);
            colors.push(color.r, color.g, color.b);
          }
        }
      }
    }
    const geometry = this.geometry(new THREE.BufferGeometry());
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
    geometry.computeVertexNormals();
    const material = new THREE.MeshLambertMaterial({ vertexColors: true });
    material.emissive.set(palette.cloud).multiplyScalar(0.35);
    this.group.add(new THREE.Mesh(geometry, this.material(material)));
  }

  // --- rock, streamed in from the workers -------------------------------------------

  /** Posts a request to the least busy worker; false if they all have enough to do */
  private dispatch = (request: NodeRequest): boolean => {
    let worker = 0;
    for (let i = 1; i < this.busy.length; i++) if (this.busy[i] < this.busy[worker]) worker = i;
    if (this.busy[worker] >= REQUESTS_PER_WORKER) return false;
    this.busy[worker]++;
    const message: MeshRequest = { level: this.world.level.key, ...request };
    this.workers[worker].postMessage(message);
    return true;
  };

  /**
   * Is the land at this point on screen (or is there none to show)? Until it
   * is, collisions there fall back to the distance field
   */
  covers(x: number, y: number, z: number): boolean {
    return this.land.covers(x, y, z);
  }

  // --- rings -------------------------------------------------------------------

  /** One-off GPU work that needs the renderer: the plants' impostor atlas */
  prepare(renderer: THREE.WebGLRenderer) {
    this.flora?.bake(renderer);
  }

  /** "race": the next gate glows, passed ones are gone. "free": all shown quietly. */
  setRings(mode: RingMode, next: number) {
    this.gates.setMode(mode, next);
  }

  /** Plays a gate's pass animation: the crystals flare, burst and dissolve */
  passRing(index: number) {
    this.gates.pass(index);
  }

  /** Per frame: stream rock around the camera, the sky follows it, the gates animate */
  update(camera: THREE.Camera, dt: number, velocity?: THREE.Vector3) {
    // The clock arriving land fades in by: the wall clock, so it also runs while the game's is slowed
    ATMOSPHERE.now.value = performance.now() / 1000;
    ATMOSPHERE.revealRate.value = 1 / Math.max(TERRAIN.fadeIn, 1e-3);
    const mist = this.world.biome.sky.mist;
    if (mist.mode === "valley") ATMOSPHERE.mistHeight.value = this.world.valleyFloor(camera.position.z) + mist.above;
    const underwater = this.world.biome.sky.underwater;
    if (underwater) {
      // The surface stays the same height over the racing line all the way down; moonlight ripples less
      const dim = 1 - this.world.palette.night * 0.5;
      ATMOSPHERE.surface.value = this.world.course.y(camera.position.z) + underwater.surface;
      ATMOSPHERE.caustics.value = DEEP.caustics * dim;
      ATMOSPHERE.surfaceGlow.value = DEEP.surface;
      this.shafts!.update(DEEP.shafts * dim);
      this.seaLife!.update(DEEP.life);
    }
    this.land.update(camera.position, this.dispatch, velocity);
    this.ready = this.land.ready;
    applyTerrainTuning(this.terrainUniforms, this.world.biome.terrain.layers);
    this.flora?.update(camera);
    this.water?.update();
    this.sky.position.copy(camera.position);
    this.gates.update(dt, camera);
  }

  dispose() {
    this.disposed = true;
    this.workers.forEach((w) => w.terminate());
    this.land.dispose();
    this.collider.clear();
    this.flora?.dispose();
    this.water?.dispose();
    this.softClouds?.dispose();
    this.shafts?.dispose();
    this.seaLife?.dispose();
    this.geometries.forEach((g) => g.dispose());
    this.materials.forEach((m) => m.dispose());
    this.gates.dispose();
    this.group.clear();
  }
}
