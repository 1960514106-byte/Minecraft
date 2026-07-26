// =============================================================================
// dispensers.js — Per-block 9-slot storage shared by dispensers AND droppers
// (one manager: both are the same container, only the eject behaviour differs
// and that is decided in main.js from the block id). Mirrors chest.js; keys
// are dimension-prefixed "x,y,z" strings. Facing + rising-edge state live in
// the redstone side-table, NOT here.
// =============================================================================

const DISPENSER_SLOTS = 9;

export class DispenserManager {
  constructor(state = null) {
    this.dispensers = new Map();
    if (state) {
      for (const key in state) {
        const slots = new Array(DISPENSER_SLOTS).fill(null);
        const saved = state[key];
        if (Array.isArray(saved)) {
          for (let i = 0; i < DISPENSER_SLOTS; i++) {
            const s = saved[i];
            if (s && s.id != null) {
              const slot = { id: s.id, count: s.count || 1 };
              if (Number.isFinite(s.durability)) slot.durability = s.durability;
              if (s.enchantments) slot.enchantments = { ...s.enchantments };
              slots[i] = slot;
            }
          }
        }
        this.dispensers.set(key, slots);
      }
    }
  }

  getOrCreate(key) {
    let slots = this.dispensers.get(key);
    if (!slots) {
      slots = new Array(DISPENSER_SLOTS).fill(null);
      this.dispensers.set(key, slots);
    }
    return slots;
  }

  remove(key) {
    const slots = this.dispensers.get(key);
    const drops = [];
    if (slots) {
      for (const s of slots) {
        if (s) drops.push({ id: s.id, count: s.count });
      }
      this.dispensers.delete(key);
    }
    return drops;
  }

  serialize() {
    const out = {};
    for (const [key, slots] of this.dispensers) {
      if (slots.some((s) => s !== null)) {
        out[key] = slots.map((s) => {
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

export { DISPENSER_SLOTS };
