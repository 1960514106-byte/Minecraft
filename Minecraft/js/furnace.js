// =============================================================================
// furnace.js - Per-furnace smelting state. Furnaces keep working in the background.
// =============================================================================

import { ITEM, SMELT_TIME, smeltResult, fuelValue, itemStackMax } from './config.js';

function emptyState() {
  return { input: null, fuel: null, output: null, burn: 0, burnMax: 0, cook: 0 };
}

export class FurnaceManager {
  constructor(state = null) {
    this.furnaces = new Map();
    if (state) {
      for (const key in state) {
        const s = state[key];
        this.furnaces.set(key, {
          input: s.input || null,
          fuel: s.fuel || null,
          output: s.output || null,
          burn: s.burn || 0,
          burnMax: s.burnMax || 0,
          cook: s.cook || 0,
        });
      }
    }
  }

  getOrCreate(key) {
    let s = this.furnaces.get(key);
    if (!s) { s = emptyState(); this.furnaces.set(key, s); }
    return s;
  }

  remove(key) {
    const s = this.furnaces.get(key);
    this.furnaces.delete(key);
    if (!s) return [];
    const drops = [];
    if (s.input) drops.push({ id: s.input.id, count: s.input.count });
    if (s.fuel) drops.push({ id: s.fuel.id, count: s.fuel.count });
    if (s.output) drops.push({ id: s.output.id, count: s.output.count });
    return drops;
  }

  _tickState(s, dt) {
    const wasBurning = s.burn > 0;
    let stateChanged = false;

    const recipe = s.input ? smeltResult(s.input.id) : null;
    const canOutput = recipe && (!s.output || (s.output.id === recipe.id && s.output.count + recipe.count <= itemStackMax(recipe.id)));

    if (s.burn > 0) {
      s.burn -= dt;
      if (s.burn < 0) s.burn = 0;
      if (recipe && canOutput) {
        s.cook += dt;
        if (s.cook >= SMELT_TIME) {
          s.cook = 0;
          s.input.count -= 1;
          if (s.input.count <= 0) s.input = null;
          if (s.output) s.output.count += recipe.count;
          else s.output = { id: recipe.id, count: recipe.count };
          stateChanged = true;
        }
      } else {
        if (s.cook !== 0) stateChanged = true;
        s.cook = 0;
      }
      return { stateChanged, burnChanged: wasBurning !== (s.burn > 0) };
    }

    if (recipe && canOutput && s.fuel && fuelValue(s.fuel.id) > 0) {
      s.burnMax = fuelValue(s.fuel.id);
      s.burn = s.burnMax;
      if (s.fuel.id === ITEM.LAVA_BUCKET) {
        // Burning a lava bucket hands the empty bucket back (vanilla).
        s.fuel = { id: ITEM.BUCKET, count: 1 };
      } else {
        s.fuel.count -= 1;
        if (s.fuel.count <= 0) s.fuel = null;
      }
      return { stateChanged: true, burnChanged: !wasBurning };
    }

    if (s.cook !== 0) stateChanged = true;
    s.cook = 0;
    return { stateChanged, burnChanged: false };
  }

  tick(dt, key) {
    const s = this.furnaces.get(key);
    if (!s) return { stateChanged: false, burnChanged: false };
    return this._tickState(s, dt);
  }

  tickAll(dt) {
    const changes = [];
    for (const [key, s] of this.furnaces) {
      const r = this._tickState(s, dt);
      if (r.stateChanged || r.burnChanged) {
        changes.push({ key, burning: s.burn > 0, stateChanged: r.stateChanged, burnChanged: r.burnChanged });
      }
    }
    return changes;
  }

  serialize() {
    const out = {};
    for (const [key, s] of this.furnaces) {
      if (s.input || s.fuel || s.output || s.burn > 0) {
        out[key] = {
          input: s.input, fuel: s.fuel, output: s.output,
          burn: s.burn, burnMax: s.burnMax, cook: s.cook,
        };
      }
    }
    return out;
  }
}
