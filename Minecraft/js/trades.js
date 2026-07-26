// =============================================================================
// trades.js — Phase 8: villager professions and leveled trade tables.
//
// This module is intentionally three-free (it only imports ids from config.js)
// so the Node smoke suite can assert trade-table integrity headlessly.
//
// Data model:
//   PROFESSIONS[id] = { name, trades: [tier1[], tier2[], tier3[]] }
//   trade = { give: [{ id, count }, ...], get: { id, count } }
//
// EMERALD is the currency on one side of EVERY trade: villagers buy raw
// materials for emeralds and sell finished goods for emeralds. A villager's
// profession is rolled deterministically from its spawn position
// (professionForPos), its tradeTier starts at 1 and rises one tier per
// TRADE_TIER_USES completed trades up to MAX_TRADE_TIER.
// =============================================================================

import { ITEM, BLOCK } from './config.js';

// Trades needed to unlock the next tier (tier = 1 + floor(uses / 4), cap 3).
export const TRADE_TIER_USES = 4;
export const MAX_TRADE_TIER = 3;

const E = ITEM.EMERALD;

export const PROFESSIONS = {
  farmer: {
    name: 'Farmer',
    trades: [
      [ // tier 1
        { give: [{ id: ITEM.WHEAT, count: 20 }], get: { id: E, count: 1 } },
        { give: [{ id: ITEM.CARROT, count: 16 }], get: { id: E, count: 1 } },
        { give: [{ id: E, count: 1 }], get: { id: ITEM.BREAD, count: 6 } },
      ],
      [ // tier 2
        { give: [{ id: ITEM.RAW_FISH, count: 10 }], get: { id: E, count: 1 } },
        { give: [{ id: E, count: 1 }], get: { id: ITEM.APPLE, count: 4 } },
        { give: [{ id: E, count: 2 }], get: { id: ITEM.COOKED_FISH, count: 6 } },
      ],
      [ // tier 3
        { give: [{ id: E, count: 3 }], get: { id: ITEM.GOLDEN_CARROT, count: 3 } },
        { give: [{ id: E, count: 1 }], get: { id: ITEM.WHEAT_SEEDS, count: 12 } },
      ],
    ],
  },
  librarian: {
    name: 'Librarian',
    trades: [
      [
        { give: [{ id: BLOCK.SUGAR_CANE, count: 10 }], get: { id: E, count: 1 } },
        { give: [{ id: E, count: 1 }], get: { id: BLOCK.GLASS, count: 8 } },
      ],
      [
        { give: [{ id: ITEM.INK_SAC, count: 5 }], get: { id: E, count: 1 } },
        { give: [{ id: E, count: 3 }], get: { id: BLOCK.BOOKSHELF, count: 2 } },
        { give: [{ id: E, count: 1 }], get: { id: ITEM.LAPIS, count: 3 } },
      ],
      [
        { give: [{ id: ITEM.LAPIS, count: 10 }], get: { id: E, count: 2 } },
        { give: [{ id: E, count: 5 }], get: { id: BLOCK.ENCHANTING_TABLE, count: 1 } },
      ],
    ],
  },
  blacksmith: {
    name: 'Blacksmith',
    trades: [
      [
        { give: [{ id: ITEM.COAL, count: 15 }], get: { id: E, count: 1 } },
        { give: [{ id: ITEM.RAW_IRON, count: 8 }], get: { id: E, count: 1 } },
        { give: [{ id: E, count: 2 }], get: { id: ITEM.IRON_PICKAXE, count: 1 } },
      ],
      [
        { give: [{ id: ITEM.IRON_INGOT, count: 6 }], get: { id: E, count: 1 } },
        { give: [{ id: E, count: 3 }], get: { id: ITEM.IRON_SWORD, count: 1 } },
        { give: [{ id: E, count: 4 }], get: { id: ITEM.IRON_CHEST, count: 1 } },
      ],
      [
        { give: [{ id: E, count: 8 }], get: { id: ITEM.DIAMOND_PICKAXE, count: 1 } },
        { give: [{ id: E, count: 7 }], get: { id: ITEM.DIAMOND_SWORD, count: 1 } },
        { give: [{ id: E, count: 10 }], get: { id: ITEM.DIAMOND_CHEST, count: 1 } },
      ],
    ],
  },
  cleric: {
    name: 'Cleric',
    trades: [
      [
        { give: [{ id: ITEM.SPIDER_EYE, count: 6 }], get: { id: E, count: 1 } },
        { give: [{ id: ITEM.BONE, count: 8 }], get: { id: E, count: 1 } },
      ],
      [
        { give: [{ id: ITEM.GUNPOWDER, count: 6 }], get: { id: E, count: 1 } },
        { give: [{ id: E, count: 1 }], get: { id: ITEM.GLASS_BOTTLE, count: 4 } },
        { give: [{ id: E, count: 2 }], get: { id: ITEM.BLAZE_POWDER, count: 2 } },
      ],
      [
        { give: [{ id: E, count: 3 }], get: { id: ITEM.GLOWSTONE_DUST, count: 4 } },
        { give: [{ id: E, count: 4 }], get: { id: ITEM.ENDER_PEARL, count: 2 } },
      ],
    ],
  },
  butcher: {
    name: 'Butcher',
    trades: [
      [
        { give: [{ id: ITEM.RAW_PORK, count: 8 }], get: { id: E, count: 1 } },
        { give: [{ id: ITEM.RAW_BEEF, count: 8 }], get: { id: E, count: 1 } },
        { give: [{ id: ITEM.RAW_CHICKEN, count: 10 }], get: { id: E, count: 1 } },
      ],
      [
        { give: [{ id: E, count: 1 }], get: { id: ITEM.COOKED_PORK, count: 4 } },
        { give: [{ id: E, count: 1 }], get: { id: ITEM.COOKED_BEEF, count: 4 } },
      ],
      [
        { give: [{ id: E, count: 1 }], get: { id: ITEM.COOKED_CHICKEN, count: 5 } },
        { give: [{ id: E, count: 6 }], get: { id: ITEM.SADDLE, count: 1 } }, // rare tier-3 saddle
      ],
    ],
  },
};

export const PROFESSION_IDS = Object.keys(PROFESSIONS);

// Deterministic profession from a villager's spawn position (block coords).
// Integer avalanche hash so neighbouring spawns still differ; stable across
// sessions so save migration and respawn agree.
export function professionForPos(x, z) {
  let h = (Math.imul(Math.floor(x), 374761393) ^ Math.imul(Math.floor(z), 668265263)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h = (h ^ (h >>> 16)) >>> 0;
  return PROFESSION_IDS[h % PROFESSION_IDS.length];
}

// Trade tier unlocked by a lifetime trade count (1-based, capped).
export function tradeTierFromUses(uses) {
  return Math.min(MAX_TRADE_TIER, 1 + Math.floor((uses || 0) / TRADE_TIER_USES));
}

// All trades unlocked at `tier` for a profession, flattened in tier order.
// Each entry is annotated with its tier for the UI.
export function unlockedTrades(profession, tier) {
  const p = PROFESSIONS[profession] || PROFESSIONS.farmer;
  const t = Math.max(1, Math.min(MAX_TRADE_TIER, tier || 1));
  const out = [];
  for (let i = 0; i < t; i++) {
    for (const tr of p.trades[i] || []) out.push({ ...tr, tier: i + 1 });
  }
  return out;
}
