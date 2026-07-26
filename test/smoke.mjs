// =============================================================================
// smoke.mjs — Headless sanity checks for the registry (config.js), recipes
// (crafting.js) and save migration (storage.js). Run from the repo root:
//
//   node test/smoke.mjs
//
// Only modules with no three.js dependency are imported here. columnHeight
// determinism is NOT checked because world.js imports three; it will move to
// this test once terrain generation is extracted into a pure module.
// =============================================================================

import {
  BLOCK, BLOCKS, ITEM, ITEMS, TILES, ATLAS_COLS, ATLAS_ROWS,
  SMELTING, FUEL, DIMENSIONS, blockDrop, blockModel,
  encodeEdit, decodeEditId, decodeEditMeta,
  WOOL_BLOCKS, WOOL_RGB, breakDuration, toolSpeedTier,
  fluidLevel, isFluidFalling, fluidMeta, isFluidSource, fluidMaxLevel,
  itemStackMax, itemMaxDurability, foodValue,
} from '../Minecraft/js/config.js';
import { FluidSim } from '../Minecraft/js/fluids.js';
import {
  craftResult, craftCost, SHAPELESS, SHAPED_2, SHAPED_3,
} from '../Minecraft/js/crafting.js';
import { Noise } from '../Minecraft/js/noise.js';
import { migrateSave } from '../Minecraft/js/storage.js';
import { getMode, setMode, isCreative, setOnModeChange } from '../Minecraft/js/gamemode.js';

let failures = 0;
function assert(cond, msg) {
  if (cond) return;
  failures++;
  console.error('FAIL:', msg);
}

// ---- ID spaces ----------------------------------------------------------------
{
  const blockIds = Object.values(BLOCK);
  assert(blockIds.every((id) => Number.isInteger(id) && id >= 0 && id < 1000),
    'every BLOCK id is an integer < 1000 (item space starts at 1000)');
  assert(new Set(blockIds).size === blockIds.length, 'BLOCK ids are unique');

  // Every non-air block id has a full BLOCKS definition, and vice versa.
  for (const [name, id] of Object.entries(BLOCK)) {
    if (id === BLOCK.AIR) continue;
    assert(BLOCKS[id] && typeof BLOCKS[id].name === 'string',
      `BLOCK.${name} (${id}) has a BLOCKS definition`);
  }
  const blockIdSet = new Set(blockIds);
  for (const id of Object.keys(BLOCKS)) {
    assert(blockIdSet.has(Number(id)), `BLOCKS entry ${id} corresponds to a BLOCK id`);
  }

  const itemIds = Object.values(ITEM);
  assert(itemIds.every((id) => Number.isInteger(id) && id >= 1000),
    'every ITEM id is an integer >= 1000');
  assert(itemIds.every((id) => id <= 4095), 'every ITEM id fits the 12-bit edit encoding');
  assert(new Set(itemIds).size === itemIds.length, 'ITEM ids are unique');

  const blockSet = new Set(blockIds);
  assert(itemIds.every((id) => !blockSet.has(id)), 'BLOCK and ITEM id spaces are disjoint');
}

// Any id that an inventory slot / recipe / drop may legally reference.
const DEFINED = new Set([...Object.values(BLOCK), ...Object.values(ITEM)]);
const defined = (id) => DEFINED.has(id);

// ---- Atlas --------------------------------------------------------------------
{
  const slots = ATLAS_COLS * ATLAS_ROWS;
  const tiles = Object.values(TILES);
  assert(tiles.every((t) => Number.isInteger(t) && t >= 0 && t < slots),
    `every TILES index is inside the ${ATLAS_COLS}x${ATLAS_ROWS} atlas`);
  assert(new Set(tiles).size === tiles.length, 'TILES values are unique');

  for (const [id, def] of Object.entries(BLOCKS)) {
    for (const key of ['top', 'bottom', 'side']) {
      assert(Number.isInteger(def[key]) && def[key] >= 0 && def[key] < slots,
        `BLOCKS[${id}] (${def.name}) ${key} tile inside atlas`);
    }
  }
  for (const [id, def] of Object.entries(ITEMS)) {
    assert(Number.isInteger(def.tile) && def.tile >= 0 && def.tile < slots,
      `ITEMS[${id}] (${def.name}) tile inside atlas`);
  }
}

// ---- Recipes reference only defined ids ----------------------------------------
{
  for (const r of SHAPELESS) {
    assert(defined(r.out.id), `SHAPELESS output ${r.out.id} is defined`);
    for (const k of Object.keys(r.need)) assert(defined(Number(k)), `SHAPELESS need ${k} is defined`);
  }
  for (const [name, list] of [['SHAPED_2', SHAPED_2], ['SHAPED_3', SHAPED_3]]) {
    for (const r of list) {
      assert(defined(r.out.id), `${name} output ${r.out.id} is defined`);
      for (const id of r.shape) {
        if (id != null) assert(defined(id), `${name} shape id ${id} is defined`);
      }
    }
  }
}

// ---- Recipe resolution ----------------------------------------------------------
// Grids are 9-slot arrays; the 2x2 grid uses indices 0,1,3,4 (see activeSlots).
function grid(...entries) {
  const g = new Array(9).fill(null);
  for (const [i, id] of entries) g[i] = { id, count: 1 };
  return g;
}

{
  // 1 wood anywhere in the 2x2 grid -> 4 planks (shapeless).
  for (const i of [0, 1, 3, 4]) {
    const out = craftResult(grid([i, BLOCK.WOOD]), 2);
    assert(out && out.id === BLOCK.PLANK && out.count === 4,
      `1 wood in 2x2 slot ${i} -> 4 planks`);
  }

  // Iron pickaxe laid into the 3x3 grid as written.
  const pick = craftResult(grid(
    [0, ITEM.IRON_INGOT], [1, ITEM.IRON_INGOT], [2, ITEM.IRON_INGOT],
    [4, ITEM.STICK], [7, ITEM.STICK],
  ), 3);
  assert(pick && pick.id === ITEM.IRON_PICKAXE, 'iron pickaxe resolves in 3x3');

  // Iron axe (asymmetric): the hand-written layout AND its horizontal mirror.
  const axe = craftResult(grid(
    [0, ITEM.IRON_INGOT], [1, ITEM.IRON_INGOT],
    [3, ITEM.IRON_INGOT], [4, ITEM.STICK], [7, ITEM.STICK],
  ), 3);
  assert(axe && axe.id === ITEM.IRON_AXE, 'iron axe resolves in 3x3');
  const axeMirror = craftResult(grid(
    [1, ITEM.IRON_INGOT], [2, ITEM.IRON_INGOT],
    [4, ITEM.STICK], [5, ITEM.IRON_INGOT], [7, ITEM.STICK],
  ), 3);
  assert(axeMirror && axeMirror.id === ITEM.IRON_AXE, 'MIRRORED iron axe resolves in 3x3');

  // A 2x2 recipe (wooden pickaxe) parked in the bottom-right corner of the
  // 3x3 crafting-table grid still matches after bounding-box trimming.
  const offset = craftResult(grid(
    [4, BLOCK.PLANK], [5, BLOCK.PLANK],
    [7, ITEM.STICK], [8, ITEM.STICK],
  ), 3);
  assert(offset && offset.id === ITEM.WOODEN_PICKAXE, 'offset 2x2 recipe resolves in 3x3 corner');
  const offsetCost = craftCost(grid(
    [4, BLOCK.PLANK], [5, BLOCK.PLANK],
    [7, ITEM.STICK], [8, ITEM.STICK],
  ), 3);
  assert(offsetCost && offsetCost[BLOCK.PLANK] === 2 && offsetCost[ITEM.STICK] === 2,
    'offset recipe cost counts 2 planks + 2 sticks');

  // A SHAPED_3 recipe with a small bounding box (stone bricks, 2x2 cobble)
  // also matches when shifted away from its written position.
  const bricks = craftResult(grid(
    [4, BLOCK.COBBLESTONE], [5, BLOCK.COBBLESTONE],
    [7, BLOCK.COBBLESTONE], [8, BLOCK.COBBLESTONE],
  ), 3);
  assert(bricks && bricks.id === BLOCK.STONE_BRICK && bricks.count === 4,
    'offset stone-brick recipe resolves in 3x3');

  // Every shaped recipe still resolves to its own output when laid into the
  // grid exactly as written (regression net for the normalisation rewrite).
  for (const r of SHAPED_2) {
    const g = new Array(9).fill(null);
    const map = [0, 1, 3, 4];
    r.shape.forEach((id, i) => { if (id != null) g[map[i]] = { id, count: 1 }; });
    const out = craftResult(g, 2);
    assert(out && out.id === r.out.id && out.count === r.out.count,
      `SHAPED_2 recipe for ${r.out.id} resolves as written`);
  }
  for (const r of SHAPED_3) {
    const g = r.shape.map((id) => (id == null ? null : { id, count: 1 }));
    const out = craftResult(g, 3);
    assert(out && out.id === r.out.id && out.count === r.out.count,
      `SHAPED_3 recipe for ${r.out.id} resolves as written`);
  }
}

// ---- Phase 2: slabs/stairs/wool/gold/sandstone/dye recipes -------------------------
{
  // 3 planks in a row -> 6 oak slabs (top row and, offset, bottom row).
  const slab = craftResult(grid([0, BLOCK.PLANK], [1, BLOCK.PLANK], [2, BLOCK.PLANK]), 3);
  assert(slab && slab.id === BLOCK.OAK_SLAB && slab.count === 6, '3 planks -> 6 oak slabs');
  const slabOffset = craftResult(grid([6, BLOCK.STONE], [7, BLOCK.STONE], [8, BLOCK.STONE]), 3);
  assert(slabOffset && slabOffset.id === BLOCK.STONE_SLAB, 'offset 3 stone -> stone slabs');

  // The 6-block staircase shape -> 4 stairs, and its mirror.
  const stairs = craftResult(grid(
    [0, BLOCK.PLANK],
    [3, BLOCK.PLANK], [4, BLOCK.PLANK],
    [6, BLOCK.PLANK], [7, BLOCK.PLANK], [8, BLOCK.PLANK],
  ), 3);
  assert(stairs && stairs.id === BLOCK.OAK_STAIRS && stairs.count === 4,
    'staircase shape -> 4 oak stairs');
  const stairsMirror = craftResult(grid(
    [2, BLOCK.COBBLESTONE],
    [4, BLOCK.COBBLESTONE], [5, BLOCK.COBBLESTONE],
    [6, BLOCK.COBBLESTONE], [7, BLOCK.COBBLESTONE], [8, BLOCK.COBBLESTONE],
  ), 3);
  assert(stairsMirror && stairsMirror.id === BLOCK.COBBLESTONE_STAIRS,
    'MIRRORED staircase shape -> cobblestone stairs');

  // 2x2 sand -> sandstone.
  const sandstone = craftResult(grid(
    [0, BLOCK.SAND], [1, BLOCK.SAND], [3, BLOCK.SAND], [4, BLOCK.SAND],
  ), 2);
  assert(sandstone && sandstone.id === BLOCK.SANDSTONE, '4 sand (2x2) -> sandstone');

  // Dye + white wool (shapeless, works in the 2x2 grid).
  const redWool = craftResult(grid([0, ITEM.RED_DYE], [1, BLOCK.WOOL_WHITE]), 2);
  assert(redWool && redWool.id === BLOCK.WOOL_RED, 'red dye + white wool -> red wool');

  // Legacy wool item converts to the white wool block.
  const legacy = craftResult(grid([0, ITEM.WOOL]), 2);
  assert(legacy && legacy.id === BLOCK.WOOL_WHITE, 'legacy wool item -> white wool block');

  // Birch wood -> birch planks; golden pickaxe resolves in the 3x3.
  const bplank = craftResult(grid([0, BLOCK.BIRCH_WOOD]), 2);
  assert(bplank && bplank.id === BLOCK.BIRCH_PLANK && bplank.count === 4,
    'birch wood -> 4 birch planks');
  const gpick = craftResult(grid(
    [0, ITEM.GOLD_INGOT], [1, ITEM.GOLD_INGOT], [2, ITEM.GOLD_INGOT],
    [4, ITEM.STICK], [7, ITEM.STICK],
  ), 3);
  assert(gpick && gpick.id === ITEM.GOLDEN_PICKAXE, 'golden pickaxe resolves in 3x3');

  // Cactus smelts into green dye.
  assert(SMELTING[BLOCK.CACTUS] && SMELTING[BLOCK.CACTUS].id === ITEM.GREEN_DYE,
    'cactus smelts to green dye');

  // Wool registry: 16 colours, each a defined block with its own palette entry.
  assert(WOOL_BLOCKS.length === 16, '16 wool colours');
  for (const woolId of WOOL_BLOCKS) {
    assert(BLOCKS[woolId], `wool block ${woolId} defined`);
    assert(Array.isArray(WOOL_RGB[woolId]) && WOOL_RGB[woolId].length === 3,
      `wool block ${woolId} has an RGB palette entry`);
  }

  // Slab/stairs meta survives the edit encoding (facing + upside-down bits).
  for (const meta of [0, 1, 4, 5, 6, 7]) {
    const v = encodeEdit(BLOCK.OAK_STAIRS, meta);
    assert(decodeEditId(v) === BLOCK.OAK_STAIRS && decodeEditMeta(v) === meta,
      `stairs meta ${meta} roundtrips through encodeEdit`);
  }
  const topSlab = encodeEdit(BLOCK.STONE_SLAB, 1);
  assert(decodeEditId(topSlab) === BLOCK.STONE_SLAB && decodeEditMeta(topSlab) === 1,
    'top-slab meta roundtrips');
  assert(blockModel(BLOCK.OAK_SLAB) === 'slab' && blockModel(BLOCK.OAK_STAIRS) === 'stairs',
    'slab/stairs models registered');

  // Gold tools: stone-tier capability, but faster than diamond on the right block.
  assert(toolSpeedTier(ITEM.GOLDEN_PICKAXE) === 6 && toolSpeedTier(ITEM.IRON_PICKAXE) === 3,
    'speedTier override (gold 6, iron falls back to tier)');
  assert(breakDuration(BLOCK.STONE, ITEM.GOLDEN_PICKAXE) < breakDuration(BLOCK.STONE, ITEM.DIAMOND_PICKAXE),
    'golden pickaxe mines stone faster than diamond');
  assert(blockDrop(BLOCK.IRON_ORE, ITEM.GOLDEN_PICKAXE).length > 0,
    'golden pickaxe (tier 2) still harvests iron ore');
}

// ---- Smelting / fuel / drops -----------------------------------------------------
{
  for (const [input, out] of Object.entries(SMELTING)) {
    assert(defined(Number(input)), `SMELTING input ${input} is defined`);
    assert(defined(out.id), `SMELTING output ${out.id} is defined`);
  }
  for (const id of Object.keys(FUEL)) assert(defined(Number(id)), `FUEL id ${id} is defined`);
  for (const id of Object.values(BLOCK)) {
    for (const d of blockDrop(id)) assert(defined(d.id), `blockDrop(${id}) drop ${d.id} is defined`);
    // With a max-tier pickaxe, minTier blocks reveal their real drops too.
    for (const d of blockDrop(id, ITEM.DIAMOND_PICKAXE)) {
      assert(defined(d.id), `blockDrop(${id}, diamond pickaxe) drop ${d.id} is defined`);
    }
  }
}

// ---- Edit encoding roundtrip -------------------------------------------------------
{
  let ok = true;
  for (let id = 0; id <= 4095; id += 37) {           // sampled sweep + endpoints
    for (const meta of [0, 1, 7, 15, 128, 255]) {
      const v = encodeEdit(id, meta);
      if (decodeEditId(v) !== id || decodeEditMeta(v) !== meta) ok = false;
    }
  }
  const vMax = encodeEdit(4095, 255);
  ok = ok && decodeEditId(vMax) === 4095 && decodeEditMeta(vMax) === 255;
  assert(ok, 'edit encode/decode roundtrip (id 0..4095, meta 0..255)');
  // Old saves stored the bare block id: it must decode to itself with meta 0.
  assert(decodeEditId(36) === 36 && decodeEditMeta(36) === 0, 'legacy bare id decodes with meta 0');
}

// ---- Dimensions ---------------------------------------------------------------------
{
  assert(DIMENSIONS.overworld.hasSky === true && DIMENSIONS.overworld.editKeyPrefix === '',
    'overworld descriptor');
  assert(DIMENSIONS.nether.hasSky === false && DIMENSIONS.nether.editKeyPrefix === 'N|',
    'nether descriptor');
  assert(DIMENSIONS.end.hasSky === false && DIMENSIONS.end.editKeyPrefix === 'E|',
    'end descriptor');
}

// ---- Game mode module (three-free) ----------------------------------------------------
{
  assert(getMode() === 'survival', 'default mode is survival');
  assert(isCreative() === false, 'isCreative() false by default');
  let notified = null;
  setOnModeChange((m) => { notified = m; });
  setMode('creative');
  assert(getMode() === 'creative' && isCreative() === true, 'setMode(creative) applies');
  assert(notified === 'creative', 'onChange hook fires with the new mode');
  notified = null;
  setMode('creative');
  assert(notified === null, 'onChange does not fire when the mode is unchanged');
  setMode('nonsense');
  assert(getMode() === 'survival', 'unknown modes fall back to survival');
  setMode('survival');
  setOnModeChange(null);
}

// ---- Save migration (v7 -> v9) --------------------------------------------------------
{
  const v7 = {
    version: 7,
    seed: 1337,
    dimension: 'nether',
    inventory: [{ id: 133, count: 2 }, null, { id: 5, count: 8 }, { id: 102, count: 1, durability: 40 }],
    survival: { health: 20, armor: { head: 121, chest: { id: 124, count: 1 }, legs: null, feet: null } },
    chests: { '1,20,3': [{ id: 100, count: 3 }, null, { id: 36, count: 5 }] },
    furnaces: { 'N|4,20,6': { input: { id: 106, count: 2 }, fuel: { id: 105, count: 1 }, output: { id: 112, count: 1 }, burn: 3, burnMax: 16, cook: 1 } },
    drops: [{ id: 147, count: 1, x: 1, y: 2, z: 3 }],
    otherDimension: { drops: [{ id: 171, count: 1 }], minecarts: [{ x: 0, y: 20, z: 0 }] },
    edits: { '0,0': { '1,20,3': 36 } },
  };
  const m = migrateSave(v7);
  assert(m.version === 10, 'migrated save version is 10 (v7 chains through v8/v9 to v10)');
  assert(m.mode === 'survival', 'migrated pre-v9 save gets mode survival');
  assert(m.inventory[0].id === 1033, 'inventory diamond 133 -> 1033');
  assert(m.inventory[2].id === 5, 'inventory block id 5 untouched');
  assert(m.inventory[3].id === 1002 && m.inventory[3].durability === 40,
    'inventory tool remapped, durability kept');
  assert(m.survival.armor.head === 1021, 'legacy numeric armor id remapped');
  assert(m.survival.armor.chest.id === 1024, 'armor stack id remapped');
  assert(m.chests['1,20,3'][0].id === 1000, 'chest apple 100 -> 1000');
  assert(m.chests['1,20,3'][2].id === 36, 'chest block id untouched');
  const f = m.furnaces['N|4,20,6'];
  assert(f.input.id === 1006 && f.fuel.id === 1005 && f.output.id === 1012,
    'furnace input/fuel/output remapped');
  assert(m.drops[0].id === 1047, 'dropped bone remapped');
  assert(!m.otherDimension && m.parked && m.parked.overworld
    && m.parked.overworld.drops[0].id === 1071,
    'otherDimension folded into parked map with remapped drops');
  assert(m.edits['0,0']['1,20,3'] === 36, 'world edits untouched by migration');

  // Pre-v7 saves (same item ids, fewer fields) run through the same step.
  const v3 = migrateSave({ version: 3, seed: 1337, inventory: [{ id: 133, count: 1 }] });
  assert(v3.version === 10 && v3.inventory[0].id === 1033 && v3.mode === 'survival',
    'v3 save migrates through the whole chain');

  // A v8 save gains the mode field, then the fluids/boats defaults.
  const v8 = migrateSave({ version: 8, seed: 1337, inventory: [{ id: 1033, count: 1 }] });
  assert(v8.version === 10 && v8.inventory[0].id === 1033 && v8.mode === 'survival',
    'v8 save upgrades to v10 with mode survival, ids untouched');

  // v9 -> v10: fluids/boats defaults appear, everything else untouched.
  const v9 = migrateSave({ version: 9, seed: 1337, mode: 'creative', inventory: [{ id: 1033, count: 1 }] });
  assert(v9.version === 10 && v9.mode === 'creative', 'v9 save upgrades to v10 (mode preserved)');
  assert(v9.fluids && Array.isArray(v9.fluids.active) && v9.fluids.active.length === 0,
    'v9 -> v10 adds an empty fluids state');
  assert(Array.isArray(v9.boats) && v9.boats.length === 0, 'v9 -> v10 adds an empty boats list');

  // A current save passes through unchanged (existing fluids/boats preserved).
  const v10 = migrateSave({
    version: 10, seed: 1337, mode: 'creative',
    fluids: { active: ['1,2,3'] }, boats: [{ x: 1, y: 20, z: 3 }],
  });
  assert(v10.version === 10 && v10.fluids.active[0] === '1,2,3' && v10.boats.length === 1,
    'v10 save is a no-op (fluids/boats preserved)');
}

// ---- Phase 3: buckets, boats, fishing, fluids ----------------------------------------------
{
  // Item definitions
  assert(itemStackMax(ITEM.BUCKET) === 16, 'bucket stacks to 16');
  assert(itemStackMax(ITEM.WATER_BUCKET) === 1 && itemStackMax(ITEM.LAVA_BUCKET) === 1,
    'filled buckets do not stack');
  assert(itemStackMax(ITEM.BOAT) === 1, 'boat stacks to 1');
  assert(itemMaxDurability(ITEM.FISHING_ROD) === 64, 'fishing rod durability 64');
  assert(foodValue(ITEM.RAW_FISH) === 2 && foodValue(ITEM.COOKED_FISH) === 6,
    'fish food values (raw 2, cooked 6)');

  // Recipes: bucket V, boat U (all three plank families), fishing rod diagonal.
  const bucket = craftResult(grid(
    [0, ITEM.IRON_INGOT], [2, ITEM.IRON_INGOT], [4, ITEM.IRON_INGOT],
  ), 3);
  assert(bucket && bucket.id === ITEM.BUCKET, '3 iron in a V -> bucket');
  for (const plank of [BLOCK.PLANK, BLOCK.BIRCH_PLANK, BLOCK.SPRUCE_PLANK]) {
    const boat = craftResult(grid(
      [0, plank], [2, plank], [3, plank], [4, plank], [5, plank],
    ), 3);
    assert(boat && boat.id === ITEM.BOAT, `5 planks (${plank}) in a U -> boat`);
  }
  const rod = craftResult(grid(
    [2, ITEM.STICK], [4, ITEM.STICK], [5, ITEM.STRING], [6, ITEM.STICK], [8, ITEM.STRING],
  ), 3);
  assert(rod && rod.id === ITEM.FISHING_ROD, '3 sticks diagonal + 2 string -> fishing rod');

  // Fuel / smelting
  assert(FUEL[ITEM.LAVA_BUCKET] === 100, 'lava bucket burns for 100s');
  assert(SMELTING[ITEM.RAW_FISH] && SMELTING[ITEM.RAW_FISH].id === ITEM.COOKED_FISH,
    'raw fish smelts to cooked fish');

  // Fluid meta helpers
  assert(fluidLevel(0) === 0 && isFluidSource(0), 'meta 0 is a source');
  for (const lvl of [0, 1, 3, 7]) {
    for (const falling of [false, true]) {
      const m = fluidMeta(lvl, falling);
      assert(fluidLevel(m) === lvl && isFluidFalling(m) === falling,
        `fluidMeta(${lvl}, ${falling}) roundtrips`);
    }
  }
  assert(fluidMaxLevel(BLOCK.WATER) === 7 && fluidMaxLevel(BLOCK.LAVA) === 3,
    'water spreads to level 7, lava only to 3');
  // Fluid meta survives the edit encoding.
  const fv = encodeEdit(BLOCK.WATER, fluidMeta(5, true));
  assert(decodeEditId(fv) === BLOCK.WATER && fluidLevel(decodeEditMeta(fv)) === 5 &&
    isFluidFalling(decodeEditMeta(fv)), 'fluid meta roundtrips through encodeEdit');
}

// ---- Phase 3: FluidSim behaviour against a fake world ---------------------------------------
{
  class FakeWorld {
    constructor() { this.map = new Map(); }
    key(x, y, z) { return x + ',' + y + ',' + z; }
    getBlock(x, y, z) { const v = this.map.get(this.key(x, y, z)); return v ? v.id : BLOCK.AIR; }
    getMeta(x, y, z) { const v = this.map.get(this.key(x, y, z)); return v ? v.meta : 0; }
    setBlock(x, y, z, id, meta = 0) { this.map.set(this.key(x, y, z), { id, meta }); }
    setBlocks(list) { for (const e of list) this.setBlock(e.x, e.y, e.z, e.id, e.meta || 0); }
  }
  const run = (sim, seconds) => { for (let i = 0; i < seconds * 5; i++) sim.tick(); };

  // Stone floor at y=9 over a wide area.
  const w = new FakeWorld();
  for (let x = -12; x <= 24; x++) {
    for (let z = -12; z <= 24; z++) w.setBlock(x, 9, z, BLOCK.STONE);
  }
  const sim = new FluidSim(w);

  // 1) A source spreads horizontally with increasing levels, out to 7.
  w.setBlock(0, 10, 0, BLOCK.WATER, 0);
  sim.wake(0, 10, 0);
  run(sim, 6);
  assert(w.getBlock(1, 10, 0) === BLOCK.WATER && fluidLevel(w.getMeta(1, 10, 0)) === 1,
    'water spreads to level 1 next to the source');
  assert(w.getBlock(3, 10, 0) === BLOCK.WATER && fluidLevel(w.getMeta(3, 10, 0)) === 3,
    'water level rises with distance');
  assert(w.getBlock(7, 10, 0) === BLOCK.WATER && fluidLevel(w.getMeta(7, 10, 0)) === 7,
    'water reaches level 7');
  assert(w.getBlock(8, 10, 0) === BLOCK.AIR, 'water stops after 7 blocks');

  // 2) Removing the source dries the flow back up.
  w.setBlock(0, 10, 0, BLOCK.AIR);
  sim.wake(0, 10, 0);
  run(sim, 12);
  assert(w.getBlock(1, 10, 0) === BLOCK.AIR && w.getBlock(5, 10, 0) === BLOCK.AIR,
    'flowing water dries up when the source is removed');

  // 3) Falling column: a source over a hole becomes a falling stream.
  const w2 = new FakeWorld();
  for (let x = -4; x <= 4; x++) for (let z = -4; z <= 4; z++) w2.setBlock(x, 5, z, BLOCK.STONE);
  w2.setBlock(0, 10, 0, BLOCK.WATER, 0);
  const sim2 = new FluidSim(w2);
  sim2.wake(0, 10, 0);
  run(sim2, 6);
  assert(w2.getBlock(0, 9, 0) === BLOCK.WATER && isFluidFalling(w2.getMeta(0, 9, 0)),
    'water falls down as a falling-column cell');
  assert(w2.getBlock(0, 6, 0) === BLOCK.WATER, 'the stream reaches the floor');
  assert(w2.getBlock(1, 6, 0) === BLOCK.WATER && fluidLevel(w2.getMeta(1, 6, 0)) === 2,
    'a landed stream spreads at level 2');

  // 4) Infinite water: an empty cell between two sources becomes a source.
  const w3 = new FakeWorld();
  for (let x = -2; x <= 4; x++) w3.setBlock(x, 9, 0, BLOCK.STONE);
  w3.setBlock(0, 10, 0, BLOCK.WATER, 0);
  w3.setBlock(2, 10, 0, BLOCK.WATER, 0);
  const sim3 = new FluidSim(w3);
  sim3.wake(1, 10, 0);
  run(sim3, 3);
  assert(w3.getBlock(1, 10, 0) === BLOCK.WATER && isFluidSource(w3.getMeta(1, 10, 0)),
    'cell between two sources becomes a new source');

  // 5) Lava + water: source lava hardens to obsidian, flowing lava to cobble.
  const w4 = new FakeWorld();
  for (let x = -2; x <= 8; x++) w4.setBlock(x, 9, 0, BLOCK.STONE);
  w4.setBlock(0, 10, 0, BLOCK.LAVA, 0);                 // source lava
  w4.setBlock(4, 10, 0, BLOCK.LAVA, fluidMeta(2));      // flowing lava
  w4.setBlock(1, 10, 0, BLOCK.WATER, 0);
  w4.setBlock(5, 10, 0, BLOCK.WATER, 0);
  const sim4 = new FluidSim(w4);
  let effects = 0;
  sim4.onEffect = () => effects++;
  sim4.wake(0, 10, 0);
  sim4.wake(4, 10, 0);
  run(sim4, 3);
  assert(w4.getBlock(0, 10, 0) === BLOCK.OBSIDIAN, 'source lava + water -> obsidian');
  assert(w4.getBlock(4, 10, 0) === BLOCK.COBBLESTONE, 'flowing lava + water -> cobblestone');
  assert(effects === 2, 'hardening fires the effect hook');

  // 6) Serialize/restore keeps pending cells.
  const snap = sim4.serialize();
  assert(snap && Array.isArray(snap.active), 'FluidSim serializes to { active: [...] }');
  const sim5 = new FluidSim(w4);
  sim5.restore(snap);
  assert(sim5.active.size === sim4.active.size, 'restore re-wakes the pending cells');
}

// ---- Noise determinism ------------------------------------------------------------------
{
  const a = new Noise(1337);
  const b = new Noise(1337);
  let same = true;
  for (let i = 0; i < 32; i++) {
    const x = i * 13.7, z = i * -7.3;
    if (a.fbm2D(x, z, { frequency: 0.012, octaves: 4 }) !== b.fbm2D(x, z, { frequency: 0.012, octaves: 4 })) {
      same = false;
    }
  }
  assert(same, 'Noise(fbm2D) is deterministic for a fixed seed');
  // columnHeight determinism itself is skipped: world.js imports three.
}

if (failures) {
  console.error(`\nSMOKE FAILED: ${failures} assertion(s) failed`);
  process.exit(1);
} else {
  console.log('SMOKE OK: all assertions passed');
}
