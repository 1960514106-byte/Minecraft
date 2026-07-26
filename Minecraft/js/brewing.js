// =============================================================================
// brewing.js — Per-stand brewing state (furnace.js pattern: keyed by dimKey
// position, stands keep working in the background). Three-free.
//
// A stand holds 3 bottle slots, 1 ingredient slot and a blaze-powder fuel
// slot. One blaze powder charges 20 brews (vanilla). A brew takes BREW_TIME
// seconds and converts every bottle that has a valid recipe with the current
// ingredient, consuming one ingredient.
//
// Splash potions are a stack FLAG, not separate ids: brewing any effect
// potion with gunpowder sets `splash: true` on the stack (documented design —
// bounds item-id sprawl; the flag survives inventories/containers like
// durability does).
// =============================================================================

import { ITEM } from './config.js';

export const BREW_TIME = 20;          // seconds per brew
export const FUEL_BREWS_PER_POWDER = 20;

// ingredient id -> { base potion id -> result potion id }
export const BREW_MAP = {
  [ITEM.NETHER_WART]:   { [ITEM.WATER_BOTTLE]: ITEM.POTION_AWKWARD },
  [ITEM.SUGAR]:         { [ITEM.POTION_AWKWARD]: ITEM.POTION_SPEED },
  [ITEM.BLAZE_POWDER]:  { [ITEM.POTION_AWKWARD]: ITEM.POTION_STRENGTH },
  [ITEM.GOLDEN_CARROT]: { [ITEM.POTION_AWKWARD]: ITEM.POTION_NIGHT_VISION },
  [ITEM.MAGMA_CREAM]:   { [ITEM.POTION_AWKWARD]: ITEM.POTION_FIRE_RES },
  [ITEM.SPIDER_EYE]:    { [ITEM.POTION_AWKWARD]: ITEM.POTION_POISON },
  [ITEM.GHAST_TEAR]:    { [ITEM.POTION_AWKWARD]: ITEM.POTION_REGEN },
  // Raw fish stands in for vanilla's pufferfish (no pufferfish item).
  [ITEM.RAW_FISH]:      { [ITEM.POTION_AWKWARD]: ITEM.POTION_WATER_BREATHING },
  // Fermented spider eye corrupts: speed -> slowness, strength -> weakness,
  // healing -> poison (no Harming potion exists — documented simplification).
  [ITEM.FERMENTED_SPIDER_EYE]: {
    [ITEM.POTION_SPEED]: ITEM.POTION_SLOWNESS,
    [ITEM.POTION_STRENGTH]: ITEM.POTION_WEAKNESS,
    [ITEM.POTION_HEALING]: ITEM.POTION_POISON,
  },
};

// Effect potions that may become splash variants via gunpowder (water and
// awkward bottles cannot).
export const SPLASHABLE = new Set([
  ITEM.POTION_SPEED, ITEM.POTION_STRENGTH, ITEM.POTION_HEALING,
  ITEM.POTION_POISON, ITEM.POTION_REGEN, ITEM.POTION_FIRE_RES,
  ITEM.POTION_NIGHT_VISION, ITEM.POTION_WATER_BREATHING,
  ITEM.POTION_SLOWNESS, ITEM.POTION_WEAKNESS,
]);

// The result of brewing `ingredientId` into a bottle stack, or null.
// Returns { id, splash } — splash carries through conversions (a splash speed
// potion fermented becomes a splash slowness potion).
export function brewResult(bottle, ingredientId) {
  if (!bottle) return null;
  if (ingredientId === ITEM.GUNPOWDER) {
    if (!bottle.splash && SPLASHABLE.has(bottle.id)) return { id: bottle.id, splash: true };
    return null;
  }
  const map = BREW_MAP[ingredientId];
  const out = map ? map[bottle.id] : undefined;
  if (out === undefined) return null;
  return { id: out, splash: !!bottle.splash };
}

// True if the id does anything in the ingredient slot of a stand.
export function isBrewIngredient(id) {
  return id === ITEM.GUNPOWDER || !!BREW_MAP[id];
}

function emptyState() {
  return { bottles: [null, null, null], ingredient: null, fuel: null, charges: 0, progress: 0 };
}

function cloneStack(s) {
  return s ? { ...s } : null;
}

export class BrewingManager {
  constructor(state = null) {
    this.stands = new Map();
    if (state) {
      for (const key in state) {
        const s = state[key];
        this.stands.set(key, {
          bottles: [0, 1, 2].map((i) => cloneStack((s.bottles || [])[i])),
          ingredient: cloneStack(s.ingredient),
          fuel: cloneStack(s.fuel),
          charges: s.charges || 0,
          progress: s.progress || 0,
        });
      }
    }
  }

  getOrCreate(key) {
    let s = this.stands.get(key);
    if (!s) { s = emptyState(); this.stands.set(key, s); }
    return s;
  }

  remove(key) {
    const s = this.stands.get(key);
    this.stands.delete(key);
    if (!s) return [];
    const drops = [];
    for (const b of s.bottles) if (b) drops.push({ id: b.id, count: b.count, ...(b.splash ? { splash: true } : {}) });
    if (s.ingredient) drops.push({ id: s.ingredient.id, count: s.ingredient.count });
    if (s.fuel) drops.push({ id: s.fuel.id, count: s.fuel.count });
    return drops;
  }

  // Does any bottle convert with the current ingredient?
  _canBrew(s) {
    if (!s.ingredient) return false;
    return s.bottles.some((b) => brewResult(b, s.ingredient.id) !== null);
  }

  _tickState(s, dt) {
    if (!this._canBrew(s)) {
      const changed = s.progress !== 0;
      s.progress = 0;
      return { stateChanged: changed, brewed: false };
    }
    // Charge from the fuel slot when out of charges.
    if (s.charges <= 0) {
      if (s.fuel && s.fuel.id === ITEM.BLAZE_POWDER && s.fuel.count > 0) {
        s.fuel.count -= 1;
        if (s.fuel.count <= 0) s.fuel = null;
        s.charges = FUEL_BREWS_PER_POWDER;
      } else {
        const changed = s.progress !== 0;
        s.progress = 0;
        return { stateChanged: changed, brewed: false };
      }
    }
    s.progress += dt;
    if (s.progress < BREW_TIME) return { stateChanged: false, brewed: false };
    // Brew: convert every matching bottle, spend one ingredient + one charge.
    s.progress = 0;
    s.charges -= 1;
    for (let i = 0; i < 3; i++) {
      const out = brewResult(s.bottles[i], s.ingredient.id);
      if (out) {
        const b = { id: out.id, count: 1 };
        if (out.splash) b.splash = true;
        s.bottles[i] = b;
      }
    }
    s.ingredient.count -= 1;
    if (s.ingredient.count <= 0) s.ingredient = null;
    return { stateChanged: true, brewed: true };
  }

  tickAll(dt) {
    const changes = [];
    for (const [key, s] of this.stands) {
      const r = this._tickState(s, dt);
      if (r.stateChanged || r.brewed) changes.push({ key, ...r });
    }
    return changes;
  }

  serialize() {
    const out = {};
    for (const [key, s] of this.stands) {
      if (s.bottles.some(Boolean) || s.ingredient || s.fuel || s.charges > 0) {
        out[key] = {
          bottles: s.bottles, ingredient: s.ingredient, fuel: s.fuel,
          charges: s.charges, progress: s.progress,
        };
      }
    }
    return out;
  }
}

// What may sit in a bottle slot (water bottles and any potion; empty glass
// bottles stay in the inventory — filling happens at water, not in the stand).
export function isBottleSlotItem(id) {
  return id === ITEM.WATER_BOTTLE || (id >= ITEM.POTION_AWKWARD && id <= ITEM.POTION_WEAKNESS);
}
