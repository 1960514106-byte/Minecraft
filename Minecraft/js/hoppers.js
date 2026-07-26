// =============================================================================
// hoppers.js — Per-block hopper state: 5 item slots + the direction the spout
// points at ([0,-1,0] down by default, sideways when placed against the side
// of a container). Keys are dimension-prefixed "x,y,z" strings.
//
// The transfer tick itself lives in main.js (it needs the world, the drops
// manager and every container manager); this module only owns the storage
// plus the pure `insertStack` slot-merging helper so it stays three-free and
// smoke-testable.
// =============================================================================

import { itemStackMax } from './config.js';

const HOPPER_SLOTS = 5;

// Insert `count` of item `id` into a plain slots array (chest/dispenser/hopper
// pattern): top up matching stacks first, then fill empty slots. Returns the
// leftover count that did not fit.
export function insertStack(slots, id, count) {
  let left = count;
  const max = itemStackMax(id);
  for (let i = 0; i < slots.length && left > 0; i++) {
    const s = slots[i];
    if (s && s.id === id && s.count < max) {
      const move = Math.min(max - s.count, left);
      s.count += move;
      left -= move;
    }
  }
  for (let i = 0; i < slots.length && left > 0; i++) {
    if (!slots[i]) {
      const move = Math.min(max, left);
      slots[i] = { id, count: move };
      left -= move;
    }
  }
  return left;
}

export class HopperManager {
  constructor(state = null) {
    this.hoppers = new Map(); // key -> { slots: [5], dir: [dx,dy,dz] }
    if (state) {
      for (const key in state) {
        const saved = state[key] || {};
        const slots = new Array(HOPPER_SLOTS).fill(null);
        if (Array.isArray(saved.slots)) {
          for (let i = 0; i < HOPPER_SLOTS; i++) {
            const s = saved.slots[i];
            if (s && s.id != null) slots[i] = { id: s.id, count: s.count || 1 };
          }
        }
        const dir = Array.isArray(saved.dir) && saved.dir.length === 3 ? saved.dir : [0, -1, 0];
        this.hoppers.set(key, { slots, dir });
      }
    }
  }

  getOrCreate(key, dir = [0, -1, 0]) {
    let h = this.hoppers.get(key);
    if (!h) {
      h = { slots: new Array(HOPPER_SLOTS).fill(null), dir };
      this.hoppers.set(key, h);
    }
    return h;
  }

  remove(key) {
    const h = this.hoppers.get(key);
    const drops = [];
    if (h) {
      for (const s of h.slots) {
        if (s) drops.push({ id: s.id, count: s.count });
      }
      this.hoppers.delete(key);
    }
    return drops;
  }

  serialize() {
    const out = {};
    for (const [key, h] of this.hoppers) {
      out[key] = {
        dir: h.dir,
        slots: h.slots.map((s) => (s ? { id: s.id, count: s.count } : null)),
      };
    }
    return out;
  }
}

export { HOPPER_SLOTS };
