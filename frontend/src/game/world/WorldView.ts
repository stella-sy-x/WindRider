import * as THREE from "three";
import { hash3 } from "../rng";
import { ATMOSPHERE, skyMaterial } from "./atmosphere";
import { CrystalGates, type GateColors, gateColors, type RingMode } from "./crystals";
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
import { TERRAIN } from "../tuning";
import { lookFor } from "./look";

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
  /** The gates' muted stone colors (for the particles a gate gives off; the finish is gold) */
  readonly gateColors: GateColors;
  private readonly sky: THREE.Mesh;
  /** The sky's light from above and the ground's (the sea of clouds') from below */
  private readonly hemi: THREE.HemisphereLight;
  /** The sea of clouds' floor, whose share of haze (look.air.seaHaze) is set every frame */
  private cloudSeaMaterial: THREE.MeshLambertMaterial | null = null;
  private scene: THREE.Scene | null = null;
  private fogColorKey = "";
  private disposed = false;

  constructor(world: World, scene: THREE.Scene) {
    this.world = world;
    this.levelId = levelId(world.level.key);
    const palette = world.palette;
    const accent = new THREE.Color(palette.accent);
    const sun = sunDirection(palette);
    const underwater = world.biome.sky.underwater;
    // The sky lights the shadows from above, the sea of clouds bounces light from below (its
    // colours follow the mood's air every frame: applyAir)
    this.hemi = new THREE.HemisphereLight(palette.horizon, palette.cloud, palette.ambient);
    this.light(scene);
    const sunLight = new THREE.DirectionalLight(palette.sun, palette.sunIntensity);
    sunLight.position.copy(sun);
    this.group.add(this.hemi, sunLight);

    this.sky = new THREE.Mesh(this.geometry(new THREE.SphereGeometry(4000, 32, 16)), this.material(skyMaterial()));
    // After the land (it writes no depth and is tested against the land's), so its clouds
    // and stars are only worked out for the pixels where the sky actually shows
    this.sky.renderOrder = 0.5;
    this.group.add(this.sky);
    const { cloudSea, puffs, puffLift, banks } = world.biome.sky;
    if (cloudSea) this.buildCloudSea(cloudSea.depth);
    if (puffs > 0 || banks || cloudSea?.puffs) {
      this.softClouds = new SoftClouds(world, puffs, puffLift, banks ?? 0, cloudSea?.puffs ? { depth: cloudSea.depth, count: cloudSea.puffs } : null);
      this.group.add(this.softClouds.mesh);
    }
    if (underwater) {
      this.shafts = new LightShafts();
      this.seaLife = new SeaLife(world, underwater);
      this.group.add(this.shafts.mesh, this.seaLife.group);
    }
    // Gates in muted stone, tinted a touch by the biome's accent rather than painted in it
    this.gateColors = gateColors(accent, lookFor(palette).gates);
    this.gates = new CrystalGates(world.seed, world.course.rings, this.gateColors, sun, palette);
    this.group.add(this.gates.group);
    this.setRings("free");

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
    ATMOSPHERE.horizon.value.set(palette.horizon);
    ATMOSPHERE.zenith.value.set(palette.zenith);
    ATMOSPHERE.clouds.value.set(palette.cloud);
    ATMOSPHERE.night.value = palette.night;
    ATMOSPHERE.aurora.value = palette.aurora ?? 0;
    const underwater = world.biome.sky.underwater;
    ATMOSPHERE.underwater.value = underwater ? 1 : 0;
    if (underwater) ATMOSPHERE.surface.value = world.course.start.y + underwater.surface;
    // Distant land painted along the horizon for the real land to arrive into; none under the sea
    ATMOSPHERE.silhouettes.value = underwater ? 0 : 1;

    scene.background = new THREE.Color(palette.horizon);
    scene.fog = new THREE.Fog(palette.horizon, 200, 900);
    this.scene = scene;
    this.fogColorKey = "";
    this.applyAir();
  }

  /**
   * The mood's air (look.ts), every frame so the tune panel's numbers show at once: the haze,
   * the sky's rules, the mist, the light's colours, the puffs
   */
  private applyAir() {
    const palette = this.world.palette;
    const air = lookFor(palette).air;
    const scene = this.scene;
    if (scene?.fog && scene.fog instanceof THREE.Fog) {
      scene.fog.near = air.fogNear;
      scene.fog.far = air.fogFar;
      const key = air.fogColor ?? palette.horizon;
      if (key !== this.fogColorKey) {
        this.fogColorKey = key;
        scene.fog.color.set(key);
        (scene.background as THREE.Color).set(key);
      }
    }
    ATMOSPHERE.glow.value.set(air.glowWidth, air.glowStrength, air.glowCore, air.glowCoreStrength);
    ATMOSPHERE.discs.value.set(air.sunDisc, air.moonDisc);
    ATMOSPHERE.skyCurve.value = air.skyCurve;
    ATMOSPHERE.silhouette.value.set(air.silhouetteSky, air.silhouetteShade);
    ATMOSPHERE.cloudBright.value = air.cloudBright;
    const mist = this.world.biome.sky.mist;
    ATMOSPHERE.mistThickness.value = mist.mode === "valley" ? mist.thickness : air.mistThickness;
    ATMOSPHERE.mistDrop.value = air.mistDrop;
    ATMOSPHERE.mistRange.value = air.mistRange;
    ATMOSPHERE.mistCap.value = air.mistCap;
    ATMOSPHERE.rim.value = air.rim;
    ATMOSPHERE.puff.value.set(air.puffShadowSky, air.puffShadow, air.puffLit, air.puffGlow);
    ATMOSPHERE.puffShadowZenith.value = air.puffShadowZenith;
    this.hemi.color.set(palette.horizon).lerp(new THREE.Color(palette.zenith), air.hemiSky);
    this.hemi.groundColor.set(air.hemiGround ?? palette.cloud);
    this.hemi.intensity = palette.ambient;
    if (this.cloudSeaMaterial) {
      // seaHaze 1: the floor is the haze itself, unlit, in the fog's colour; the puffs on it are the clouds
      const m = this.cloudSeaMaterial;
      m.color.setScalar(1 - air.seaHaze);
      m.emissive.set(palette.cloud).multiplyScalar(air.seaEmissive * (1 - air.seaHaze));
      m.emissive.lerp(new THREE.Color(air.fogColor ?? palette.horizon), air.seaHaze);
    }
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
    // Built once in the mood's air (its relief, facets and own light): a change applies to the next map
    const air = lookFor(palette).air;
    // With relief: a quilt of rounded cloud heads (one dome per cell of a jittered grid seaWave metres
    // wide, seaRelief metres tall, neighbours joined by the taller of the two), so the sea is lumps
    // pressed together, not a terrain; a jitter per vertex so the facets vary. Flat-shaded, each head
    // gets a lit crown and a shaded side like the islands, and the hollows between them take the
    // sky's colour
    const step = air.seaRelief > 0 ? 40 : 50;
    const columns = Math.round(4000 / step);
    const z0 = course.start.z - 1500;
    const rows = Math.ceil((course.endZ + 2000 - z0) / step);
    const w = Math.max(air.seaWave, 1);
    const seed = this.world.seed;
    const dome = (x: number, z: number): number => {
      if (air.seaRelief <= 0) return 0;
      const cx = Math.floor(x / w);
      const cz = Math.floor(z / w);
      let h = 0;
      for (let i = -1; i <= 1; i++) {
        for (let k = -1; k <= 1; k++) {
          const ox = (cx + i + hash3(cx + i, cz + k, seed) - 0.5) * w;
          const oz = (cz + k + hash3(cx + i, cz + k, seed + 1) - 0.5) * w;
          const radius = w * (0.55 + 0.35 * hash3(cx + i, cz + k, seed + 2));
          const d2 = ((x - ox) * (x - ox) + (z - oz) * (z - oz)) / (radius * radius);
          if (d2 < 1) h = Math.max(h, (1 - d2) * (1 - d2) * (0.7 + 0.3 * hash3(cx + i, cz + k, seed + 3)));
        }
      }
      return h;
    };
    const point = (row: number, column: number): [number, number, number, number] => {
      const z = z0 + row * step;
      const x = course.x(z) + (column - columns / 2) * step;
      const jitter = (hash3(row, column, 11) - 0.5) * 2 * air.seaJitter;
      const head = dome(x, z);
      return [x, course.y(z) - depth + jitter + air.seaRelief * head, z, head];
    };
    const positions: number[] = [];
    const colors: number[] = [];
    const base = new THREE.Color(palette.cloud);
    const hollow = new THREE.Color(air.fogColor ?? palette.horizon).lerp(base, 0.4);
    const color = new THREE.Color();
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < columns; c++) {
        for (const tri of [
          [point(r, c), point(r + 1, c), point(r + 1, c + 1)],
          [point(r, c), point(r + 1, c + 1), point(r, c + 1)],
        ]) {
          // The hollows between the heads take the sky's colour, the crowns the cloud's
          const head = (tri[0][3] + tri[1][3] + tri[2][3]) / 3;
          color.copy(hollow).lerp(base, air.seaRelief > 0 ? Math.min(1, head * 1.5) : 1);
          color.multiplyScalar(air.seaBright * (1 - air.seaFacets + air.seaFacets * hash3(r, c, tri[2][0] | 0)));
          for (const v of tri) {
            positions.push(v[0], v[1], v[2]);
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
    material.emissive.set(palette.cloud).multiplyScalar(air.seaEmissive);
    this.cloudSeaMaterial = material;
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

  /**
   * "race": every gate still to take glows, the finish most, and passed ones are gone. "free": all shown
   * quietly. `restart` brings every gate back (a new race); a change of mode does too
   */
  setRings(mode: RingMode, restart = false) {
    this.gates.setMode(mode, restart);
  }

  /** Plays a gate's pass animation: the crystals flare, burst and dissolve */
  passRing(index: number) {
    this.gates.pass(index);
  }

  /** Per frame: stream rock around the camera, the sky follows it, the gates animate */
  /** `raceTime`: seconds on the race clock, for what animates in step with everyone in the room (the jellyfish) */
  update(camera: THREE.Camera, dt: number, velocity?: THREE.Vector3, raceTime = 0) {
    // The clock arriving land fades in by: the wall clock, so it also runs while the game's is slowed
    ATMOSPHERE.now.value = performance.now() / 1000;
    ATMOSPHERE.revealRate.value = 1 / Math.max(TERRAIN.fadeIn, 1e-3);
    this.applyAir();
    const mist = this.world.biome.sky.mist;
    if (mist.mode === "valley") ATMOSPHERE.mistHeight.value = this.world.valleyFloor(camera.position.z) + mist.above;
    const underwater = this.world.biome.sky.underwater;
    const look = lookFor(this.world.palette);
    if (underwater) {
      // The surface stays the same height over the racing line all the way down; moonlight ripples less
      const dim = 1 - this.world.palette.night * look.deep.nightDim;
      ATMOSPHERE.surface.value = this.world.course.y(camera.position.z) + underwater.surface;
      ATMOSPHERE.caustics.value = look.deep.caustics * dim;
      ATMOSPHERE.surfaceGlow.value = look.deep.surface;
      this.shafts!.update(look.deep.shafts * dim);
      this.seaLife!.update(look.deep.life, raceTime);
    }
    this.land.update(camera.position, this.dispatch, velocity);
    this.ready = this.land.ready;
    applyTerrainTuning(this.terrainUniforms, this.world.biome.terrain.layers, look.land);
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
