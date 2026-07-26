// =============================================================================
// world.js - Owns all chunks, generates terrain + trees, streams chunk meshes
// around the player, edits blocks, and casts rays for block selection.
//
// Phase 5: terrain math lives in terrain.js (TerrainGen, three-free) behind a
// per-world `genVersion`:
//   1 = pre-Phase-5 generator, preserved bit-identically for old saves;
//   2 = continentalness worldgen (oceans/beaches/mountains, new biomes,
//       cave entrances, noodle caves, ravines) for new worlds.
// Meshing + lighting run in a small Web Worker pool by default (snapshot in,
// transferable geometry out — see meshcore.js/meshworker.js), with the
// synchronous path kept both as an automatic fallback (worker creation
// failure, file:// protocol, ?workers=0) and for edit remeshes, which stay
// synchronous so block placement feedback is immediate.
// =============================================================================

import * as THREE from 'three';
import { Chunk } from './chunk.js';
import { computeChunkLight, chunksAffectedByEdit } from './lighting.js';
import { decorateStructures } from './structures.js';
import { TerrainGen } from './terrain.js';
import { SNAP_VOL, SNAP_W } from './meshcore.js';
import {
  CHUNK_SIZE, CHUNK_HEIGHT, RENDER_DISTANCE, WORLD_SEED,
  DIRT_DEPTH, SEA_LEVEL, SAND_LEVEL,
  BIOME, BIOMES, BLOCK, DIMENSIONS, isSolid, isTransparent, lightLevel,
  encodeEdit, decodeEditId, decodeEditMeta,
} from './config.js';

const keyOf = (cx, cz) => cx + ',' + cz;
// Floor division / positive modulo so negative world coords map correctly.
const floorDiv = (a, b) => Math.floor(a / b);
const posMod = (a, b) => ((a % b) + b) % b;

const localIndex = (x, y, z) => x + CHUNK_SIZE * (z + CHUNK_SIZE * y);
const snapIndex = (x, y, z) => x + SNAP_W * (z + SNAP_W * y);

// Scratch snapshot buffers for SYNCHRONOUS mesh builds (single-threaded main
// loop; worker jobs get fresh arrays because their buffers are transferred).
const scratchBlocks = new Uint16Array(SNAP_VOL);
const scratchMeta = new Uint8Array(SNAP_VOL);
const scratchSky = new Uint8Array(SNAP_VOL);
const scratchBlk = new Uint8Array(SNAP_VOL);

// ---- Shared mesh-worker pool ---------------------------------------------------
// One pool for every World instance (overworld + nether share it; jobs carry
// the skyless flag). Created lazily on the first World; falls back to null on
// any failure, which sends every world down the synchronous path.
const meshPool = {
  workers: null,     // Worker[] | null (null = sync fallback)
  jobs: new Map(),   // jobId -> { world, key, revs }
  nextJobId: 1,
  tried: false,
};

function meshPoolDisable(err) {
  if (meshPool.workers) {
    for (const w of meshPool.workers) { try { w.terminate(); } catch (e) { /* ignore */ } }
  }
  meshPool.workers = null;
  for (const [, job] of meshPool.jobs) {
    const entry = job.world.chunks.get(job.key);
    if (entry) entry.chunk.meshJobId = null;
  }
  meshPool.jobs.clear();
  console.warn('[world] mesh workers unavailable; using synchronous meshing.',
    err && (err.message || err));
}

function meshPoolInit() {
  if (meshPool.tried) return;
  meshPool.tried = true;
  try {
    if (typeof Worker === 'undefined' || typeof location === 'undefined') return;
    if (location.protocol === 'file:') return;
    if (new URLSearchParams(location.search).get('workers') === '0') return;
    const workers = [];
    for (let i = 0; i < 2; i++) {
      const w = new Worker(new URL('./meshworker.js', import.meta.url), { type: 'module' });
      w.onmessage = (e) => meshPoolResult(e.data);
      w.onerror = (e) => meshPoolDisable(e);
      workers.push(w);
    }
    meshPool.workers = workers;
  } catch (e) {
    meshPool.workers = null;
    console.warn('[world] mesh worker creation failed; using synchronous meshing.', e);
  }
}

function meshPoolResult(data) {
  if (data.ready) return; // worker module loaded fine
  const job = meshPool.jobs.get(data.jobId);
  if (!job) return;
  meshPool.jobs.delete(data.jobId);
  job.world._installWorkerMesh(job, data);
}

export class World {
  constructor(scene, atlasTexture, genVersion = 2) {
    this.scene = scene;
    this.atlas = atlasTexture;
    // Terrain profile (1 = legacy, 2 = continentalness). All terrain fields
    // live in TerrainGen; the noise instances are shared so subclasses (the
    // nether) keep using this.noise exactly as before.
    this.genVersion = genVersion;
    this.terrain = new TerrainGen(WORLD_SEED, genVersion);
    this.noise = this.terrain.noise;
    this.tempNoise = this.terrain.tempNoise;
    this.moistNoise = this.terrain.moistNoise;
    this.riverNoise = this.terrain.riverNoise;
    this.chunks = new Map(); // key -> { chunk, mesh|null }

    // Player edits as diffs against procedural generation, grouped by chunk:
    //   Map<"cx,cz", Map<"lx,y,lz", encodedEdit>>
    // Values pack block id + metadata (see encodeEdit in config.js; old saves'
    // bare ids decode to meta 0). Re-applied every time a chunk is generated,
    // so edits survive both chunk unload/reload and a full reload from storage.
    this.edits = new Map();

    // Procedural blocks a tree in one chunk spills into a NEIGHBOUR chunk (its
    // canopy crossing a border). Keyed by the target chunk so the leaves are
    // re-applied whenever that chunk (re)generates - fixing the half-trees that
    // used to be clipped at chunk borders. Deterministic from the seed, so it
    // isn't saved; it simply rebuilds itself as chunks regenerate.
    //   Map<"cx,cz", Map<"lx,y,lz", { id, airOnly }>>
    this.pendingGen = new Map();
    // Already-meshed neighbour chunks that a freshly grown tree patched and that
    // therefore need their mesh rebuilt. Drained at the end of update().
    this.treeDirty = new Set();

    // Which dimension this world instance is (subclasses override). The
    // descriptor drives sky lighting, container-key prefixes and save fields.
    this.dim = DIMENSIONS.overworld;

    // Structure side-tables, rebuilt deterministically during generation (not
    // saved): loot chests waiting for their first open, and mob spawner types.
    this.structureLoot = new Map();     // "x,y,z" -> loot table kind
    this.structureSpawners = new Map(); // "x,y,z" -> mob type

    // Optional cell-change callback (x, y, z), fired by setBlock/setBlocks
    // whenever a cell's id or meta actually changes. main.js points it at the
    // dimension's redstone engine so observers can watch cells cheaply.
    this.onCellChanged = null;

    meshPoolInit();
  }

  // 'worker' when streaming meshes are built in the worker pool, else 'sync'.
  get meshPipeline() { return meshPool.workers ? 'worker' : 'sync'; }

  // Switch terrain profile (main.js calls this with the save's genVersion
  // BEFORE any chunk generates). Old saves get 1; new worlds keep 2.
  setGenVersion(v) {
    this.genVersion = v;
    this.terrain.genVersion = v;
  }

  // Compat: dimensions without sky (nether/end) have no sunlight; lighting.js
  // skips sky seeding when true. Reads stay valid everywhere; the discriminator
  // itself now lives in the dimension descriptor.
  get skyless() { return !this.dim.hasSky; }

  // ---- Biomes -------------------------------------------------------------
  // Classify a column. Delegates to the terrain profile: V1 keeps the original
  // temperature/moisture cascade; V2 layers continentalness on top of it.
  biomeAt(worldX, worldZ) {
    return this.terrain.biomeAt(worldX, worldZ);
  }

  riverAt(worldX, worldZ) {
    return this.terrain.riverAt(worldX, worldZ);
  }

  // ---- Chunk access -------------------------------------------------------
  getOrCreateChunk(cx, cz) {
    const k = keyOf(cx, cz);
    let entry = this.chunks.get(k);
    if (!entry) {
      const chunk = new Chunk(cx, cz);
      this.generateChunk(chunk);
      entry = { chunk, mesh: null };
      this.chunks.set(k, entry);
    }
    return entry.chunk;
  }

  // ---- Terrain generation -------------------------------------------------
  columnHeight(worldX, worldZ) {
    return this.terrain.columnHeight(worldX, worldZ);
  }

  generateChunk(chunk) {
    if (this.genVersion >= 2) return this.generateChunkV2(chunk);
    return this.generateChunkV1(chunk);
  }

  // GEN_V1 — the pre-Phase-5 generator, preserved exactly (old saves).
  generateChunkV1(chunk) {
    const ox = chunk.cx * CHUNK_SIZE;
    const oz = chunk.cz * CHUNK_SIZE;

    for (let x = 0; x < CHUNK_SIZE; x++) {
      for (let z = 0; z < CHUNK_SIZE; z++) {
        const wx = ox + x, wz = oz + z;
        let h = this.columnHeight(wx, wz);
        const biome = this.biomeAt(wx, wz);
        const def = BIOMES[biome];
        const isRiver = h > SEA_LEVEL && this.riverAt(wx, wz);

        if (isRiver) {
          h = Math.min(h, SEA_LEVEL - 1);
        }

        for (let y = 0; y <= h; y++) {
          let id;
          if (y === 0) id = BLOCK.BEDROCK;
          else if (y < h - DIRT_DEPTH) id = this.caveAt(wx, y, wz, h) ? BLOCK.AIR : this.oreAt(wx, y, wz);
          else if (y < h) id = isRiver ? BLOCK.SAND : def.subsurface;
          else id = isRiver ? BLOCK.SAND : ((h <= SAND_LEVEL) ? BLOCK.SAND : def.surface);
          chunk.setBlockLocal(x, y, z, id);
        }

        // Flood any empty space above the ground up to sea level with water.
        for (let y = h + 1; y <= SEA_LEVEL; y++) {
          chunk.setBlockLocal(x, y, z, BLOCK.WATER);
        }

        // Gravel/clay patches at lake/river bottoms
        if (h <= SEA_LEVEL && h > 1) {
          const gHash = this.hash01_3(wx, h, wz, 777);
          if (gHash < 0.25) chunk.setBlockLocal(x, h, z, BLOCK.GRAVEL);
          else if (gHash < 0.35) chunk.setBlockLocal(x, h, z, BLOCK.CLAY);
        }

        // Skip trees/decorations in river columns
        if (isRiver) continue;

        // Grow trees per the biome's density, only on dry land (above the beach
        // line, so never in water; deserts have a tree chance of 0).
        if (h > SAND_LEVEL && def.treeChance > 0 && this.hash01(wx, wz) < def.treeChance) {
          if (def.tallTree) {
            this.plantJungleTree(chunk, x, z, h);
          } else if (biome === BIOME.SNOW) {
            // Snowy forests grow conical spruces.
            this.plantSpruceTree(chunk, x, z, h);
          } else if (biome === BIOME.FOREST && this.hash01_3(wx, h, wz, 379) < 0.25) {
            // A quarter of forest trees are birches.
            this.plantTree(chunk, x, z, h, BLOCK.BIRCH_WOOD, BLOCK.BIRCH_LEAVES);
          } else {
            this.plantTree(chunk, x, z, h);
          }
        }

        // Giant mushrooms in mushroom biome
        if (h > SEA_LEVEL && def.mushroomChance && this.hash01_3(wx, h, wz, 191) < def.mushroomChance) {
          this.plantGiantMushroom(chunk, x, z, h);
        }

        if (def.surface === BLOCK.SAND && h > SEA_LEVEL + 1 && this.hash01_3(wx, h, wz, 131) < 0.011) {
          this.plantCactus(chunk, x, z, h);
        }

        // Flowers and tall grass on grasslands
        if (h > SEA_LEVEL && (def.surface === BLOCK.GRASS || def.surface === BLOCK.SNOW)) {
          const floral = this.hash01_3(wx, h, wz, 200);
          const flowerBoost = def.flowerChance || 0;
          if (floral < 0.025 && def.surface === BLOCK.GRASS) {
            chunk.setBlockLocal(x, h + 1, z, BLOCK.TALL_GRASS);
          } else if (floral > (0.97 - flowerBoost * 0.5)) {
            chunk.setBlockLocal(x, h + 1, z, BLOCK.FLOWER_RED);
          } else if (floral > (0.955 - flowerBoost * 0.5)) {
            chunk.setBlockLocal(x, h + 1, z, BLOCK.FLOWER_YELLOW);
          }
        }

        // Sugar cane on shorelines: a dry column exactly at sea level whose
        // support has water in an adjacent column grows a 2-3 tall stack.
        // (Water fills [neighbourH+1 .. SEA_LEVEL], so a neighbour lower than
        // this column guarantees water right beside the cane's base block.)
        if (h === SEA_LEVEL && this.hash01_3(wx, h, wz, 353) < 0.08 &&
            chunk.getBlockLocal(x, h, z) === BLOCK.SAND) {  // skip gravel/clay patches
          const lower = (nx, nz) => {
            const nh = this.columnHeight(nx, nz);
            const nEff = (nh > SEA_LEVEL && this.riverAt(nx, nz)) ? Math.min(nh, SEA_LEVEL - 1) : nh;
            return nEff < SEA_LEVEL;
          };
          if (lower(wx + 1, wz) || lower(wx - 1, wz) || lower(wx, wz + 1) || lower(wx, wz - 1)) {
            const canes = 2 + (this.hash01_3(wx, h, wz, 359) < 0.4 ? 1 : 0);
            for (let i = 1; i <= canes && h + i < CHUNK_HEIGHT; i++) {
              chunk.setBlockLocal(x, h + i, z, BLOCK.SUGAR_CANE);
            }
          }
        }
      }
    }

    this.decorateChunk(chunk);
    decorateStructures(this, chunk);

    // Overlay any leaves that neighbouring chunks' trees spilled into this one,
    // then let player edits win over everything.
    this.applyPending(chunk);
    // Player edits win over procedural generation, so apply them last.
    this.applyEdits(chunk);
  }

  // GEN_V2 — continentalness worldgen for new worlds: oceans, beaches,
  // mountains with snow caps, new biomes, cave entrances, noodle caves and
  // ravines. Structure/decoration passes are shared with V1.
  generateChunkV2(chunk) {
    const ox = chunk.cx * CHUNK_SIZE;
    const oz = chunk.cz * CHUNK_SIZE;
    const T = this.terrain;

    for (let x = 0; x < CHUNK_SIZE; x++) {
      for (let z = 0; z < CHUNK_SIZE; z++) {
        const wx = ox + x, wz = oz + z;
        let h = T.columnHeightV2(wx, wz);
        const biome = T.biomeAtV2(wx, wz);
        const def = BIOMES[biome];
        const c = T.contC(wx, wz);
        const isRiver = h > SEA_LEVEL && T.riverAtV2(wx, wz);
        if (isRiver) h = Math.min(h, SEA_LEVEL - 1);

        // Swamp pools: occasional shallow dips flooded to sea level.
        let isPool = false;
        if (!isRiver && biome === BIOME.SWAMP && h >= SEA_LEVEL && h <= SEA_LEVEL + 2 &&
            this.hash01_3(wx, 0, wz, 911) < 0.09) {
          h = SEA_LEVEL - 1;
          isPool = true;
        }

        const ravine = T.ravineDepthV2(wx, wz);
        // Sand: beaches, river/pool beds, and any low coastal ground (the V1
        // SAND_LEVEL rule extended to SEA_LEVEL+2 near coasts).
        const sandy = isRiver || isPool || biome === BIOME.BEACH ||
          h <= SAND_LEVEL || (h <= SEA_LEVEL + 2 && c < 0.05);
        const snowCap = biome === BIOME.MOUNTAINS && h > 80;

        for (let y = 0; y <= h; y++) {
          let id;
          if (y === 0) id = BLOCK.BEDROCK;
          else if (T.carveV2(wx, y, wz, h, ravine)) continue; // caves break the surface now
          else if (y < h - DIRT_DEPTH) id = this.oreAtV2(wx, y, wz, biome);
          else if (y < h) id = sandy ? BLOCK.SAND : def.subsurface;
          else id = sandy ? BLOCK.SAND : (snowCap ? BLOCK.SNOW : def.surface);
          chunk.setBlockLocal(x, y, z, id);
        }

        // Flood up to sea level. Deliberately unconditional: caves that open
        // below sea level under oceans simply generate water-filled
        // (documented simplification).
        for (let y = h + 1; y <= SEA_LEVEL; y++) {
          chunk.setBlockLocal(x, y, z, BLOCK.WATER);
        }

        const surfaceOpen = chunk.getBlockLocal(x, h, z) === BLOCK.AIR; // carved away

        // Gravel/clay patches at sea/river/pool bottoms (clay-heavier swamps).
        if (h <= SEA_LEVEL && h > 1 && !surfaceOpen) {
          const gHash = this.hash01_3(wx, h, wz, 777);
          const clayBoost = (biome === BIOME.SWAMP || isPool) ? 0.25 : 0;
          if (gHash < 0.25) chunk.setBlockLocal(x, h, z, BLOCK.GRAVEL);
          else if (gHash < 0.35 + clayBoost) chunk.setBlockLocal(x, h, z, BLOCK.CLAY);
        }

        if (isRiver || isPool) continue;   // no decorations in water columns
        if (surfaceOpen) continue;         // no decorations over cave mouths

        // Trees: per-biome planter dispatch (planters are Phase-2 parameterised).
        if (h > SAND_LEVEL && !sandy && def.treeChance > 0 && this.hash01(wx, wz) < def.treeChance) {
          if (def.tallTree) {
            this.plantJungleTree(chunk, x, z, h);
          } else if (biome === BIOME.SNOW || biome === BIOME.TAIGA || biome === BIOME.MOUNTAINS) {
            this.plantSpruceTree(chunk, x, z, h);
          } else if (biome === BIOME.BIRCH_FOREST) {
            this.plantTree(chunk, x, z, h, BLOCK.BIRCH_WOOD, BLOCK.BIRCH_LEAVES);
          } else if (biome === BIOME.FOREST && this.hash01_3(wx, h, wz, 379) < 0.25) {
            this.plantTree(chunk, x, z, h, BLOCK.BIRCH_WOOD, BLOCK.BIRCH_LEAVES);
          } else {
            this.plantTree(chunk, x, z, h); // oak (plains/forest/swamp/flower)
          }
        }

        // Giant mushrooms in mushroom biome
        if (h > SEA_LEVEL && def.mushroomChance && this.hash01_3(wx, h, wz, 191) < def.mushroomChance) {
          this.plantGiantMushroom(chunk, x, z, h);
        }

        if (def.surface === BLOCK.SAND && biome === BIOME.DESERT &&
            h > SEA_LEVEL + 1 && this.hash01_3(wx, h, wz, 131) < 0.011) {
          this.plantCactus(chunk, x, z, h);
        }

        // Flowers and tall grass on grasslands
        if (h > SEA_LEVEL && !sandy && (def.surface === BLOCK.GRASS || def.surface === BLOCK.SNOW)) {
          const floral = this.hash01_3(wx, h, wz, 200);
          const flowerBoost = def.flowerChance || 0;
          if (floral < 0.025 && def.surface === BLOCK.GRASS) {
            chunk.setBlockLocal(x, h + 1, z, BLOCK.TALL_GRASS);
          } else if (floral > (0.97 - flowerBoost * 0.5)) {
            chunk.setBlockLocal(x, h + 1, z, BLOCK.FLOWER_RED);
          } else if (floral > (0.955 - flowerBoost * 0.5)) {
            chunk.setBlockLocal(x, h + 1, z, BLOCK.FLOWER_YELLOW);
          }
        }

        // Sugar cane on shorelines (same rule as V1, against V2 heights).
        if (h === SEA_LEVEL && this.hash01_3(wx, h, wz, 353) < 0.08 &&
            chunk.getBlockLocal(x, h, z) === BLOCK.SAND) {
          const lower = (nx, nz) => {
            const nh = this.columnHeight(nx, nz);
            const nEff = (nh > SEA_LEVEL && this.riverAt(nx, nz)) ? Math.min(nh, SEA_LEVEL - 1) : nh;
            return nEff < SEA_LEVEL;
          };
          if (lower(wx + 1, wz) || lower(wx - 1, wz) || lower(wx, wz + 1) || lower(wx, wz - 1)) {
            const canes = 2 + (this.hash01_3(wx, h, wz, 359) < 0.4 ? 1 : 0);
            for (let i = 1; i <= canes && h + i < CHUNK_HEIGHT; i++) {
              chunk.setBlockLocal(x, h + i, z, BLOCK.SUGAR_CANE);
            }
          }
        }
      }
    }

    this.decorateChunk(chunk);
    decorateStructures(this, chunk);
    this.applyPending(chunk);
    this.applyEdits(chunk);
  }

  // ---- Persistent edits ---------------------------------------------------
  // Overlay any stored edits for this chunk onto its freshly generated blocks.
  applyEdits(chunk) {
    const inner = this.edits.get(keyOf(chunk.cx, chunk.cz));
    if (!inner) return;
    for (const [vk, v] of inner) {
      const [lx, y, lz] = vk.split(',');
      chunk.setBlockLocal(+lx, +y, +lz, decodeEditId(v));
      chunk.setMetaLocal(+lx, +y, +lz, decodeEditMeta(v));
    }
  }

  // Record a single player edit in local (per-chunk) coordinates.
  recordEdit(cx, cz, lx, y, lz, id, meta = 0) {
    const k = keyOf(cx, cz);
    let inner = this.edits.get(k);
    if (!inner) { inner = new Map(); this.edits.set(k, inner); }
    inner.set(lx + ',' + y + ',' + lz, encodeEdit(id, meta));
  }

  // Serialise all edits to a plain JSON-able object: { "cx,cz": { "lx,y,lz": encoded } }.
  serializeEdits() {
    const out = {};
    for (const [ck, inner] of this.edits) {
      const o = {};
      for (const [vk, id] of inner) o[vk] = id;
      out[ck] = o;
    }
    return out;
  }

  // Replace the edit set from a previously serialised object. Call BEFORE the
  // first chunk is generated so spawn-area chunks pick the edits up.
  loadEdits(obj) {
    this.edits.clear();
    if (!obj) return;
    for (const ck in obj) {
      const inner = new Map();
      const o = obj[ck];
      for (const vk in o) inner.set(vk, o[vk]);
      this.edits.set(ck, inner);
    }
  }

  // Deterministic pseudo-random value in [0,1) for a world column.
  hash01(x, z) {
    let h = (Math.imul(x, 374761393) + Math.imul(z, 668265263) + Math.imul(WORLD_SEED, 1442695041)) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  }

  hash01_3(x, y, z, salt = 0) {
    let h = (
      Math.imul(x, 374761393) ^
      Math.imul(y, 668265263) ^
      Math.imul(z, 2246822519) ^
      Math.imul(WORLD_SEED + salt, 1442695041)
    ) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  }

  valueNoise3(x, y, z, frequency, salt) {
    return this.terrain.valueNoise3(x, y, z, frequency, salt);
  }

  // GEN_V1 worm caves (kept for old saves; delegates to the terrain module,
  // whose copy is bit-identical to the pre-Phase-5 formula).
  caveAt(worldX, y, worldZ, surfaceY) {
    return this.terrain.caveAtV1(worldX, y, worldZ, surfaceY);
  }

  oreAt(worldX, y, worldZ) {
    if (y <= 1) return BLOCK.STONE;

    const gx = Math.floor(worldX / 2);
    const gy = Math.floor(y / 2);
    const gz = Math.floor(worldZ / 2);

    if (y <= 12) {
      if (this.hash01_3(gx, gy, gz, 67) < 0.012 + (1 - y / 14) * 0.008) return BLOCK.DIAMOND_ORE;
    }
    if (y <= 34) {
      const depth = 1 - y / 36;
      if (this.hash01_3(gx, gy, gz, 17) < 0.045 + depth * 0.055) return BLOCK.IRON_ORE;
    }
    if (y <= 16) {
      if (this.hash01_3(gx, gy, gz, 41) < 0.030 + (1 - y / 18) * 0.02) return BLOCK.GOLD_ORE;
    }
    if (y <= 14) {
      if (this.hash01_3(gx, gy, gz, 53) < 0.040 + (1 - y / 16) * 0.02) return BLOCK.REDSTONE_ORE;
    }
    if (y <= 44) {
      const band = y < 8 ? 0.45 : 1;
      if (this.hash01_3(gx, gy, gz, 31) < 0.075 * band) return BLOCK.COAL_ORE;
    }
    if (this.hash01_3(gx, gy, gz, 99) < 0.04) return BLOCK.GRAVEL;
    return BLOCK.STONE;
  }

  // V2 ores: the V1 depth bands stay valid (they're depth-based), plus lapis
  // (deep, everywhere) and emerald (mountains only) as small veins on the same
  // 2x2x2 cell grid.
  oreAtV2(worldX, y, worldZ, biome) {
    if (y <= 1) return BLOCK.STONE;
    const gx = Math.floor(worldX / 2);
    const gy = Math.floor(y / 2);
    const gz = Math.floor(worldZ / 2);
    if (biome === BIOME.MOUNTAINS && y >= 20 && y <= 60) {
      if (this.hash01_3(gx, gy, gz, 181) < 0.0004) return BLOCK.EMERALD_ORE;
    }
    if (y <= 24) {
      if (this.hash01_3(gx, gy, gz, 59) < 0.001) return BLOCK.LAPIS_ORE;
    }
    return this.oreAt(worldX, y, worldZ);
  }

  // Trunk + canopy. Works in WORLD coordinates and routes every block through
  // placeTreeVoxel(), so a canopy that crosses a chunk border is written into
  // the neighbour (or queued for it) instead of being clipped. `woodId` /
  // `leafId` select the material (oak by default, birch in forests).
  plantTree(chunk, lx, lz, surfaceY, woodId = BLOCK.WOOD, leafId = BLOCK.LEAVES) {
    const wx = chunk.cx * CHUNK_SIZE + lx;
    const wz = chunk.cz * CHUNK_SIZE + lz;
    const trunk = 4 + Math.floor(this.hash01(wx + 7, wz + 13) * 2); // 4-5
    const topY = surfaceY + trunk;
    if (topY + 2 >= CHUNK_HEIGHT) return;

    this.placeTreeVoxel(chunk, wx, surfaceY, wz, BLOCK.DIRT, false); // grass -> dirt under trunk
    for (let i = 1; i <= trunk; i++) this.placeTreeVoxel(chunk, wx, surfaceY + i, wz, woodId, false);

    // Three canopy layers (wider lower, narrower top), corners rounded off.
    for (let dy = -1; dy <= 1; dy++) {
      const ly = topY + dy;
      const rad = dy === 1 ? 1 : 2;
      for (let dx = -rad; dx <= rad; dx++) {
        for (let dz = -rad; dz <= rad; dz++) {
          if (dx === 0 && dz === 0 && dy < 1) continue;                 // keep trunk clear
          if (Math.abs(dx) === rad && Math.abs(dz) === rad) continue;   // round corners
          this.placeTreeVoxel(chunk, wx + dx, ly, wz + dz, leafId, true);
        }
      }
    }
    this.placeTreeVoxel(chunk, wx, topY + 1, wz, leafId, true); // crown
  }

  // Conical spruce for the snow biome: taller trunk, narrow leaf rings that
  // alternate radius 1/2 down the trunk, with a small pointed crown.
  plantSpruceTree(chunk, lx, lz, surfaceY) {
    const wx = chunk.cx * CHUNK_SIZE + lx;
    const wz = chunk.cz * CHUNK_SIZE + lz;
    const trunk = 6 + Math.floor(this.hash01(wx + 11, wz + 17) * 2); // 6-7
    const topY = surfaceY + trunk;
    if (topY + 2 >= CHUNK_HEIGHT) return;

    this.placeTreeVoxel(chunk, wx, surfaceY, wz, BLOCK.DIRT, false);
    for (let i = 1; i <= trunk; i++) this.placeTreeVoxel(chunk, wx, surfaceY + i, wz, BLOCK.SPRUCE_WOOD, false);

    for (let dy = 0; dy <= trunk - 3; dy++) {
      const ly = topY - dy;
      const rad = dy === 0 ? 1 : (dy % 2 === 1 ? 2 : 1);
      for (let dx = -rad; dx <= rad; dx++) {
        for (let dz = -rad; dz <= rad; dz++) {
          if (dx === 0 && dz === 0) continue;                           // trunk stays visible
          if (Math.abs(dx) === rad && Math.abs(dz) === rad) continue;   // round corners
          this.placeTreeVoxel(chunk, wx + dx, ly, wz + dz, BLOCK.SPRUCE_LEAVES, true);
        }
      }
    }
    this.placeTreeVoxel(chunk, wx, topY + 1, wz, BLOCK.SPRUCE_LEAVES, true);
    this.placeTreeVoxel(chunk, wx, topY + 2, wz, BLOCK.SPRUCE_LEAVES, true); // pointed crown
  }

  plantCactus(chunk, lx, lz, surfaceY) {
    const wx = chunk.cx * CHUNK_SIZE + lx;
    const wz = chunk.cz * CHUNK_SIZE + lz;
    const height = 2 + Math.floor(this.hash01_3(wx, surfaceY, wz, 157) * 3);
    if (surfaceY + height >= CHUNK_HEIGHT) return;
    for (let i = 1; i <= height; i++) this.placeTreeVoxel(chunk, wx, surfaceY + i, wz, BLOCK.CACTUS, true);
  }

  plantJungleTree(chunk, lx, lz, surfaceY) {
    const wx = chunk.cx * CHUNK_SIZE + lx;
    const wz = chunk.cz * CHUNK_SIZE + lz;
    const trunk = 6 + Math.floor(this.hash01(wx + 3, wz + 7) * 4);
    const topY = surfaceY + trunk;
    if (topY + 3 >= CHUNK_HEIGHT) return;

    this.placeTreeVoxel(chunk, wx, surfaceY, wz, BLOCK.DIRT, false);
    for (let i = 1; i <= trunk; i++) this.placeTreeVoxel(chunk, wx, surfaceY + i, wz, BLOCK.WOOD, false);

    for (let dy = -2; dy <= 2; dy++) {
      const ly = topY + dy;
      const rad = dy >= 1 ? 1 : (dy === 0 ? 2 : 3);
      for (let dx = -rad; dx <= rad; dx++) {
        for (let dz = -rad; dz <= rad; dz++) {
          if (dx === 0 && dz === 0 && dy < 1) continue;
          if (Math.abs(dx) === rad && Math.abs(dz) === rad) continue;
          this.placeTreeVoxel(chunk, wx + dx, ly, wz + dz, BLOCK.LEAVES, true);
        }
      }
    }
    this.placeTreeVoxel(chunk, wx, topY + 2, wz, BLOCK.LEAVES, true);

    // Vines (tall grass on trunk sides as a visual approximation)
    for (let i = 2; i < trunk - 1; i++) {
      if (this.hash01_3(wx, surfaceY + i, wz, 223) < 0.35) {
        const dx = (this.hash01_3(wx, surfaceY + i, wz, 227) < 0.5) ? 1 : -1;
        this.placeTreeVoxel(chunk, wx + dx, surfaceY + i, wz, BLOCK.LEAVES, true);
      }
    }
  }

  plantGiantMushroom(chunk, lx, lz, surfaceY) {
    const wx = chunk.cx * CHUNK_SIZE + lx;
    const wz = chunk.cz * CHUNK_SIZE + lz;
    const trunk = 4 + Math.floor(this.hash01_3(wx, surfaceY, wz, 199) * 3);
    const topY = surfaceY + trunk;
    if (topY + 2 >= CHUNK_HEIGHT) return;

    this.placeTreeVoxel(chunk, wx, surfaceY, wz, BLOCK.DIRT, false);
    for (let i = 1; i <= trunk; i++) this.placeTreeVoxel(chunk, wx, surfaceY + i, wz, BLOCK.PLANK, false);

    // Red cap (use FLOWER_RED as mushroom cap block — visually distinct)
    const capBlock = this.hash01_3(wx, surfaceY, wz, 201) < 0.5 ? BLOCK.FLOWER_RED : BLOCK.FLOWER_YELLOW;
    for (let dx = -2; dx <= 2; dx++) {
      for (let dz = -2; dz <= 2; dz++) {
        if (Math.abs(dx) === 2 && Math.abs(dz) === 2) continue;
        this.placeTreeVoxel(chunk, wx + dx, topY, wz + dz, BLOCK.LEAVES, true);
        if (Math.abs(dx) <= 1 && Math.abs(dz) <= 1) {
          this.placeTreeVoxel(chunk, wx + dx, topY + 1, wz + dz, BLOCK.LEAVES, true);
        }
      }
    }
  }

  decorateChunk(chunk) {
    if (this.hash01_3(chunk.cx, 0, chunk.cz, 701) > 0.045) return;
    const lx = 3 + Math.floor(this.hash01_3(chunk.cx, 1, chunk.cz, 703) * 10);
    const lz = 3 + Math.floor(this.hash01_3(chunk.cx, 2, chunk.cz, 709) * 10);
    const wx = chunk.cx * CHUNK_SIZE + lx;
    const wz = chunk.cz * CHUNK_SIZE + lz;
    const h = this.columnHeight(wx, wz);
    if (h <= SEA_LEVEL + 1 || h + 4 >= CHUNK_HEIGHT) return;
    const biome = this.biomeAt(wx, wz);
    if (biome === BIOME.DESERT || biome === BIOME.OCEAN || biome === BIOME.MOUNTAINS) return;
    // Proper multi-building villages come from structures.js; lone surface
    // ruins remain as small landmarks.
    this.placeRuin(chunk, wx, h + 1, wz);
  }

  placeVillageHouse(chunk, wx, y, wz) {
    // 5x5 cobblestone house with plank roof
    for (let dx = -2; dx <= 2; dx++) {
      for (let dz = -2; dz <= 2; dz++) {
        this.placeTreeVoxel(chunk, wx + dx, y, wz + dz, BLOCK.COBBLESTONE, true);
        const wall = Math.abs(dx) === 2 || Math.abs(dz) === 2;
        const isDoor = dx === 0 && dz === 2;
        for (let dy = 1; dy <= 3; dy++) {
          if (wall && !(isDoor && dy <= 2)) {
            this.placeTreeVoxel(chunk, wx + dx, y + dy, wz + dz, BLOCK.PLANK, true);
          }
        }
        this.placeTreeVoxel(chunk, wx + dx, y + 4, wz + dz, BLOCK.PLANK, true);
      }
    }
    // Windows
    this.placeTreeVoxel(chunk, wx - 2, y + 2, wz, BLOCK.GLASS, true);
    this.placeTreeVoxel(chunk, wx + 2, y + 2, wz, BLOCK.GLASS, true);
    // Torch inside
    this.placeTreeVoxel(chunk, wx, y + 3, wz, BLOCK.TORCH, true);
  }

  placeRuin(chunk, wx, y, wz) {
    for (let dx = -2; dx <= 2; dx++) {
      for (let dz = -2; dz <= 2; dz++) {
        const edge = Math.abs(dx) === 2 || Math.abs(dz) === 2;
        const corner = Math.abs(dx) === 2 && Math.abs(dz) === 2;
        const r = this.hash01_3(wx + dx, y, wz + dz, 719);
        if (!edge && r < 0.45) this.placeTreeVoxel(chunk, wx + dx, y, wz + dz, BLOCK.PLANK, true);
        if (edge && !corner && r < 0.42) this.placeTreeVoxel(chunk, wx + dx, y, wz + dz, BLOCK.STONE, true);
        if (corner && r < 0.72) {
          this.placeTreeVoxel(chunk, wx + dx, y, wz + dz, BLOCK.STONE, true);
          if (r < 0.45) this.placeTreeVoxel(chunk, wx + dx, y + 1, wz + dz, BLOCK.STONE, true);
        }
      }
    }
    if (this.hash01_3(wx, y, wz, 727) < 0.45) this.placeTreeVoxel(chunk, wx, y, wz, BLOCK.COAL_ORE, true);
  }

  // Place one block of a tree at world (wx,wy,wz). `airOnly` (leaves) means only
  // overwrite empty space, so a neighbour's leaves never punch through trunks or
  // terrain. Blocks landing in `origin` are written straight in; blocks landing
  // in another chunk are recorded in pendingGen (so they survive that chunk's
  // (re)generation) and, if that chunk already exists, patched + flagged dirty.
  placeTreeVoxel(origin, wx, wy, wz, id, airOnly) {
    if (wy < 0 || wy >= CHUNK_HEIGHT) return;
    const cx = floorDiv(wx, CHUNK_SIZE), cz = floorDiv(wz, CHUNK_SIZE);
    const lx = posMod(wx, CHUNK_SIZE), lz = posMod(wz, CHUNK_SIZE);

    if (cx === origin.cx && cz === origin.cz) {
      if (airOnly && origin.getBlockLocal(lx, wy, lz) !== BLOCK.AIR) return;
      origin.setBlockLocal(lx, wy, lz, id);
      return;
    }

    this.recordPending(cx, cz, lx, wy, lz, id, airOnly);
    const entry = this.chunks.get(keyOf(cx, cz));
    if (entry) {
      if (airOnly && entry.chunk.getBlockLocal(lx, wy, lz) !== BLOCK.AIR) return;
      entry.chunk.setBlockLocal(lx, wy, lz, id);
      entry.chunk.lightDirty = true;
      entry.chunk.rev++; // stale any in-flight mesh snapshot of this chunk
      if (entry.mesh) this.treeDirty.add(keyOf(cx, cz)); // already on screen -> remesh
    }
  }

  // Queue a cross-border tree block for a chunk that may not exist yet.
  recordPending(cx, cz, lx, y, lz, id, airOnly) {
    const k = keyOf(cx, cz);
    let inner = this.pendingGen.get(k);
    if (!inner) { inner = new Map(); this.pendingGen.set(k, inner); }
    inner.set(lx + ',' + y + ',' + lz, { id, airOnly });
  }

  // Apply any queued cross-border tree blocks onto a freshly generated chunk.
  applyPending(chunk) {
    const inner = this.pendingGen.get(keyOf(chunk.cx, chunk.cz));
    if (!inner) return;
    for (const [vk, rec] of inner) {
      const [lx, y, lz] = vk.split(',').map(Number);
      if (rec.airOnly && chunk.getBlockLocal(lx, y, lz) !== BLOCK.AIR) continue;
      chunk.setBlockLocal(lx, y, lz, rec.id);
    }
  }

  // ---- Block get/set ------------------------------------------------------
  getBlock(x, y, z) {
    if (y < 0 || y >= CHUNK_HEIGHT) return BLOCK.AIR;
    const chunk = this.getOrCreateChunk(floorDiv(x, CHUNK_SIZE), floorDiv(z, CHUNK_SIZE));
    return chunk.getBlockLocal(posMod(x, CHUNK_SIZE), y, posMod(z, CHUNK_SIZE));
  }

  // Metadata of the block at (x,y,z); 0 outside the world or in chunks that
  // have not been generated (meta never forces a chunk into existence).
  getMeta(x, y, z) {
    if (y < 0 || y >= CHUNK_HEIGHT) return 0;
    const entry = this.chunks.get(keyOf(floorDiv(x, CHUNK_SIZE), floorDiv(z, CHUNK_SIZE)));
    if (!entry) return 0;
    return entry.chunk.getMetaLocal(posMod(x, CHUNK_SIZE), y, posMod(z, CHUNK_SIZE));
  }

  // Mark every chunk whose light can be affected by an edit at (x,z) as
  // light-dirty. Chunks outside the immediate remesh set are picked up lazily
  // by update(), a couple per frame, so one block edit never stalls a frame.
  _markLightDirty(x, z) {
    for (const k of chunksAffectedByEdit(x, z)) {
      const entry = this.chunks.get(k);
      if (entry) entry.chunk.lightDirty = true;
    }
  }

  // Make sure the chunk AND its 3x3 neighbours have light fields, so mesh
  // border vertices sample real neighbour light instead of defaults.
  _ensureLightAround(cx, cz) {
    for (let dz = -1; dz <= 1; dz++) {
      for (let dx = -1; dx <= 1; dx++) {
        const c = this.getOrCreateChunk(cx + dx, cz + dz);
        if (c.lightDirty || !c.lightSky) computeChunkLight(this, cx + dx, cz + dz);
      }
    }
  }

  setBlock(x, y, z, id, meta = 0) {
    if (y < 0 || y >= CHUNK_HEIGHT) return;
    const cx = floorDiv(x, CHUNK_SIZE), cz = floorDiv(z, CHUNK_SIZE);
    const lx = posMod(x, CHUNK_SIZE), lz = posMod(z, CHUNK_SIZE);
    const chunk = this.getOrCreateChunk(cx, cz);
    const old = chunk.getBlockLocal(lx, y, lz);
    const oldMeta = chunk.getMetaLocal(lx, y, lz);
    chunk.setBlockLocal(lx, y, lz, id);
    chunk.setMetaLocal(lx, y, lz, meta);
    chunk.rev++; // stale any in-flight worker snapshot containing this chunk
    this.recordEdit(cx, cz, lx, y, lz, id, meta); // remember the change for save/reload

    // Lightweight cell-change notification (observers, main.js wires it to
    // the dimension's redstone engine). Only fires on a real change.
    if (this.onCellChanged && (old !== id || oldMeta !== meta)) this.onCellChanged(x, y, z);

    // Only re-flood light when the edit can change it (different emission or
    // opacity). Same-shape swaps like doors toggling or repeaters flickering
    // then only remesh, which keeps redstone clocks cheap.
    if (lightLevel(old) !== lightLevel(id) || isTransparent(old) !== isTransparent(id)) {
      this._markLightDirty(x, z);
    }

    // Rebuild this chunk and any border-adjacent neighbour whose faces changed.
    const dirty = new Set([keyOf(cx, cz)]);
    if (lx === 0) dirty.add(keyOf(cx - 1, cz));
    if (lx === CHUNK_SIZE - 1) dirty.add(keyOf(cx + 1, cz));
    if (lz === 0) dirty.add(keyOf(cx, cz - 1));
    if (lz === CHUNK_SIZE - 1) dirty.add(keyOf(cx, cz + 1));
    for (const k of dirty) {
      if (this.chunks.has(k)) {
        const [rcx, rcz] = k.split(',').map(Number);
        this.rebuildMesh(rcx, rcz);
      }
    }
  }

  // Apply many edits at once (explosions), rebuilding each affected chunk mesh
  // a single time instead of once per block.
  setBlocks(list) {
    const dirty = new Set();
    for (const e of list) {
      if (e.y < 0 || e.y >= CHUNK_HEIGHT) continue;
      const cx = floorDiv(e.x, CHUNK_SIZE), cz = floorDiv(e.z, CHUNK_SIZE);
      const lx = posMod(e.x, CHUNK_SIZE), lz = posMod(e.z, CHUNK_SIZE);
      const chunk = this.getOrCreateChunk(cx, cz);
      const old = chunk.getBlockLocal(lx, e.y, lz);
      const oldMeta = chunk.getMetaLocal(lx, e.y, lz);
      chunk.setBlockLocal(lx, e.y, lz, e.id);
      chunk.setMetaLocal(lx, e.y, lz, e.meta || 0);
      chunk.rev++;
      this.recordEdit(cx, cz, lx, e.y, lz, e.id, e.meta || 0);
      if (this.onCellChanged && (old !== e.id || oldMeta !== (e.meta || 0))) {
        this.onCellChanged(e.x, e.y, e.z);
      }
      if (lightLevel(old) !== lightLevel(e.id) || isTransparent(old) !== isTransparent(e.id)) {
        this._markLightDirty(e.x, e.z);
      }
      dirty.add(keyOf(cx, cz));
      if (lx === 0) dirty.add(keyOf(cx - 1, cz));
      if (lx === CHUNK_SIZE - 1) dirty.add(keyOf(cx + 1, cz));
      if (lz === 0) dirty.add(keyOf(cx, cz - 1));
      if (lz === CHUNK_SIZE - 1) dirty.add(keyOf(cx, cz + 1));
    }
    for (const k of dirty) {
      if (this.chunks.has(k)) {
        const [rcx, rcz] = k.split(',').map(Number);
        this.rebuildMesh(rcx, rcz);
      }
    }
  }

  // Edit remeshes stay SYNCHRONOUS: block placement/breaking must show up the
  // same frame. Streaming meshes of fresh chunks go through the worker pool.
  rebuildMesh(cx, cz) {
    const entry = this.chunks.get(keyOf(cx, cz));
    // Only chunks that are currently on screen rebuild; data-only edits (e.g.
    // background furnaces in the other dimension) wait for normal streaming.
    if (!entry || !entry.mesh) return;
    this._ensureLightAround(cx, cz);
    this.scene.remove(entry.mesh);
    entry.chunk.dispose();
    entry.mesh = null;
    const mesh = entry.chunk.buildMesh(this, this.atlas);
    entry.mesh = mesh;
    this.scene.add(mesh);
  }

  // ---- Mesh snapshots (shared by sync + worker paths) -----------------------
  // Copy the 3x3 chunk neighbourhood around (cx,cz) into flat snapshot arrays.
  // `useScratch` reuses module scratch buffers (sync path); worker jobs get
  // fresh arrays because their buffers are transferred to the worker.
  // withLight assembles the cached per-chunk light fields into snapshot space
  // (only meaningful on the sync path, after _ensureLightAround).
  gatherMeshSnapshot(cx, cz, withLight, useScratch = withLight) {
    const blocks = useScratch ? scratchBlocks : new Uint16Array(SNAP_VOL);
    const meta = useScratch ? scratchMeta : new Uint8Array(SNAP_VOL);
    const sky = withLight ? (useScratch ? scratchSky : new Uint8Array(SNAP_VOL)) : null;
    const blk = withLight ? (useScratch ? scratchBlk : new Uint8Array(SNAP_VOL)) : null;
    const skyDefault = this.skyless ? 4 : 15; // matches lightAtWorld's fallback
    const revs = [];
    for (let dcz = -1; dcz <= 1; dcz++) {
      for (let dcx = -1; dcx <= 1; dcx++) {
        const chunk = this.getOrCreateChunk(cx + dcx, cz + dcz);
        revs.push(chunk.rev);
        const ox = (dcx + 1) * CHUNK_SIZE;
        const oz = (dcz + 1) * CHUNK_SIZE;
        const hasLight = withLight && chunk.lightSky;
        for (let y = 0; y < CHUNK_HEIGHT; y++) {
          for (let z = 0; z < CHUNK_SIZE; z++) {
            const src = localIndex(0, y, z);
            const dst = snapIndex(ox, y, oz + z);
            blocks.set(chunk.data.subarray(src, src + CHUNK_SIZE), dst);
            meta.set(chunk.meta.subarray(src, src + CHUNK_SIZE), dst);
            if (withLight) {
              if (hasLight) {
                sky.set(chunk.lightSky.subarray(src, src + CHUNK_SIZE), dst);
                blk.set(chunk.lightBlock.subarray(src, src + CHUNK_SIZE), dst);
              } else {
                sky.fill(skyDefault, dst, dst + CHUNK_SIZE);
                blk.fill(0, dst, dst + CHUNK_SIZE);
              }
            }
          }
        }
      }
    }
    return { blocks, meta, sky, blk, revs };
  }

  // Drop every in-flight worker job for THIS world. Called on dimension
  // travel: the old dimension's meshes are hidden, and a late worker response
  // must not re-add geometry of the inactive dimension to the scene.
  cancelMeshJobs() {
    for (const [id, job] of meshPool.jobs) {
      if (job.world !== this) continue;
      meshPool.jobs.delete(id);
      const entry = this.chunks.get(job.key);
      if (entry) entry.chunk.meshJobId = null;
    }
  }

  // Dispatch a worker mesh job for a chunk (data for the 3x3 neighbourhood is
  // generated on the main thread as part of the snapshot).
  _dispatchMeshJob(chunk) {
    const snap = this.gatherMeshSnapshot(chunk.cx, chunk.cz, false, false);
    const jobId = meshPool.nextJobId++;
    chunk.meshJobId = jobId;
    meshPool.jobs.set(jobId, { world: this, key: keyOf(chunk.cx, chunk.cz), revs: snap.revs });
    const worker = meshPool.workers[jobId % meshPool.workers.length];
    worker.postMessage(
      { jobId, blocks: snap.blocks, meta: snap.meta, skyless: this.skyless },
      [snap.blocks.buffer, snap.meta.buffer],
    );
  }

  // Worker response: install light + geometry unless the chunk vanished or any
  // chunk in the snapshot changed since (stale job -> update() re-queues).
  _installWorkerMesh(job, data) {
    const entry = this.chunks.get(job.key);
    if (!entry) return;
    const chunk = entry.chunk;
    if (chunk.meshJobId === data.jobId) chunk.meshJobId = null;
    if (entry.mesh) return; // already meshed through another path
    const [cx, cz] = job.key.split(',').map(Number);
    let i = 0;
    for (let dcz = -1; dcz <= 1; dcz++) {
      for (let dcx = -1; dcx <= 1; dcx++) {
        const e2 = this.chunks.get(keyOf(cx + dcx, cz + dcz));
        if (!e2 || e2.chunk.rev !== job.revs[i++]) return; // stale snapshot
      }
    }
    // The worker computed light for the whole snapshot; adopt the centre.
    chunk.lightSky = data.lightSky;
    chunk.lightBlock = data.lightBlock;
    chunk.lightDirty = false;
    entry.mesh = chunk.buildMeshFromArrays(data.arrays, this.atlas);
    this.scene.add(entry.mesh);
  }

  // ---- Chunk streaming around the player ----------------------------------
  update(playerPos) {
    const pcx = floorDiv(Math.floor(playerPos.x), CHUNK_SIZE);
    const pcz = floorDiv(Math.floor(playerPos.z), CHUNK_SIZE);

    // Collect every chunk in range, then build NEAREST-first so the ground the
    // player is standing on / looking at appears before far corners. Chunk
    // DATA is still generated for the whole ring each frame; only the
    // expensive MESH work is distance-prioritised and capped.
    const pending = [];
    for (let dz = -RENDER_DISTANCE; dz <= RENDER_DISTANCE; dz++) {
      for (let dx = -RENDER_DISTANCE; dx <= RENDER_DISTANCE; dx++) {
        const cx = pcx + dx, cz = pcz + dz;
        const k = keyOf(cx, cz);
        let entry = this.chunks.get(k);
        if (!entry) { this.getOrCreateChunk(cx, cz); entry = this.chunks.get(k); }
        if (!entry.mesh) pending.push({ entry, d2: dx * dx + dz * dz });
      }
    }
    pending.sort((a, b) => a.d2 - b.d2);

    if (meshPool.workers) {
      // Worker pipeline: snapshot on the main thread (cheap copy), light+mesh
      // in the pool, upload on response. Nearest-first, capped in-flight.
      const MAX_INFLIGHT = 4;
      for (const { entry } of pending) {
        if (meshPool.jobs.size >= MAX_INFLIGHT) break;
        if (entry.chunk.meshJobId != null) continue; // already in flight
        this._dispatchMeshJob(entry.chunk);
      }
    } else {
      // Synchronous fallback: cap mesh builds per frame so a big jump in
      // position never stalls.
      let builds = 0;
      const MAX_BUILDS = 4;
      for (const { entry } of pending) {
        if (builds >= MAX_BUILDS) break;
        this._ensureLightAround(entry.chunk.cx, entry.chunk.cz);
        entry.mesh = entry.chunk.buildMesh(this, this.atlas);
        this.scene.add(entry.mesh);
        builds++;
      }
    }

    // Lazily rebuild already-meshed chunks whose light field went stale after
    // a nearby edit (torch placed, tunnel dug...). A couple per frame keeps
    // light ripples smooth without ever stalling a frame.
    let lightRebuilds = 0;
    const MAX_LIGHT_REBUILDS = 2;
    for (const [k, entry] of this.chunks) {
      if (lightRebuilds >= MAX_LIGHT_REBUILDS) break;
      if (!entry.mesh || !entry.chunk.lightDirty) continue;
      const [rcx, rcz] = k.split(',').map(Number);
      this.rebuildMesh(rcx, rcz);
      lightRebuilds++;
    }

    // Unload chunks well outside the view radius. In-flight worker jobs for
    // unloaded chunks are dropped when their response arrives (no entry).
    const limit = RENDER_DISTANCE + 1;
    for (const [k, entry] of this.chunks) {
      const [cx, cz] = k.split(',').map(Number);
      if (Math.abs(cx - pcx) > limit || Math.abs(cz - pcz) > limit) {
        if (entry.mesh) { this.scene.remove(entry.mesh); entry.chunk.dispose(); }
        this.chunks.delete(k);
      }
    }

    // Rebuild any already-meshed chunks that a neighbouring chunk's tree just
    // grew into. Snapshot + clear first so rebuilds (which may generate more
    // chunks and queue more dirt) settle over subsequent frames instead of
    // recursing here.
    if (this.treeDirty.size) {
      const dirty = [...this.treeDirty];
      this.treeDirty.clear();
      for (const k of dirty) {
        if (this.chunks.has(k)) {
          const [cx, cz] = k.split(',').map(Number);
          this.rebuildMesh(cx, cz);
        }
      }
    }
  }

  // Highest block height at a column (for spawning the player).
  getHeight(x, z) {
    return this.columnHeight(x, z);
  }

  // Highest solid block currently present in a column, including trees,
  // structures and player edits. Used by mobs so they do not ignore built walls.
  surfaceHeight(x, z) {
    for (let y = CHUNK_HEIGHT - 1; y >= 0; y--) {
      const id = this.getBlock(x, y, z);
      if (isSolid(id)) return y;
    }
    return 0;
  }

  // Find a dry column to spawn on: scan outward in rings from (cx,cz) for the
  // nearest column whose surface sits above sea level (GEN_V2: also outside
  // rivers), so the player doesn't start submerged. Falls back to the centre
  // column if everything is ocean.
  findSpawn(cx = 0, cz = 0, radius = 48) {
    for (let r = 0; r <= radius; r++) {
      for (let dz = -r; dz <= r; dz++) {
        for (let dx = -r; dx <= r; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue; // ring edge only
          const x = cx + dx, z = cz + dz;
          const h = this.columnHeight(x, z);
          if (h > SEA_LEVEL && !(this.genVersion >= 2 && this.riverAt(x, z))) return { x, z, h };
        }
      }
    }
    return { x: cx, z: cz, h: this.columnHeight(cx, cz) };
  }

  // ---- Voxel raycast (Amanatides & Woo) -----------------------------------
  // Returns the first block matching `hitTest` (solid blocks by default) as
  // { x, y, z, nx, ny, nz, distance } where the (nx,ny,nz) normal points back
  // toward the ray origin (the face entered), or null if nothing is found
  // within maxDist.
  raycastVoxel(origin, dir, maxDist, hitTest = isSolid) {
    let x = Math.floor(origin.x), y = Math.floor(origin.y), z = Math.floor(origin.z);
    const dx = dir.x, dy = dir.y, dz = dir.z;

    const stepX = Math.sign(dx), stepY = Math.sign(dy), stepZ = Math.sign(dz);
    const tDeltaX = dx !== 0 ? Math.abs(1 / dx) : Infinity;
    const tDeltaY = dy !== 0 ? Math.abs(1 / dy) : Infinity;
    const tDeltaZ = dz !== 0 ? Math.abs(1 / dz) : Infinity;

    // Distance (in t) to the first voxel boundary on each axis.
    const fx = origin.x - Math.floor(origin.x);
    const fy = origin.y - Math.floor(origin.y);
    const fz = origin.z - Math.floor(origin.z);
    let tMaxX = dx > 0 ? (1 - fx) * tDeltaX : dx < 0 ? fx * tDeltaX : Infinity;
    let tMaxY = dy > 0 ? (1 - fy) * tDeltaY : dy < 0 ? fy * tDeltaY : Infinity;
    let tMaxZ = dz > 0 ? (1 - fz) * tDeltaZ : dz < 0 ? fz * tDeltaZ : Infinity;

    let nx = 0, ny = 0, nz = 0;
    let t = 0;

    while (t <= maxDist) {
      if (hitTest(this.getBlock(x, y, z))) return { x, y, z, nx, ny, nz, distance: t };
      if (tMaxX < tMaxY) {
        if (tMaxX < tMaxZ) { x += stepX; t = tMaxX; tMaxX += tDeltaX; nx = -stepX; ny = 0; nz = 0; }
        else { z += stepZ; t = tMaxZ; tMaxZ += tDeltaZ; nx = 0; ny = 0; nz = -stepZ; }
      } else {
        if (tMaxY < tMaxZ) { y += stepY; t = tMaxY; tMaxY += tDeltaY; nx = 0; ny = -stepY; nz = 0; }
        else { z += stepZ; t = tMaxZ; tMaxZ += tDeltaZ; nx = 0; ny = 0; nz = -stepZ; }
      }
    }
    return null;
  }
}
