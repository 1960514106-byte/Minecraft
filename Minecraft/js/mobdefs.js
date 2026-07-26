// =============================================================================
// mobdefs.js — The mob registry. One data record per mob type collapses the
// ~11 scattered per-type touch points (HP chain, hostile checks, spawn lists,
// drop switch, speed constants, breeding foods, AI dispatch, mesh dispatch,
// ambient sounds, XP values) into table lookups.
//
// This module is intentionally three-free (it only imports ids from config.js)
// so the Node smoke suite can assert registry integrity headlessly.
//
// Field reference:
//   name      display name
//   hp        max health
//   speed     base movement speed (m/s) used by the type's AI handler
//   hostile   true -> counted against the hostile cap, despawns at dawn, etc.
//   ai        AI_HANDLERS key in mobs.js (must be one of AI_NAMES below)
//   mesh      MESH_BUILDERS key in mobs.js
//   xp        orb value on kill (main.js reads this; config.xpFromKill is the
//             fallback for types missing here)
//   drops     array of { id, prob, min?, max? } rolled independently, or a
//             function (mob) -> such an array
//   spawn     natural-spawn descriptor or null (spawner/summon-only types):
//             { dim: 'overworld'|'nether', time: 'night'|'day'|null,
//               weight, biomes?: [BIOME...], group?: n, kind?: 'wolf'|'water' }
//   sound     ambient sound: { name, range, prob }
//   breedFood item id that puts the animal into love mode
//   melee     { damage, label } for melee AI handlers
//   flies     true -> hovers (no gravity); hover height via `hover`
//   persist   true -> never despawns by distance/dawn
// =============================================================================

import { ITEM, BLOCK, BIOME } from './config.js';

// Every AI handler key implemented by mobs.js. MOB_DEFS entries must use one
// of these; mobs.js asserts at construction that it implements them all.
export const AI_NAMES = [
  'zombie', 'skeleton', 'creeper', 'spider', 'enderman', 'wolf', 'passive',
  'pigman', 'fireImp', 'boss',
  'ghast', 'blaze', 'slime', 'witch', 'golem', 'silverfish', 'squid',
  'dragon', 'crystal',
];

export const MOB_DEFS = {
  // ---- overworld hostiles ----------------------------------------------------
  zombie: {
    name: 'Zombie', hp: 10, speed: 2.15, hostile: true, ai: 'zombie', mesh: 'zombie',
    xp: 5, melee: { damage: 2, label: 'Zombie attack' },
    drops: [
      { id: ITEM.STICK, prob: 0.45, min: 1, max: 2 },
      { id: ITEM.CARROT, prob: 0.2 },
    ],
    spawn: { dim: 'overworld', time: 'night', weight: 1 },
    sound: { name: 'zombieGrunt', range: 16, prob: 1 },
  },
  skeleton: {
    name: 'Skeleton', hp: 10, speed: 1.8, hostile: true, ai: 'skeleton', mesh: 'skeleton',
    xp: 5,
    drops: [
      { id: ITEM.BONE, prob: 0.7, min: 1, max: 2 },
      { id: ITEM.ARROW, prob: 0.5, min: 1, max: 2 },
    ],
    spawn: { dim: 'overworld', time: 'night', weight: 1 },
    sound: { name: 'skeletonRattle', range: 16, prob: 1 },
    shootRange: 14, shootInterval: 2.2,
  },
  creeper: {
    name: 'Creeper', hp: 10, speed: 2.5, hostile: true, ai: 'creeper', mesh: 'creeper',
    xp: 5,
    drops: [{ id: ITEM.GUNPOWDER, prob: 0.7, min: 1, max: 2 }],
    spawn: { dim: 'overworld', time: 'night', weight: 1 },
    sound: { name: 'creeperHiss', range: 8, prob: 1 },
  },
  spider: {
    name: 'Spider', hp: 14, speed: 2.6, hostile: true, ai: 'spider', mesh: 'spider',
    xp: 5, melee: { damage: 3, label: 'Spider bite' }, maxStep: 3.2,
    drops: [
      { id: ITEM.STRING, prob: 1, min: 1, max: 2 },
      { id: ITEM.SPIDER_EYE, prob: 0.3 },
    ],
    spawn: { dim: 'overworld', time: 'night', weight: 1 },
  },
  enderman: {
    name: 'Enderman', hp: 40, speed: 3.2, hostile: true, ai: 'enderman', mesh: 'enderman',
    xp: 8, melee: { damage: 4, label: 'Enderman strike' },
    drops: [{ id: ITEM.ENDER_PEARL, prob: 0.7, min: 1, max: 2 }],
    // ~10% of night picks used to be endermen (w / (w + 4) = 0.1). Phase 9:
    // they also dominate the End (the only natural spawn there) — `spawn` can
    // be a LIST of descriptors, one per dimension.
    spawn: [
      { dim: 'overworld', time: 'night', weight: 0.44 },
      { dim: 'end', time: null, weight: 1 },
    ],
  },
  witch: {
    name: 'Witch', hp: 26, speed: 1.9, hostile: true, ai: 'witch', mesh: 'witch',
    xp: 5,
    drops: [
      { id: ITEM.REDSTONE, prob: 0.4, min: 1, max: 2 },
      { id: ITEM.GLOWSTONE_DUST, prob: 0.3, min: 1, max: 2 },
      { id: ITEM.STICK, prob: 0.5, min: 1, max: 2 },
    ],
    spawn: { dim: 'overworld', time: 'night', weight: 0.1 },
    shootRange: 14, shootInterval: 3,
  },
  slime: {
    name: 'Slime', hp: 16, speed: 1.6, hostile: true, ai: 'slime', mesh: 'slime',
    xp: 4, melee: { damage: 4, label: 'Slime squish' },
    // Only the smallest size drops; each size carries its own hp/xp/damage.
    drops: (mob) => ((mob.size || 1) <= 1 ? [{ id: ITEM.SLIMEBALL, prob: 1, min: 1, max: 2 }] : []),
    sizes: { 3: { hp: 16, xp: 4, damage: 4 }, 2: { hp: 4, xp: 2, damage: 2 }, 1: { hp: 1, xp: 1, damage: 0 } },
    split: true,
    // Slimes prefer swamps (GEN_V2) but keep their old plains haunt too.
    spawn: { dim: 'overworld', time: 'night', weight: 0.15, biomes: [BIOME.PLAINS, BIOME.SWAMP] },
  },
  silverfish: {
    name: 'Silverfish', hp: 8, speed: 3.5, hostile: true, ai: 'silverfish', mesh: 'silverfish',
    xp: 3, melee: { damage: 1, label: 'Silverfish bite' },
    drops: [],
    spawn: null, // spawner-only (stronghold spawners arrive in Phase 9)
  },

  // ---- overworld passives ------------------------------------------------------
  pig: {
    name: 'Pig', hp: 8, speed: 1.0, hostile: false, ai: 'passive', mesh: 'pig',
    xp: 1, breedFood: ITEM.CARROT,
    drops: [{ id: ITEM.RAW_PORK, prob: 1, min: 1, max: 2 }],
    spawn: { dim: 'overworld', time: 'day', weight: 1 },
    sound: { name: 'animalSqueal', range: 10, prob: 0.4 },
  },
  cow: {
    name: 'Cow', hp: 8, speed: 1.0, hostile: false, ai: 'passive', mesh: 'cow',
    xp: 1, breedFood: ITEM.WHEAT,
    drops: [
      { id: ITEM.RAW_BEEF, prob: 1, min: 1, max: 2 },
      { id: ITEM.LEATHER, prob: 0.6 },
    ],
    spawn: { dim: 'overworld', time: 'day', weight: 1 },
    sound: { name: 'animalSqueal', range: 10, prob: 0.4 },
  },
  sheep: {
    name: 'Sheep', hp: 8, speed: 1.0, hostile: false, ai: 'passive', mesh: 'sheep',
    xp: 1, breedFood: ITEM.WHEAT,
    drops: [
      { id: BLOCK.WOOL_WHITE, prob: 1 },
      { id: ITEM.RAW_BEEF, prob: 0.3 },
    ],
    spawn: { dim: 'overworld', time: 'day', weight: 1 },
    sound: { name: 'animalSqueal', range: 10, prob: 0.4 },
  },
  chicken: {
    name: 'Chicken', hp: 8, speed: 1.0, hostile: false, ai: 'passive', mesh: 'chicken',
    xp: 1, breedFood: ITEM.WHEAT_SEEDS,
    drops: [
      { id: ITEM.RAW_CHICKEN, prob: 1 },
      { id: ITEM.FEATHER, prob: 0.6, min: 1, max: 2 },
    ],
    spawn: { dim: 'overworld', time: 'day', weight: 1 },
    sound: { name: 'animalSqueal', range: 10, prob: 0.4 },
  },
  villager: {
    name: 'Villager', hp: 20, speed: 1.0, hostile: false, ai: 'passive', mesh: 'villager',
    xp: 1,
    drops: [{ id: ITEM.APPLE, prob: 0.3 }],
    // ~15% of day picks used to be villagers.
    spawn: { dim: 'overworld', time: 'day', weight: 0.7 },
  },
  wolf: {
    name: 'Wolf', hp: 20, speed: 3.0, hostile: false, ai: 'wolf', mesh: 'wolf',
    xp: 1,
    drops: [],
    // kind 'wolf': spawned through its own 12%-roll path, not the ambient list.
    spawn: {
      dim: 'overworld', time: 'day', weight: 1, kind: 'wolf',
      biomes: [BIOME.FOREST, BIOME.SNOW, BIOME.FLOWER_FOREST, BIOME.TAIGA],
    },
    sound: { name: 'wolfBark', range: 12, prob: 0.3 },
  },
  horse: {
    name: 'Horse', hp: 26, speed: 1.2, hostile: false, ai: 'passive', mesh: 'horse',
    xp: 1, rideSpeed: 9, jumpSpeed: 8.5,
    drops: [{ id: ITEM.LEATHER, prob: 0.6, min: 1, max: 2 }],
    spawn: { dim: 'overworld', time: 'day', weight: 0.3, biomes: [BIOME.PLAINS], group: 2 },
    sound: { name: 'animalSqueal', range: 10, prob: 0.3 },
  },
  squid: {
    name: 'Squid', hp: 10, speed: 1.4, hostile: false, ai: 'squid', mesh: 'squid',
    xp: 1, aquatic: true,
    drops: [{ id: ITEM.INK_SAC, prob: 1, min: 1, max: 3 }],
    // kind 'water': spawned by the water-column path, never on land.
    spawn: { dim: 'overworld', time: null, weight: 1, kind: 'water' },
  },
  iron_golem: {
    name: 'Iron Golem', hp: 100, speed: 1.4, hostile: false, ai: 'golem', mesh: 'golem',
    xp: 0, persist: true, melee: { damage: 12, label: 'Iron golem' },
    drops: [{ id: ITEM.IRON_INGOT, prob: 1, min: 3, max: 5 }],
    spawn: null, // summoned by building an iron-block T (see main.js)
  },

  // ---- nether ---------------------------------------------------------------------
  zombie_pigman: {
    name: 'Zombie Pigman', hp: 14, speed: 2.15, hostile: true, ai: 'pigman', mesh: 'pigman',
    xp: 6, melee: { damage: 3, label: 'Pigman attack' },
    drops: [
      { id: ITEM.GOLD_INGOT, prob: 0.2 },
      { id: ITEM.STICK, prob: 0.4 },
    ],
    // Weight 2 preserves the old ['pigman','pigman','imp'] pick ratio.
    spawn: { dim: 'nether', time: null, weight: 2 },
  },
  fire_imp: {
    name: 'Fire Imp', hp: 16, speed: 1.0, hostile: true, ai: 'fireImp', mesh: 'imp',
    xp: 6, flies: true, hover: 0, // hovers at ground level, body bob in its AI
    // Blazes are now the reliable rod source; imps only drop rods occasionally.
    drops: [{ id: ITEM.BLAZE_ROD, prob: 0.2 }],
    spawn: { dim: 'nether', time: null, weight: 1 },
    shootRange: 12, shootInterval: 2.6,
  },
  ghast: {
    name: 'Ghast', hp: 10, speed: 1.5, hostile: true, ai: 'ghast', mesh: 'ghast',
    xp: 5, flies: true, hover: 9,
    drops: [
      { id: ITEM.GUNPOWDER, prob: 1, min: 1, max: 2 },
      { id: ITEM.GHAST_TEAR, prob: 0.25 },
    ],
    spawn: { dim: 'nether', time: null, weight: 0.15 },
    shootRange: 24, shootInterval: 4,
  },
  blaze: {
    name: 'Blaze', hp: 20, speed: 1.2, hostile: true, ai: 'blaze', mesh: 'blaze',
    xp: 10, flies: true, hover: 2,
    drops: [{ id: ITEM.BLAZE_ROD, prob: 0.5 }],
    spawn: null, // fortress spawner blocks only (structures.js)
    shootRange: 14, shootInterval: 3,
  },
  wither_skeleton: {
    name: 'Wither Skeleton', hp: 20, speed: 2.0, hostile: true, ai: 'zombie', mesh: 'witherSkeleton',
    xp: 8, melee: { damage: 5, label: 'Wither skeleton' },
    drops: [
      { id: ITEM.COAL, prob: 0.3 },
      { id: ITEM.BONE, prob: 0.5 },
    ],
    spawn: { dim: 'nether', time: null, weight: 0.2 },
  },
  magma_cube: {
    name: 'Magma Cube', hp: 16, speed: 1.6, hostile: true, ai: 'slime', mesh: 'magmaCube',
    xp: 4, melee: { damage: 4, label: 'Magma cube' },
    drops: (mob) => ((mob.size || 1) <= 1 ? [{ id: ITEM.MAGMA_CREAM, prob: 1, min: 1, max: 2 }] : []),
    sizes: { 3: { hp: 16, xp: 4, damage: 4 }, 2: { hp: 4, xp: 2, damage: 2 }, 1: { hp: 1, xp: 1, damage: 0 } },
    split: true,
    spawn: { dim: 'nether', time: null, weight: 0.3 },
  },
  boss: {
    name: 'Nether Overlord', hp: 200, speed: 0, hostile: true, ai: 'boss', mesh: 'boss',
    xp: 50, flies: true,
    drops: [
      { id: ITEM.NETHER_STAR, prob: 1 },
      { id: ITEM.DIAMOND, prob: 1, min: 3, max: 3 },
    ],
    spawn: null, // summoned via the Overlord Sigil
    sound: { name: 'bossRoar', range: 30, prob: 0.3 },
  },

  // ---- Phase 9: the End -----------------------------------------------------------
  ender_dragon: {
    // xp: 0 — the kill pays out through the victory XP shower in main.js
    // (12 orbs x 10 = 120 XP), not the normal per-kill orb. Documented choice.
    name: 'Ender Dragon', hp: 200, speed: 6, hostile: true, ai: 'dragon', mesh: 'dragon',
    xp: 0, flies: true, persist: true,
    drops: [],
    spawn: null, // spawned by main.js when a player enters the End pre-victory
    sound: { name: 'bossRoar', range: 60, prob: 0.25 },
  },
  crystal: {
    // End crystals: hp 1, no real AI (float + spin), die to ANY hit (melee or
    // arrow) with a small explosion handled in main.js. While one lives the
    // dragon regenerates 1 HP/s (mobs.js manages the healing beam).
    name: 'End Crystal', hp: 1, speed: 0, hostile: false, ai: 'crystal', mesh: 'crystal',
    xp: 0, flies: true, persist: true,
    drops: [],
    spawn: null, // placed atop the obsidian pillars when the fight starts
  },
};

export function mobDef(type) {
  return MOB_DEFS[type] || MOB_DEFS.zombie;
}

// Weighted spawn candidates for a dimension/time. `kind` filters the special
// paths (the wolf pre-roll; later: water mobs); the default (undefined) is the
// ambient ground list. def.spawn may be one descriptor or a LIST of them
// (Phase 9: endermen spawn in both the overworld and the End, with per-dim
// weights).
export function spawnCandidates({ dim, time = null, kind = undefined }) {
  const out = [];
  for (const [type, def] of Object.entries(MOB_DEFS)) {
    if (!def.spawn) continue;
    const specs = Array.isArray(def.spawn) ? def.spawn : [def.spawn];
    for (const s of specs) {
      if (!s || !(s.weight > 0)) continue;
      if ((s.kind || undefined) !== kind) continue;
      if (s.dim !== dim) continue;
      if (time !== null && s.time !== null && s.time !== time) continue;
      out.push({ type, weight: s.weight, def });
      break; // at most one entry per type per list
    }
  }
  return out;
}

// Pick one candidate by weight (Math.random by default).
export function weightedPick(cands, rand = Math.random) {
  let total = 0;
  for (const c of cands) total += c.weight;
  if (total <= 0) return null;
  let r = rand() * total;
  for (const c of cands) {
    r -= c.weight;
    if (r <= 0) return c;
  }
  return cands[cands.length - 1] || null;
}

// Roll a drops table (array or function-of-mob) into [{ id, count }].
export function rollMobDrops(mob, rand = Math.random) {
  const def = mobDef(mob.type);
  const table = typeof def.drops === 'function' ? def.drops(mob) : def.drops;
  const out = [];
  for (const d of table || []) {
    if (rand() >= (d.prob != null ? d.prob : 1)) continue;
    const min = d.min != null ? d.min : 1;
    const max = d.max != null ? d.max : min;
    const count = min + Math.floor(rand() * (max - min + 1));
    if (count > 0) out.push({ id: d.id, count });
  }
  return out;
}

// XP for killing a mob entity (sized mobs override the base xp per size).
export function xpForMob(mob) {
  const def = mobDef(mob.type);
  if (def.sizes && mob.size && def.sizes[mob.size]) return def.sizes[mob.size].xp;
  return def.xp != null ? def.xp : 1;
}

// Breeding food lookup (was the BREED_FOOD table in mobs.js).
export function breedFoodOf(type) {
  const def = MOB_DEFS[type];
  return def && def.breedFood ? def.breedFood : null;
}
