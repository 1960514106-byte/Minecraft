// =============================================================================
// world.js - Owns all chunks, generates terrain + trees, streams chunk meshes
// around the player, edits blocks, and casts rays for block selection.
// =============================================================================

import * as THREE from 'three';
import { Chunk } from './chunk.js';
import { Noise } from './noise.js';
import { computeChunkLight, chunksAffectedByEdit } from './lighting.js';
import { decorateStructures } from './structures.js';
import {
  CHUNK_SIZE, CHUNK_HEIGHT, RENDER_DISTANCE, WORLD_SEED,
  BASE_HEIGHT, HEIGHT_AMP, DIRT_DEPTH, SEA_LEVEL, SAND_LEVEL,
  BIOME, BIOMES, BLOCK, isSolid, isTransparent, lightLevel,
} from './config.js';

const keyOf = (cx, cz) => cx + ',' + cz;
// Floor division / positive modulo so negative world coords map correctly.
const floorDiv = (a, b) => Math.floor(a / b);
const posMod = (a, b) => ((a % b) + b) % b;

export class World {
  constructor(scene, atlasTexture) {
    this.scene = scene;
    this.atlas = atlasTexture;
    this.noise = new Noise(WORLD_SEED);
    // Separate low-frequency fields for biome temperature & moisture. Distinct
    // seeds keep them independent of the terrain-height noise and each other.
    this.tempNoise = new Noise(WORLD_SEED + 101);
    this.moistNoise = new Noise(WORLD_SEED + 211);
    this.riverNoise = new Noise(WORLD_SEED + 301);
    this.chunks = new Map(); // key -> { chunk, mesh|null }

    // Player edits as diffs against procedural generation, grouped by chunk:
    //   Map<"cx,cz", Map<"lx,y,lz", blockId>>
    // Re-applied every time a chunk is generated, so edits survive both chunk
    // unload/reload and a full reload from localStorage.
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

    // Nether worlds have no sunlight; lighting.js skips sky seeding when set.
    this.skyless = false;

    // Structure side-tables, rebuilt deterministically during generation (not
    // saved): loot chests waiting for their first open, and mob spawner types.
    this.structureLoot = new Map();     // "x,y,z" -> loot table kind
    this.structureSpawners = new Map(); // "x,y,z" -> mob type
  }

  // ---- Biomes -------------------------------------------------------------
  // Classify a column from low-frequency temperature/moisture noise. The very
  // low frequency makes biomes large, smooth regions.
  biomeAt(worldX, worldZ) {
    const t = this.tempNoise.fbm2D(worldX, worldZ, { frequency: 0.0035, octaves: 2 });
    const m = this.moistNoise.fbm2D(worldX, worldZ, { frequency: 0.0040, octaves: 2 });
    if (t > 0.33) return BIOME.DESERT;
    if (t < -0.33) return BIOME.SNOW;
    if (t > 0.05 && m > 0.25) return BIOME.JUNGLE;
    if (m < -0.3 && t < 0.05 && t > -0.2) return BIOME.MUSHROOM;
    if (m > 0.1) {
      const detail = this.moistNoise.fbm2D(worldX + 1000, worldZ + 1000, { frequency: 0.008, octaves: 1 });
      if (detail > 0.15) return BIOME.FLOWER_FOREST;
      return BIOME.FOREST;
    }
    return BIOME.PLAINS;
  }

  riverAt(worldX, worldZ) {
    const biome = this.biomeAt(worldX, worldZ);
    if (biome === BIOME.DESERT) return false;
    const v = this.riverNoise.fbm2D(worldX, worldZ, { frequency: 0.006, octaves: 3 });
    const width = 0.028 + this.riverNoise.fbm2D(worldX + 500, worldZ + 500, { frequency: 0.012, octaves: 2 }) * 0.015;
    return Math.abs(v) < width;
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
    const n = this.noise.fbm2D(worldX, worldZ, { frequency: 0.012, octaves: 4 });
    let h = Math.floor(BASE_HEIGHT + HEIGHT_AMP * n);
    if (h < 1) h = 1;
    if (h > CHUNK_HEIGHT - 1) h = CHUNK_HEIGHT - 1;
    return h;
  }

  generateChunk(chunk) {
    const ox = chunk.cx * CHUNK_SIZE;
    const oz = chunk.cz * CHUNK_SIZE;

    for (let x = 0; x < CHUNK_SIZE; x++) {
      for (let z = 0; z < CHUNK_SIZE; z++) {
        const wx = ox + x, wz = oz + z;
        let h = this.columnHeight(wx, wz);
        const def = BIOMES[this.biomeAt(wx, wz)];
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

  // ---- Persistent edits ---------------------------------------------------
  // Overlay any stored edits for this chunk onto its freshly generated blocks.
  applyEdits(chunk) {
    const inner = this.edits.get(keyOf(chunk.cx, chunk.cz));
    if (!inner) return;
    for (const [vk, id] of inner) {
      const [lx, y, lz] = vk.split(',');
      chunk.setBlockLocal(+lx, +y, +lz, id);
    }
  }

  // Record a single player edit in local (per-chunk) coordinates.
  recordEdit(cx, cz, lx, y, lz, id) {
    const k = keyOf(cx, cz);
    let inner = this.edits.get(k);
    if (!inner) { inner = new Map(); this.edits.set(k, inner); }
    inner.set(lx + ',' + y + ',' + lz, id);
  }

  // Serialise all edits to a plain JSON-able object: { "cx,cz": { "lx,y,lz": id } }.
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
    const sx = x * frequency;
    const sy = y * frequency;
    const sz = z * frequency;
    const ix = Math.floor(sx), iy = Math.floor(sy), iz = Math.floor(sz);
    const fx = sx - ix, fy = sy - iy, fz = sz - iz;
    const smooth = (t) => t * t * (3 - 2 * t);
    const lerp = (a, b, t) => a + (b - a) * t;
    const ux = smooth(fx), uy = smooth(fy), uz = smooth(fz);

    const c000 = this.hash01_3(ix, iy, iz, salt);
    const c100 = this.hash01_3(ix + 1, iy, iz, salt);
    const c010 = this.hash01_3(ix, iy + 1, iz, salt);
    const c110 = this.hash01_3(ix + 1, iy + 1, iz, salt);
    const c001 = this.hash01_3(ix, iy, iz + 1, salt);
    const c101 = this.hash01_3(ix + 1, iy, iz + 1, salt);
    const c011 = this.hash01_3(ix, iy + 1, iz + 1, salt);
    const c111 = this.hash01_3(ix + 1, iy + 1, iz + 1, salt);

    const x00 = lerp(c000, c100, ux);
    const x10 = lerp(c010, c110, ux);
    const x01 = lerp(c001, c101, ux);
    const x11 = lerp(c011, c111, ux);
    return lerp(lerp(x00, x10, uy), lerp(x01, x11, uy), uz);
  }

  caveAt(worldX, y, worldZ, surfaceY) {
    if (y < 5 || y > surfaceY - 6) return false;
    const openBias = y < 12 ? -0.04 : 0;
    const broad = this.valueNoise3(worldX, y * 1.35, worldZ, 0.075, 73);
    const detail = this.valueNoise3(worldX + 1000, y * 1.8, worldZ - 1000, 0.135, 97);
    const cavern = this.valueNoise3(worldX - 700, y * 0.8, worldZ + 700, 0.035, 149);
    return broad + detail * 0.42 + openBias > 0.92 || (cavern > 0.88 && detail > 0.62);
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

  // Trunk + canopy. Works in WORLD coordinates and routes every block through
  // placeTreeVoxel(), so a canopy that crosses a chunk border is written into
  // the neighbour (or queued for it) instead of being clipped.
  plantTree(chunk, lx, lz, surfaceY) {
    const wx = chunk.cx * CHUNK_SIZE + lx;
    const wz = chunk.cz * CHUNK_SIZE + lz;
    const trunk = 4 + Math.floor(this.hash01(wx + 7, wz + 13) * 2); // 4-5
    const topY = surfaceY + trunk;
    if (topY + 2 >= CHUNK_HEIGHT) return;

    this.placeTreeVoxel(chunk, wx, surfaceY, wz, BLOCK.DIRT, false); // grass -> dirt under trunk
    for (let i = 1; i <= trunk; i++) this.placeTreeVoxel(chunk, wx, surfaceY + i, wz, BLOCK.WOOD, false);

    // Three canopy layers (wider lower, narrower top), corners rounded off.
    for (let dy = -1; dy <= 1; dy++) {
      const ly = topY + dy;
      const rad = dy === 1 ? 1 : 2;
      for (let dx = -rad; dx <= rad; dx++) {
        for (let dz = -rad; dz <= rad; dz++) {
          if (dx === 0 && dz === 0 && dy < 1) continue;                 // keep trunk clear
          if (Math.abs(dx) === rad && Math.abs(dz) === rad) continue;   // round corners
          this.placeTreeVoxel(chunk, wx + dx, ly, wz + dz, BLOCK.LEAVES, true);
        }
      }
    }
    this.placeTreeVoxel(chunk, wx, topY + 1, wz, BLOCK.LEAVES, true); // crown
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
    if (biome === BIOME.DESERT) return;
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

  setBlock(x, y, z, id) {
    if (y < 0 || y >= CHUNK_HEIGHT) return;
    const cx = floorDiv(x, CHUNK_SIZE), cz = floorDiv(z, CHUNK_SIZE);
    const lx = posMod(x, CHUNK_SIZE), lz = posMod(z, CHUNK_SIZE);
    const chunk = this.getOrCreateChunk(cx, cz);
    const old = chunk.getBlockLocal(lx, y, lz);
    chunk.setBlockLocal(lx, y, lz, id);
    this.recordEdit(cx, cz, lx, y, lz, id); // remember the change for save/reload

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
      chunk.setBlockLocal(lx, e.y, lz, e.id);
      this.recordEdit(cx, cz, lx, e.y, lz, e.id);
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

  // ---- Chunk streaming around the player ----------------------------------
  update(playerPos) {
    const pcx = floorDiv(Math.floor(playerPos.x), CHUNK_SIZE);
    const pcz = floorDiv(Math.floor(playerPos.z), CHUNK_SIZE);

    // Cap mesh builds per frame so a big jump in position never stalls.
    let builds = 0;
    const MAX_BUILDS = 4;

    // Collect every chunk in range, then build NEAREST-first so the ground the
    // player is standing on / looking at appears before far corners. (The old
    // corner-to-corner sweep built the far back-left chunk first, so a respawn
    // or big jump showed distant terrain popping in while nearby was still a
    // hole.) Chunk DATA is still generated for the whole ring each frame; only
    // the expensive MESH build is distance-prioritised and capped.
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
    for (const { entry } of pending) {
      if (builds >= MAX_BUILDS) break;
      this._ensureLightAround(entry.chunk.cx, entry.chunk.cz);
      entry.mesh = entry.chunk.buildMesh(this, this.atlas);
      this.scene.add(entry.mesh);
      builds++;
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

    // Unload chunks well outside the view radius.
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
  // nearest column whose surface sits above sea level, so the player doesn't
  // start submerged. Falls back to the centre column if everything is ocean.
  findSpawn(cx = 0, cz = 0, radius = 48) {
    for (let r = 0; r <= radius; r++) {
      for (let dz = -r; dz <= r; dz++) {
        for (let dx = -r; dx <= r; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue; // ring edge only
          const x = cx + dx, z = cz + dz;
          const h = this.columnHeight(x, z);
          if (h > SEA_LEVEL) return { x, z, h };
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
