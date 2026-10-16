// Cuts land meshes off the main thread. Every worker builds the same World from
// the level's key (it's deterministic), then meshes whichever terrain nodes it is
// asked for, at any level of detail.
import { type LevelKey, levelId, makeLevel } from "./biomes";
import { placeFlora } from "./flora/placement";
import { NODE_SIZE, meshNode } from "./terrain/mesh";
import type { NodeRequest } from "./terrain/streamer";
import { World } from "./World";

export type MeshRequest = { level: LevelKey } & NodeRequest;

let world: World | null = null;
let worldId = "";

self.onmessage = (event: MessageEvent<MeshRequest>) => {
  const request = event.data;
  const id = levelId(request.level);
  if (!world || worldId !== id) {
    world = new World(makeLevel(request.level));
    worldId = id;
  }
  const { lod, ix, iy, iz } = request;
  const mesh = meshNode(world, lod, ix, iy, iz);
  const size = NODE_SIZE << lod;
  const flora = placeFlora(world, { x0: ix * size, y0: iy * size, z0: iz * size, x1: (ix + 1) * size, y1: (iy + 1) * size, z1: (iz + 1) * size }, lod);
  const transfer = [flora.plants.buffer, flora.tufts.buffer];
  if (mesh.positions.length) transfer.push(mesh.positions.buffer, mesh.rock.buffer, mesh.cover.buffer, mesh.snow.buffer, mesh.crystal.buffer);
  self.postMessage({ kind: "node", level: id, key: request.key, ...mesh, ...flora }, { transfer: transfer.filter((b) => b.byteLength > 0) });
};
