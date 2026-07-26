// =============================================================================
// anvil.js — Pure anvil logic (three-free so the smoke suite covers it).
// Two operations, both cost ANVIL_XP_COST (2) XP levels flat:
//   (a) combine two of the SAME item: durabilities add plus a 12% bonus of
//       max, enchantments merge taking the max level of each key;
//   (b) item + its REPAIR_MATERIAL: each material unit restores 25% of max
//       durability (only as many materials as needed are consumed).
// Renaming is skipped — items have no custom names in this game (documented).
// =============================================================================

import { REPAIR_MATERIAL, itemMaxDurability } from './config.js';

export const ANVIL_XP_COST = 2;

function durOf(stack, max) {
  return stack.durability != null ? stack.durability : max;
}

// Compute the anvil output for input stacks a and b (either order for the
// repair-material case). Returns null (no valid operation) or:
//   { result, consumeA, consumeB } — consume counts to remove from each slot.
export function anvilResult(a, b) {
  if (!a || !b) return null;

  // (a) Combine two of the same durability item.
  const maxA = itemMaxDurability(a.id);
  if (a.id === b.id && maxA > 0 && a.count === 1 && b.count === 1) {
    const dur = Math.min(maxA, durOf(a, maxA) + durOf(b, maxA) + Math.floor(maxA * 0.12));
    const result = { id: a.id, count: 1, durability: dur };
    const ench = {};
    for (const src of [a.enchantments, b.enchantments]) {
      if (!src) continue;
      for (const [key, lvl] of Object.entries(src)) {
        ench[key] = Math.max(ench[key] || 0, lvl);
      }
    }
    if (Object.keys(ench).length) result.enchantments = ench;
    if (a.splash) result.splash = true; // never applies today; keeps flags safe
    return { result, consumeA: 1, consumeB: 1 };
  }

  // (b) Item + matching raw material (accept both slot orders).
  const tryRepair = (item, mat, itemIsA) => {
    const max = itemMaxDurability(item.id);
    if (max <= 0 || item.count !== 1) return null;
    if (REPAIR_MATERIAL[item.id] !== mat.id) return null;
    const missing = max - durOf(item, max);
    if (missing <= 0) return null;
    const per = Math.max(1, Math.floor(max * 0.25));
    const need = Math.min(mat.count, Math.ceil(missing / per));
    const result = { id: item.id, count: 1, durability: Math.min(max, durOf(item, max) + need * per) };
    if (item.enchantments) result.enchantments = { ...item.enchantments };
    return { result, consumeA: itemIsA ? 1 : need, consumeB: itemIsA ? need : 1 };
  };
  return tryRepair(a, b, true) || tryRepair(b, a, false);
}
