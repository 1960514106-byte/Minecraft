// =============================================================================
// chest.js — Per-block chest storage. Each placed chest holds 27 item slots.
// =============================================================================

const CHEST_SLOTS = 27;

export class ChestManager {
  constructor(state = null) {
    this.chests = new Map();
    if (state) {
      for (const key in state) {
        const slots = new Array(CHEST_SLOTS).fill(null);
        const saved = state[key];
        if (Array.isArray(saved)) {
          for (let i = 0; i < CHEST_SLOTS; i++) {
            const s = saved[i];
            if (s && s.id != null) {
              const slot = { id: s.id, count: s.count || 1 };
              if (Number.isFinite(s.durability)) slot.durability = s.durability;
              if (s.enchantments) slot.enchantments = { ...s.enchantments };
              slots[i] = slot;
            }
          }
        }
        this.chests.set(key, slots);
      }
    }
  }

  getOrCreate(key) {
    let slots = this.chests.get(key);
    if (!slots) {
      slots = new Array(CHEST_SLOTS).fill(null);
      this.chests.set(key, slots);
    }
    return slots;
  }

  remove(key) {
    const slots = this.chests.get(key);
    const drops = [];
    if (slots) {
      for (const s of slots) {
        if (s) drops.push({ id: s.id, count: s.count });
      }
      this.chests.delete(key);
    }
    return drops;
  }

  serialize() {
    const out = {};
    for (const [key, slots] of this.chests) {
      const hasItems = slots.some(s => s !== null);
      if (hasItems) {
        out[key] = slots.map(s => {
          if (!s) return null;
          const o = { id: s.id, count: s.count };
          if (s.durability !== undefined) o.durability = s.durability;
          if (s.enchantments) o.enchantments = { ...s.enchantments };
          return o;
        });
      }
    }
    return out;
  }
}

export { CHEST_SLOTS };
