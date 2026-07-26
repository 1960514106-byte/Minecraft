// =============================================================================
// structures.js — Deterministic world structures: villages, dungeons and
// abandoned mineshafts (plus nether fortresses for the nether dimension).
//
// Every structure layout is a PURE FUNCTION of the world seed, so each chunk
// independently computes which structure voxels fall inside it during
// generation — no cross-chunk ordering problems, no pending queues. Voxels are
// written with chunk.setBlockLocal (never world.setBlock, which would pollute
// the player-edit diff).
//
// Loot chests / mob spawners register their positions in world.structureLoot /
// world.structureSpawners side maps (deterministic, rebuilt on regeneration,
// not saved). main.js fills a chest from its loot table on first open; mobs.js
// runs the spawners.
// =============================================================================

import {
  CHUNK_SIZE, CHUNK_HEIGHT, SEA_LEVEL, BLOCK, ITEM, BIOME, WORLD_SEED,
} from './config.js';

const VILLAGE_CELL = 8;   // village grid, in chunks
const MINE_CELL = 6;      // mineshaft grid, in chunks
const floorDiv = (a, b) => Math.floor(a / b);

// ---- Loot tables -------------------------------------------------------------
// rollLoot returns a sparse 27-slot chest array. `h` is a deterministic 0..1
// hash stream seeded per chest (call it repeatedly via the closure).
const LOOT_TABLES = {
  village: [
    { id: ITEM.BREAD, min: 1, max: 3, chance: 0.9 },
    { id: ITEM.WHEAT_SEEDS, min: 2, max: 5, chance: 0.8 },
    { id: ITEM.LEATHER, min: 1, max: 2, chance: 0.5 },
    { id: ITEM.IRON_INGOT, min: 1, max: 2, chance: 0.4 },
    { id: ITEM.APPLE, min: 1, max: 3, chance: 0.6 },
    { id: ITEM.CARROT, min: 1, max: 3, chance: 0.4 },
    { id: ITEM.RAW_FISH, min: 1, max: 2, chance: 0.35 },
    { id: ITEM.SADDLE, min: 1, max: 1, chance: 0.1 },
    // Phase 8: emeralds seed the villager trading economy.
    { id: ITEM.EMERALD, min: 1, max: 3, chance: 0.4 },
  ],
  // Phase 8: the blacksmith forge chest (iron/emerald flavoured).
  blacksmith: [
    { id: ITEM.IRON_INGOT, min: 2, max: 5, chance: 0.8 },
    { id: ITEM.EMERALD, min: 1, max: 3, chance: 0.6 },
    { id: ITEM.COAL, min: 3, max: 7, chance: 0.6 },
    { id: ITEM.IRON_PICKAXE, min: 1, max: 1, chance: 0.25 },
    { id: ITEM.IRON_SWORD, min: 1, max: 1, chance: 0.2 },
    { id: ITEM.BREAD, min: 1, max: 2, chance: 0.4 },
    { id: ITEM.DIAMOND, min: 1, max: 1, chance: 0.08 },
  ],
  dungeon: [
    { id: ITEM.IRON_INGOT, min: 1, max: 3, chance: 0.7 },
    { id: ITEM.REDSTONE, min: 2, max: 5, chance: 0.6 },
    { id: ITEM.APPLE, min: 1, max: 2, chance: 0.5 },
    { id: ITEM.ARROW, min: 3, max: 8, chance: 0.6 },
    { id: ITEM.BONE, min: 1, max: 3, chance: 0.5 },
    { id: ITEM.DIAMOND, min: 1, max: 1, chance: 0.15 },
    { id: ITEM.GOLDEN_APPLE, min: 1, max: 1, chance: 0.06 },
    { id: ITEM.STRING, min: 1, max: 3, chance: 0.4 },
    { id: ITEM.SADDLE, min: 1, max: 1, chance: 0.25 },
  ],
  mineshaft: [
    { id: BLOCK.RAIL, min: 2, max: 6, chance: 0.7 },
    { id: ITEM.COAL, min: 2, max: 6, chance: 0.7 },
    { id: ITEM.IRON_INGOT, min: 1, max: 3, chance: 0.5 },
    { id: ITEM.GOLD_INGOT, min: 1, max: 2, chance: 0.3 },
    { id: ITEM.WHEAT_SEEDS, min: 1, max: 4, chance: 0.4 },
    { id: ITEM.BREAD, min: 1, max: 2, chance: 0.4 },
    { id: ITEM.REDSTONE, min: 1, max: 4, chance: 0.3 },
  ],
  // Phase 9: the stronghold library/storage chests (no books item exists —
  // lapis stands in as the scholarly loot, documented).
  stronghold: [
    { id: ITEM.ENDER_PEARL, min: 1, max: 2, chance: 0.5 },
    { id: ITEM.EMERALD, min: 1, max: 3, chance: 0.5 },
    { id: ITEM.IRON_INGOT, min: 1, max: 4, chance: 0.7 },
    { id: ITEM.LAPIS, min: 2, max: 5, chance: 0.5 },
    { id: ITEM.BREAD, min: 1, max: 3, chance: 0.6 },
    { id: ITEM.APPLE, min: 1, max: 2, chance: 0.4 },
    { id: ITEM.REDSTONE, min: 2, max: 5, chance: 0.3 },
    { id: ITEM.DIAMOND, min: 1, max: 2, chance: 0.12 },
  ],
  fortress: [
    { id: ITEM.GOLD_INGOT, min: 2, max: 4, chance: 0.7 },
    { id: BLOCK.NETHER_BRICK, min: 2, max: 6, chance: 0.6 },
    { id: ITEM.GLOWSTONE_DUST, min: 2, max: 5, chance: 0.6 },
    { id: ITEM.GOLDEN_APPLE, min: 1, max: 1, chance: 0.12 },
    { id: ITEM.DIAMOND, min: 1, max: 2, chance: 0.2 },
    // Phase 7: nether wart seeds the brewing loop (also grows in the
    // fortress's soul-sand patch).
    { id: ITEM.NETHER_WART, min: 1, max: 3, chance: 0.6 },
  ],
};

// Fill a 27-slot chest array from a loot table, deterministically from a seed
// hash function. Used by main.js when a generated chest is first opened.
export function rollLoot(kind, hashStream) {
  const table = LOOT_TABLES[kind] || LOOT_TABLES.dungeon;
  const slots = new Array(27).fill(null);
  for (const entry of table) {
    if (hashStream() >= entry.chance) continue;
    const count = entry.min + Math.floor(hashStream() * (entry.max - entry.min + 1));
    let slot = Math.floor(hashStream() * 27);
    for (let tries = 0; tries < 27 && slots[slot]; tries++) slot = (slot + 7) % 27;
    if (!slots[slot]) slots[slot] = { id: entry.id, count };
  }
  return slots;
}

// =============================================================================
// Entry point, called from World.generateChunk after terrain + decorations.
// =============================================================================
export function decorateStructures(world, chunk) {
  if (world.skyless) {
    generateFortressPart(world, chunk);
    return;
  }
  generateVillagePart(world, chunk);
  generateDungeon(world, chunk);
  generateMineshaftPart(world, chunk);
  generateStrongholdPart(world, chunk); // last, so it wins inside its bounds
}

// Write a voxel in world coords IF it falls inside this chunk. `meta` writes
// per-voxel metadata (Phase 9: pre-eyed end portal frames).
function makePut(chunk) {
  const ox = chunk.cx * CHUNK_SIZE;
  const oz = chunk.cz * CHUNK_SIZE;
  return (wx, wy, wz, id, airOnly = false, meta = 0) => {
    const lx = wx - ox, lz = wz - oz;
    if (lx < 0 || lx >= CHUNK_SIZE || lz < 0 || lz >= CHUNK_SIZE) return;
    if (wy < 1 || wy >= CHUNK_HEIGHT) return;
    if (airOnly && chunk.getBlockLocal(lx, wy, lz) !== BLOCK.AIR) return;
    chunk.setBlockLocal(lx, wy, lz, id);
    if (meta) chunk.setMetaLocal(lx, wy, lz, meta);
  };
}

// =============================================================================
// Villages
// =============================================================================

// Deterministic village layout for a village grid cell, or null.
// Layout = { wx, wz (world block centre), buildings: [{x, z, kind, h, i}] }.
// Exported so the smoke suite can assert determinism against a mock world.
// Phase 8: houses roll a per-slot variant (plain house / library / blacksmith
// forge / church tower) from an independent hash, keeping the original
// house/farm/well/lamp mix probabilities intact.
export function villageLayout(world, cellX, cellZ) {
  if (world.hash01_3(cellX, 7, cellZ, 1001) >= 0.18) return null;
  // Centre chunk inside the cell, away from the cell border.
  const ccx = cellX * VILLAGE_CELL + 2 + Math.floor(world.hash01_3(cellX, 8, cellZ, 1002) * (VILLAGE_CELL - 4));
  const ccz = cellZ * VILLAGE_CELL + 2 + Math.floor(world.hash01_3(cellX, 9, cellZ, 1003) * (VILLAGE_CELL - 4));
  const wx = ccx * CHUNK_SIZE + 8;
  const wz = ccz * CHUNK_SIZE + 8;
  const centerH = world.columnHeight(wx, wz);
  if (centerH <= SEA_LEVEL + 1) return null;
  const biome = world.biomeAt(wx, wz);
  if (biome === BIOME.DESERT || biome === BIOME.MUSHROOM) return null;

  const n = 4 + Math.floor(world.hash01_3(cellX, 10, cellZ, 1004) * 4); // 4..7
  const buildings = [];
  for (let i = 0; i < n; i++) {
    const ang = (i / n) * Math.PI * 2 + world.hash01_3(cellX, 20 + i, cellZ, 1005) * 0.8;
    const dist = 9 + world.hash01_3(cellX, 40 + i, cellZ, 1006) * 12;
    const bx = Math.round(wx + Math.cos(ang) * dist);
    const bz = Math.round(wz + Math.sin(ang) * dist);
    const h = world.columnHeight(bx, bz);
    if (h <= SEA_LEVEL) continue;
    const r = world.hash01_3(cellX, 60 + i, cellZ, 1007);
    let kind = r < 0.5 ? 'house' : r < 0.7 ? 'farm' : r < 0.85 ? 'well' : 'lamp';
    if (kind === 'house') {
      // Per-slot building variant, hashed independently of the kind roll.
      const v = world.hash01_3(cellX, 140 + i, cellZ, 1041);
      kind = v < 0.45 ? 'house' : v < 0.65 ? 'library' : v < 0.85 ? 'blacksmith' : 'church';
    }
    buildings.push({ x: bx, z: bz, h, kind, i });
  }
  if (!buildings.length) return null;
  return { wx, wz, centerH, buildings, cellX, cellZ };
}

function generateVillagePart(world, chunk) {
  const put = makePut(chunk);
  const ox = chunk.cx * CHUNK_SIZE, oz = chunk.cz * CHUNK_SIZE;
  // A village can reach ~24 blocks from its centre chunk; check the 3x3 cells.
  const cell0X = floorDiv(chunk.cx, VILLAGE_CELL);
  const cell0Z = floorDiv(chunk.cz, VILLAGE_CELL);
  for (let dz = -1; dz <= 1; dz++) {
    for (let dx = -1; dx <= 1; dx++) {
      const layout = villageLayout(world, cell0X + dx, cell0Z + dz);
      if (!layout) continue;
      // Quick reject: does any part plausibly reach this chunk?
      const reach = 30;
      if (Math.abs(layout.wx - (ox + 8)) > reach + 8 || Math.abs(layout.wz - (oz + 8)) > reach + 8) continue;

      // Phase 8: register the village centre (side table like structureLoot,
      // rebuilt on generation, never saved). mobs.js reads it for villager
      // spawn bias, golem guardians and night sieges.
      if (world.villageCenters) {
        world.villageCenters.set(`${layout.wx},${layout.wz}`,
          { x: layout.wx, y: layout.centerH, z: layout.wz });
      }
      // Gravel paths from the centre to each building.
      for (const b of layout.buildings) {
        drawPath(world, put, layout.wx, layout.wz, b.x, b.z);
      }
      // The village well marks the centre.
      buildWell(world, put, layout.wx, layout.centerH, layout.wz);
      // A clear 3x3 gravel apron beside the well: the golem muster spot.
      for (let dx = 2; dx <= 4; dx++) {
        for (let dz = -1; dz <= 1; dz++) {
          const ah = world.columnHeight(layout.wx + dx, layout.wz + dz);
          if (ah <= SEA_LEVEL) continue;
          put(layout.wx + dx, ah, layout.wz + dz, BLOCK.GRAVEL);
          for (let dy = 1; dy <= 2; dy++) put(layout.wx + dx, ah + dy, layout.wz + dz, BLOCK.AIR);
        }
      }
      for (const b of layout.buildings) {
        if (b.kind === 'house') buildHouse(world, put, b, layout);
        else if (b.kind === 'library') buildLibrary(world, put, b, layout);
        else if (b.kind === 'blacksmith') buildBlacksmith(world, put, b, layout);
        else if (b.kind === 'church') buildChurch(world, put, b, layout);
        else if (b.kind === 'farm') buildFarm(world, put, b, layout);
        else if (b.kind === 'well') buildWell(world, put, b.x, b.h, b.z);
        else buildLamp(world, put, b.x, b.h, b.z);
      }
    }
  }
}

function drawPath(world, put, x0, z0, x1, z1) {
  const steps = Math.max(Math.abs(x1 - x0), Math.abs(z1 - z0));
  for (let s = 0; s <= steps; s++) {
    const px = Math.round(x0 + ((x1 - x0) * s) / steps);
    const pz = Math.round(z0 + ((z1 - z0) * s) / steps);
    const h = world.columnHeight(px, pz);
    if (h > SEA_LEVEL) put(px, h, pz, BLOCK.GRAVEL);
  }
}

// Shared 7x5 building shell: cobblestone foundation + lower wall course, an
// upper wall course of `upperWall`, glass windows, flat roof and a door facing
// the village centre. Returns { doorDx, doorDz } so callers can keep the
// doorway interior cell clear when furnishing.
function buildingShell(world, put, b, layout, upperWall = BLOCK.PLANK) {
  const { x, z, h } = b;
  // Door faces the village centre.
  const doorDx = Math.abs(layout.wx - x) >= Math.abs(layout.wz - z) ? (Math.sign(layout.wx - x) || 1) : 0;
  const doorDz = doorDx === 0 ? (Math.sign(layout.wz - z) || 1) : 0;
  for (let dx = -3; dx <= 3; dx++) {
    for (let dz = -2; dz <= 2; dz++) {
      // Foundation fills dips under the house; plank floor at ground level.
      for (let fy = h - 2; fy < h; fy++) put(x + dx, fy, z + dz, BLOCK.COBBLESTONE);
      put(x + dx, h, z + dz, BLOCK.PLANK);
      const wall = Math.abs(dx) === 3 || Math.abs(dz) === 2;
      const isDoor = (doorDx !== 0 && dx === doorDx * 3 && dz === 0) ||
                     (doorDz !== 0 && dz === doorDz * 2 && dx === 0);
      const isWindow = !isDoor && ((Math.abs(dx) === 3 && Math.abs(dz) === 1) || (Math.abs(dz) === 2 && Math.abs(dx) === 2));
      for (let dy = 1; dy <= 3; dy++) {
        const wy = h + dy;
        if (!wall) { put(x + dx, wy, z + dz, BLOCK.AIR); continue; }
        if (isDoor && dy <= 2) put(x + dx, wy, z + dz, BLOCK.AIR);
        else if (isWindow && dy === 2) put(x + dx, wy, z + dz, BLOCK.GLASS);
        else put(x + dx, wy, z + dz, dy === 1 ? BLOCK.COBBLESTONE : upperWall);
      }
      put(x + dx, h + 4, z + dz, BLOCK.PLANK); // flat roof
    }
  }
  put(x - 1, h + 1, z - 1, BLOCK.TORCH, true);
  return { doorDx, doorDz };
}

function buildHouse(world, put, b, layout) {
  const { x, z, h } = b;
  buildingShell(world, put, b, layout, BLOCK.PLANK);
  // One deterministic house per village carries the loot chest.
  if (b.i === 0) {
    put(x + 2, h + 1, z + 1, BLOCK.CHEST);
    world.structureLoot.set(`${x + 2},${h + 1},${z + 1}`, 'village');
  }
}

// Phase 8: library — plank shell lined with bookshelf columns on the two
// short interior walls (skipping the doorway's interior cell).
function buildLibrary(world, put, b, layout) {
  const { x, z, h } = b;
  const { doorDx } = buildingShell(world, put, b, layout, BLOCK.PLANK);
  for (const dx of [-2, 2]) {
    if (doorDx !== 0 && dx === doorDx * 2) continue; // keep the doorway clear
    for (let dz = -1; dz <= 1; dz++) {
      for (let dy = 1; dy <= 2; dy++) put(x + dx, h + dy, z + dz, BLOCK.BOOKSHELF);
    }
  }
  if (b.i === 0) {
    put(x, h + 1, z + 1, BLOCK.CHEST);
    world.structureLoot.set(`${x},${h + 1},${z + 1}`, 'village');
  }
}

// Phase 8: blacksmith forge — cobblestone shell with a furnace, an anvil and
// its own iron/emerald loot chest (every forge carries one).
function buildBlacksmith(world, put, b, layout) {
  const { x, z, h } = b;
  const { doorDx, doorDz } = buildingShell(world, put, b, layout, BLOCK.COBBLESTONE);
  // Furnishings hug the wall opposite the door so the entrance stays clear.
  const fx = doorDx !== 0 ? -doorDx * 2 : 2;
  const fz = doorDz !== 0 ? -doorDz : 1;
  put(x + fx, h + 1, z - fz, BLOCK.FURNACE);
  put(x + fx, h + 1, z + fz, BLOCK.ANVIL);
  put(x - fx, h + 1, z + fz, BLOCK.CHEST);
  world.structureLoot.set(`${x - fx},${h + 1},${z + fz}`, 'blacksmith');
}

// Phase 8: church — a 5x5 cobblestone tower (cleric's haunt), taller than the
// houses, with glass windows, an open doorway and a torch-lit top.
function buildChurch(world, put, b, layout) {
  const { x, z, h } = b;
  const doorDx = Math.abs(layout.wx - x) >= Math.abs(layout.wz - z) ? (Math.sign(layout.wx - x) || 1) : 0;
  const doorDz = doorDx === 0 ? (Math.sign(layout.wz - z) || 1) : 0;
  const TOWER_H = 7;
  for (let dx = -2; dx <= 2; dx++) {
    for (let dz = -2; dz <= 2; dz++) {
      for (let fy = h - 2; fy < h; fy++) put(x + dx, fy, z + dz, BLOCK.COBBLESTONE);
      put(x + dx, h, z + dz, BLOCK.COBBLESTONE); // floor
      const wall = Math.abs(dx) === 2 || Math.abs(dz) === 2;
      const isDoor = (doorDx !== 0 && dx === doorDx * 2 && dz === 0) ||
                     (doorDz !== 0 && dz === doorDz * 2 && dx === 0);
      const isWindow = !isDoor && wall && (dx === 0 || dz === 0);
      for (let dy = 1; dy <= TOWER_H - 1; dy++) {
        const wy = h + dy;
        if (!wall) { put(x + dx, wy, z + dz, BLOCK.AIR); continue; }
        if (isDoor && dy <= 2) put(x + dx, wy, z + dz, BLOCK.AIR);
        else if (isWindow && (dy === 2 || dy === 5)) put(x + dx, wy, z + dz, BLOCK.GLASS);
        else put(x + dx, wy, z + dz, BLOCK.COBBLESTONE);
      }
      put(x + dx, h + TOWER_H, z + dz, BLOCK.COBBLESTONE); // roof
    }
  }
  // Torches on the roof corners light the village at night.
  for (const [px, pz] of [[-2, -2], [2, -2], [-2, 2], [2, 2]]) {
    put(x + px, h + TOWER_H + 1, z + pz, BLOCK.TORCH, true);
  }
  put(x, h + 1, z, BLOCK.TORCH, true); // altar torch inside
}

function buildFarm(world, put, b) {
  const { x, z, h } = b;
  // Phase 8: ~40% of farms grow carrots instead of wheat (per-farm hash).
  const carrots = world.hash01_3(x, 3, z, 1042) < 0.4;
  for (let dx = -2; dx <= 2; dx++) {
    for (let dz = -2; dz <= 2; dz++) {
      const edge = Math.abs(dx) === 2 || Math.abs(dz) === 2;
      put(x + dx, h, z + dz, edge ? BLOCK.WOOD : (dx === 0 ? BLOCK.WATER : BLOCK.FARMLAND));
      if (!edge && dx !== 0) {
        const stage = world.hash01_3(x + dx, h, z + dz, 1011);
        if (carrots) {
          put(x + dx, h + 1, z + dz, stage < 0.4 ? BLOCK.CARROT_1 : BLOCK.CARROT_2);
        } else {
          put(x + dx, h + 1, z + dz, stage < 0.4 ? BLOCK.WHEAT_1 : stage < 0.75 ? BLOCK.WHEAT_2 : BLOCK.WHEAT_3);
        }
      }
    }
  }
}

function buildWell(world, put, x, h, z) {
  for (let dx = -1; dx <= 1; dx++) {
    for (let dz = -1; dz <= 1; dz++) {
      put(x + dx, h, z + dz, BLOCK.COBBLESTONE);
      if (dx === 0 && dz === 0) {
        put(x, h, z, BLOCK.WATER);
        for (let dy = 1; dy <= 2; dy++) put(x, h - dy, z, BLOCK.WATER);
      }
    }
  }
  // Corner posts + roof slab
  for (const [px, pz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    put(x + px, h + 1, z + pz, BLOCK.FENCE);
    put(x + px, h + 2, z + pz, BLOCK.FENCE);
  }
  for (let dx = -1; dx <= 1; dx++) {
    for (let dz = -1; dz <= 1; dz++) put(x + dx, h + 3, z + dz, BLOCK.PLANK);
  }
}

function buildLamp(world, put, x, h, z) {
  put(x, h + 1, z, BLOCK.FENCE);
  put(x, h + 2, z, BLOCK.FENCE);
  put(x, h + 3, z, BLOCK.TORCH);
}

// =============================================================================
// Dungeons — small buried cobblestone rooms with a spawner and loot.
// =============================================================================
function generateDungeon(world, chunk) {
  if (world.hash01_3(chunk.cx, 13, chunk.cz, 1013) >= 0.012) return;
  const put = makePut(chunk);
  const wx = chunk.cx * CHUNK_SIZE + 8;
  const wz = chunk.cz * CHUNK_SIZE + 8;
  const surface = world.columnHeight(wx, wz);
  const roomY = 8 + Math.floor(world.hash01_3(chunk.cx, 14, chunk.cz, 1014) * 10);
  if (surface <= roomY + 8) return; // must be well underground

  for (let dx = -4; dx <= 4; dx++) {
    for (let dz = -4; dz <= 4; dz++) {
      for (let dy = 0; dy <= 4; dy++) {
        const shell = Math.abs(dx) === 4 || Math.abs(dz) === 4 || dy === 0 || dy === 4;
        if (shell) {
          const mossy = world.hash01_3(wx + dx, roomY + dy, wz + dz, 1015) < 0.35;
          put(wx + dx, roomY + dy, wz + dz, mossy ? BLOCK.MOSSY_STONE : BLOCK.COBBLESTONE);
        } else {
          put(wx + dx, roomY + dy, wz + dz, BLOCK.AIR);
        }
      }
    }
  }
  // Spawner in the middle.
  put(wx, roomY + 1, wz, BLOCK.MOB_SPAWNER);
  const mobType = world.hash01_3(chunk.cx, 15, chunk.cz, 1016) < 0.5 ? 'zombie' : 'skeleton';
  world.structureSpawners.set(`${wx},${roomY + 1},${wz}`, mobType);
  // One or two loot chests against the walls.
  put(wx - 3, roomY + 1, wz - 3, BLOCK.CHEST);
  world.structureLoot.set(`${wx - 3},${roomY + 1},${wz - 3}`, 'dungeon');
  if (world.hash01_3(chunk.cx, 16, chunk.cz, 1017) < 0.4) {
    put(wx + 3, roomY + 1, wz + 3, BLOCK.CHEST);
    world.structureLoot.set(`${wx + 3},${roomY + 1},${wz + 3}`, 'dungeon');
  }
}

// =============================================================================
// Abandoned mineshafts — corridor networks crossing many chunks.
// =============================================================================

// Corridors for a mineshaft cell: [{axis, t, s0, s1, y}]. Pure per-cell.
function mineshaftCorridors(world, cellX, cellZ) {
  if (world.hash01_3(cellX, 17, cellZ, 1019) >= 0.25) return null;
  const cellBlocks = MINE_CELL * CHUNK_SIZE;
  const originX = cellX * cellBlocks;
  const originZ = cellZ * cellBlocks;
  const count = 3 + Math.floor(world.hash01_3(cellX, 18, cellZ, 1020) * 3);
  const corridors = [];
  for (let i = 0; i < count; i++) {
    const axis = world.hash01_3(cellX, 30 + i, cellZ, 1021) < 0.5 ? 'x' : 'z';
    const y = 11 + Math.floor(world.hash01_3(cellX, 50 + i, cellZ, 1022) * 6);
    const t = (axis === 'x' ? originZ : originX) + 4 + Math.floor(world.hash01_3(cellX, 70 + i, cellZ, 1023) * (cellBlocks - 8));
    const s0 = (axis === 'x' ? originX : originZ) + Math.floor(world.hash01_3(cellX, 90 + i, cellZ, 1024) * 40);
    const len = 40 + Math.floor(world.hash01_3(cellX, 110 + i, cellZ, 1025) * 50);
    corridors.push({ axis, t, s0, s1: s0 + len, y });
  }
  return corridors;
}

function generateMineshaftPart(world, chunk) {
  const put = makePut(chunk);
  const ox = chunk.cx * CHUNK_SIZE, oz = chunk.cz * CHUNK_SIZE;
  const cell0X = floorDiv(chunk.cx, MINE_CELL);
  const cell0Z = floorDiv(chunk.cz, MINE_CELL);
  for (let dz = -1; dz <= 1; dz++) {
    for (let dx = -1; dx <= 1; dx++) {
      const corridors = mineshaftCorridors(world, cell0X + dx, cell0Z + dz);
      if (!corridors) continue;
      for (const c of corridors) {
        carveCorridorPart(world, put, chunk, c, ox, oz);
      }
    }
  }
}

function carveCorridorPart(world, put, chunk, c, ox, oz) {
  // Iterate the corridor cells that fall inside this chunk.
  for (let s = Math.max(c.s0, c.axis === 'x' ? ox : oz);
       s <= Math.min(c.s1, (c.axis === 'x' ? ox : oz) + CHUNK_SIZE - 1); s++) {
    for (let w = 0; w < 3; w++) {
      const wx = c.axis === 'x' ? s : c.t + w;
      const wz = c.axis === 'x' ? c.t + w : s;
      if (wx < ox || wx >= ox + CHUNK_SIZE || wz < oz || wz >= oz + CHUNK_SIZE) continue;
      const surface = world.columnHeight(wx, wz);
      if (surface <= c.y + 4) continue; // don't carve through the surface

      const frame = s % 4 === 0;
      // Carve the 3-high corridor.
      for (let dy = 0; dy <= 2; dy++) {
        if (frame && w !== 1 && dy <= 1) {
          put(wx, c.y + dy, wz, BLOCK.FENCE);          // support posts
        } else if (frame && dy === 2) {
          put(wx, c.y + dy, wz, BLOCK.PLANK);          // top beam
        } else {
          put(wx, c.y + dy, wz, BLOCK.AIR);
        }
      }
      // Plank floor bridges any cave gap below.
      put(wx, c.y - 1, wz, BLOCK.PLANK);
      // Rails down the middle.
      if (w === 1 && !frame && world.hash01_3(wx, c.y, wz, 1027) < 0.55) {
        put(wx, c.y, wz, BLOCK.RAIL);
      }
      // Occasional torch on a side wall cell.
      if (w === 0 && world.hash01_3(wx, c.y + 1, wz, 1028) < 0.04) {
        put(wx, c.y + 1, wz, BLOCK.TORCH, true);
      }
      // Rare loot chest beside the track.
      if (w === 2 && world.hash01_3(wx, c.y, wz, 1029) < 0.012) {
        put(wx, c.y, wz, BLOCK.CHEST);
        world.structureLoot.set(`${wx},${c.y},${wz}`, 'mineshaft');
      }
    }
  }
}

// =============================================================================
// Nether fortresses — brick platforms with blaze-imp spawners and loot.
// =============================================================================
function generateFortressPart(world, chunk) {
  // Fortress cell grid, sparser than villages.
  const cell0X = floorDiv(chunk.cx, VILLAGE_CELL);
  const cell0Z = floorDiv(chunk.cz, VILLAGE_CELL);
  const put = makePut(chunk);
  for (let dz = -1; dz <= 1; dz++) {
    for (let dx = -1; dx <= 1; dx++) {
      const cellX = cell0X + dx, cellZ = cell0Z + dz;
      if (world.hash01_3(cellX, 19, cellZ, 1033) >= 0.22) continue;
      const fcx = cellX * VILLAGE_CELL + 2 + Math.floor(world.hash01_3(cellX, 21, cellZ, 1034) * (VILLAGE_CELL - 4));
      const fcz = cellZ * VILLAGE_CELL + 2 + Math.floor(world.hash01_3(cellX, 22, cellZ, 1035) * (VILLAGE_CELL - 4));
      const wx = fcx * CHUNK_SIZE + 8;
      const wz = fcz * CHUNK_SIZE + 8;
      const y = 22 + Math.floor(world.hash01_3(cellX, 23, cellZ, 1036) * 8);
      // Platform 13x13 with walls, pillars down to the ground, altar centre.
      for (let bx = -6; bx <= 6; bx++) {
        for (let bz = -6; bz <= 6; bz++) {
          put(wx + bx, y, wz + bz, BLOCK.NETHER_BRICK);
          for (let cy = y + 1; cy <= y + 4; cy++) put(wx + bx, cy, wz + bz, BLOCK.AIR);
          const wall = Math.abs(bx) === 6 || Math.abs(bz) === 6;
          if (wall && (bx + bz) % 2 === 0) put(wx + bx, y + 1, wz + bz, BLOCK.NETHER_BRICK);
        }
      }
      for (const [px, pz] of [[-5, -5], [5, -5], [-5, 5], [5, 5]]) {
        for (let cy = y - 12; cy < y; cy++) put(wx + px, cy, wz + pz, BLOCK.NETHER_BRICK);
        put(wx + px, y + 1, wz + pz, BLOCK.GLOWSTONE);
      }
      // Central altar: the boss summoning point.
      put(wx, y + 1, wz, BLOCK.NETHER_BRICK);
      // Blaze spawner + loot (blazes are the reliable blaze-rod source; fire
      // imps still roam the nether ambiently but drop rods rarely).
      put(wx - 4, y + 1, wz, BLOCK.MOB_SPAWNER);
      world.structureSpawners.set(`${wx - 4},${y + 1},${wz}`, 'blaze');
      put(wx + 4, y + 1, wz, BLOCK.CHEST);
      world.structureLoot.set(`${wx + 4},${y + 1},${wz}`, 'fortress');
      // Phase 7: a small soul-sand garden in one corner of the platform, some
      // cells already sprouting nether wart (deterministic per cell).
      for (const [gx, gz] of [[2, -4], [3, -4], [2, -3], [3, -3]]) {
        put(wx + gx, y, wz + gz, BLOCK.SOUL_SAND);
        const roll = world.hash01_3(wx + gx, y, wz + gz, 1037);
        if (roll < 0.6) {
          put(wx + gx, y + 1, wz + gz, roll < 0.2 ? BLOCK.NETHER_WART_2 : BLOCK.NETHER_WART_1);
        }
      }
    }
  }
}

// =============================================================================
// Phase 9: the stronghold — ONE per world, seed-deterministic, buried at
// y ~10-24. A stone-brick complex: portal room (12-frame end portal ring over
// a support platform, silverfish spawner, lava basin), three corridors and a
// bookshelf-lined library with the loot chest.
// =============================================================================

// Deterministic 0..1 hash of the WORLD SEED alone (no world needed), so the
// Node smoke suite can assert the stronghold position headlessly.
function seedHash01(salt) {
  let h = (Math.imul(WORLD_SEED, 1442695041) ^ Math.imul(salt, 2246822519)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

// The stronghold centre (the portal room's middle column), 600-1100 blocks
// from the origin at a seed-hashed angle. Pure function of WORLD_SEED.
export function strongholdCenter() {
  const ang = seedHash01(9001) * Math.PI * 2;
  const dist = 600 + seedHash01(9002) * 500;
  return { x: Math.round(Math.cos(ang) * dist), z: Math.round(Math.sin(ang) * dist) };
}

// Base (floor-interior) height: buried under the local surface, clamped so the
// complex always fits above bedrock. Deterministic per world (columnHeight is).
export function strongholdBaseY(world) {
  const { x, z } = strongholdCenter();
  return Math.max(8, Math.min(20, world.columnHeight(x, z) - 10));
}

// The 12 frame positions bordering the empty 3x3 portal interior, in ring
// order. Indices 1/5/9 generate with their eye already inserted (meta bit0).
export const END_FRAME_RING = [
  [-1, -2], [0, -2], [1, -2],
  [2, -1], [2, 0], [2, 1],
  [1, 2], [0, 2], [-1, 2],
  [-2, 1], [-2, 0], [-2, -1],
];
const PRE_EYED = new Set([1, 5, 9]);

function generateStrongholdPart(world, chunk) {
  const { x: sx, z: sz } = strongholdCenter();
  const ox = chunk.cx * CHUNK_SIZE, oz = chunk.cz * CHUNK_SIZE;
  // Bounding box: portal room ±6, corridors to ±26, library to z -34.
  if (ox + CHUNK_SIZE <= sx - 30 || ox > sx + 26 || oz + CHUNK_SIZE <= sz - 36 || oz > sz + 8) return;

  const put = makePut(chunk);
  const SY = strongholdBaseY(world); // interior floor level (players stand at SY)
  const brick = (x, y, z) => (world.hash01_3(x, y, z, 3001) < 0.18 ? BLOCK.MOSSY_STONE : BLOCK.STONE_BRICK);

  // Hollow stone-brick room: interior air spans [x0+1..x1-1] x [y0+1..y1-1].
  const room = (x0, y0, z0, x1, y1, z1) => {
    for (let x = x0; x <= x1; x++) {
      for (let z = z0; z <= z1; z++) {
        for (let y = y0; y <= y1; y++) {
          const shell = x === x0 || x === x1 || z === z0 || z === z1 || y === y0 || y === y1;
          put(x, y, z, shell ? brick(x, y, z) : BLOCK.AIR);
        }
      }
    }
  };

  // ---- Portal room: 13x13, interior height 5 --------------------------------------
  room(sx - 6, SY - 1, sz - 6, sx + 6, SY + 5, sz + 6);
  // Raised 5x5 support platform under the ring (top at SY+1).
  for (let dx = -2; dx <= 2; dx++) {
    for (let dz = -2; dz <= 2; dz++) put(sx + dx, SY, sz + dz, BLOCK.STONE_BRICK);
  }
  // The 12-frame ring at SY+1; three frames generate pre-eyed (meta bit0).
  for (let i = 0; i < END_FRAME_RING.length; i++) {
    const [dx, dz] = END_FRAME_RING[i];
    put(sx + dx, SY + 1, sz + dz, BLOCK.END_PORTAL_FRAME, false, PRE_EYED.has(i) ? 1 : 0);
  }
  // Lava basin sunken into the floor beside the platform.
  for (let dz = -1; dz <= 1; dz++) {
    put(sx - 5, SY - 1, sz + dz, BLOCK.LAVA);
    put(sx - 4, SY - 1, sz + dz, BLOCK.LAVA);
  }
  // Silverfish spawner guarding the approach (the door is on +Z).
  put(sx, SY, sz + 4, BLOCK.MOB_SPAWNER);
  world.structureSpawners.set(`${sx},${SY},${sz + 4}`, 'silverfish');
  // Torches so the room reads on arrival.
  put(sx - 5, SY, sz + 5, BLOCK.TORCH);
  put(sx + 5, SY, sz + 5, BLOCK.TORCH);

  // ---- Corridors (3 wide, interior height 3) ---------------------------------------
  // A: north (-Z) from the portal room to the library.
  for (let z = sz - 25; z <= sz - 6; z++) {
    for (let dx = -2; dx <= 2; dx++) {
      for (let y = SY - 1; y <= SY + 3; y++) {
        const shell = Math.abs(dx) === 2 || y === SY - 1 || y === SY + 3;
        put(sx + dx, y, z, shell ? brick(sx + dx, y, z) : BLOCK.AIR);
      }
    }
  }
  // Doorway through the portal room's north wall.
  for (let y = SY; y <= SY + 1; y++) for (let dx = -1; dx <= 1; dx++) put(sx + dx, y, sz - 6, BLOCK.AIR);
  // B: east (+X), dead-ends at a storage alcove with a second chest.
  for (let x = sx + 6; x <= sx + 20; x++) {
    for (let dz = -2; dz <= 2; dz++) {
      for (let y = SY - 1; y <= SY + 3; y++) {
        const shell = Math.abs(dz) === 2 || y === SY - 1 || y === SY + 3 || x === sx + 20;
        put(x, y, sz + dz, shell ? brick(x, y, sz + dz) : BLOCK.AIR);
      }
    }
  }
  for (let y = SY; y <= SY + 1; y++) for (let dz = -1; dz <= 1; dz++) put(sx + 6, y, sz + dz, BLOCK.AIR);
  put(sx + 19, SY, sz, BLOCK.CHEST);
  world.structureLoot.set(`${sx + 19},${SY},${sz}`, 'stronghold');
  // C: west (-X), a short collapsed gallery (flavour).
  for (let x = sx - 16; x <= sx - 6; x++) {
    for (let dz = -2; dz <= 2; dz++) {
      for (let y = SY - 1; y <= SY + 3; y++) {
        const shell = Math.abs(dz) === 2 || y === SY - 1 || y === SY + 3 || x === sx - 16;
        put(x, y, sz + dz, shell ? brick(x, y, sz + dz) : BLOCK.AIR);
      }
    }
  }
  for (let y = SY; y <= SY + 1; y++) for (let dz = -1; dz <= 1; dz++) put(sx - 6, y, sz + dz, BLOCK.AIR);
  // Rubble in the collapsed end.
  put(sx - 15, SY, sz - 1, BLOCK.GRAVEL);
  put(sx - 15, SY, sz, BLOCK.GRAVEL);
  put(sx - 14, SY, sz + 1, BLOCK.COBBLESTONE);

  // ---- Library: 11x9 room at the end of corridor A ----------------------------------
  const lz = sz - 29; // library centre
  room(sx - 5, SY - 1, lz - 4, sx + 5, SY + 4, lz + 4);
  // Doorway from corridor A through the library's south wall.
  for (let y = SY; y <= SY + 1; y++) for (let dx = -1; dx <= 1; dx++) put(sx + dx, y, lz + 4, BLOCK.AIR);
  // Bookshelf stacks along the east/west walls.
  for (let dz = -3; dz <= 3; dz++) {
    for (let y = SY; y <= SY + 2; y++) {
      put(sx - 4, y, lz + dz, BLOCK.BOOKSHELF);
      put(sx + 4, y, lz + dz, BLOCK.BOOKSHELF);
    }
  }
  // A reading table (fence + plank) and the main loot chest.
  put(sx, SY, lz, BLOCK.FENCE);
  put(sx, SY + 1, lz, BLOCK.PLANK);
  put(sx - 2, SY, lz - 3, BLOCK.CHEST);
  world.structureLoot.set(`${sx - 2},${SY},${lz - 3}`, 'stronghold');
  put(sx + 2, SY, lz - 3, BLOCK.TORCH);
}
