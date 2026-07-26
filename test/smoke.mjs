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
  SMELTING, FUEL, DIMENSIONS, blockDrop,
  encodeEdit, decodeEditId, decodeEditMeta,
} from '../Minecraft/js/config.js';
import {
  craftResult, craftCost, SHAPELESS, SHAPED_2, SHAPED_3,
} from '../Minecraft/js/crafting.js';
import { Noise } from '../Minecraft/js/noise.js';
import { migrateSave } from '../Minecraft/js/storage.js';

let failures = 0;
function assert(cond, msg) {
  if (cond) return;
  failures++;
  console.error('FAIL:', msg);
}

// ---- ID spaces ----------------------------------------------------------------
{
  const blockIds = Object.values(BLOCK);
  assert(blockIds.every((id) => Number.isInteger(id) && id >= 0 && id < 78),
    'every BLOCK id is an integer < 78');
  assert(new Set(blockIds).size === blockIds.length, 'BLOCK ids are unique');

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

// ---- Save migration (v7 -> v8) --------------------------------------------------------
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
  assert(m.version === 8, 'migrated save version is 8');
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
  assert(v3.version === 8 && v3.inventory[0].id === 1033, 'v3 save migrates through the chain');

  // A current save passes through unchanged.
  const v8 = migrateSave({ version: 8, seed: 1337, inventory: [{ id: 1033, count: 1 }] });
  assert(v8.version === 8 && v8.inventory[0].id === 1033, 'v8 save is a no-op');
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
