// =============================================================================
// inventory.js — Survival inventory: a fixed list of stack slots. The first
// HOTBAR_SIZE slots double as the on-screen hotbar. Each slot is either null
// (empty) or { id, count }. Stacks merge up to STACK_MAX.
// =============================================================================

import { INVENTORY_SIZE, HOTBAR_SIZE, itemStackMax, itemMaxDurability } from './config.js';

export class Inventory {
  constructor(state = null) {
    this.slots = new Array(INVENTORY_SIZE).fill(null);
    this.restore(state);
  }

  restore(state) {
    this.slots = new Array(INVENTORY_SIZE).fill(null);
    if (!Array.isArray(state)) return;
    for (let i = 0; i < INVENTORY_SIZE && i < state.length; i++) {
      const s = state[i];
      if (s && Number.isFinite(s.id) && Number.isFinite(s.count) && s.count > 0) {
        const id = s.id | 0;
        const slot = { id, count: Math.min(itemStackMax(id), s.count | 0) };
        if (Number.isFinite(s.durability)) slot.durability = s.durability | 0;
        if (s.enchantments && typeof s.enchantments === 'object') slot.enchantments = { ...s.enchantments };
        this.slots[i] = slot;
      }
    }
  }

  // Plain JSON-able snapshot (nulls included so indices stay stable).
  serialize() {
    return this.slots.map((s) => {
      if (!s) return null;
      const o = { id: s.id, count: s.count };
      if (s.durability !== undefined) o.durability = s.durability;
      if (s.enchantments) o.enchantments = { ...s.enchantments };
      return o;
    });
  }

  get(i) { return this.slots[i]; }

  count(id) {
    let n = 0;
    for (const s of this.slots) if (s && s.id === id) n += s.count;
    return n;
  }

  // Add `count` of `id`, filling existing matching stacks first, then empties.
  // Returns the number that did NOT fit (0 if everything was stored).
  // opts.durability: if provided, sets durability on the newly created slot.
  add(id, count = 1, opts = {}) {
    let remaining = count;
    const dur = opts.durability;
    const hasDur = dur !== undefined;
    for (let i = 0; i < this.slots.length && remaining > 0; i++) {
      const s = this.slots[i];
      if (s && s.id === id && s.count < itemStackMax(id) && !hasDur && !s.durability && !s.enchantments) {
        const room = itemStackMax(id) - s.count;
        const put = Math.min(room, remaining);
        s.count += put;
        remaining -= put;
      }
    }
    for (let i = 0; i < this.slots.length && remaining > 0; i++) {
      if (!this.slots[i]) {
        const put = Math.min(itemStackMax(id), remaining);
        const slot = { id, count: put };
        if (hasDur) slot.durability = dur;
        this.slots[i] = slot;
        remaining -= put;
      }
    }
    return remaining;
  }

  // Add a full stack object, preserving durability/enchantments. Plain stacks
  // fall back to add() so they still merge; tagged stacks go into an empty
  // slot untouched. Returns the count that did NOT fit.
  addStack(stack) {
    if (!stack || stack.count <= 0) return 0;
    if (stack.durability === undefined && !stack.enchantments) {
      return this.add(stack.id, stack.count);
    }
    for (let i = 0; i < this.slots.length; i++) {
      if (!this.slots[i]) {
        this.slots[i] = { ...stack };
        return 0;
      }
    }
    return stack.count;
  }

  // Remove up to `count` of `id` from anywhere. Returns how many were removed.
  remove(id, count = 1) {
    let need = count;
    for (let i = 0; i < this.slots.length && need > 0; i++) {
      const s = this.slots[i];
      if (s && s.id === id) {
        const take = Math.min(s.count, need);
        s.count -= take;
        need -= take;
        if (s.count <= 0) this.slots[i] = null;
      }
    }
    return count - need;
  }

  // Remove one item from a specific slot (used when placing from the hotbar).
  removeOneAt(i) {
    const s = this.slots[i];
    if (!s) return false;
    s.count -= 1;
    if (s.count <= 0) this.slots[i] = null;
    return true;
  }

  isHotbar(i) { return i < HOTBAR_SIZE; }
}
