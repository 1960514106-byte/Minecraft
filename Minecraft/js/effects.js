// =============================================================================
// effects.js — Timed status effects (potions, witch flasks, golden apples).
// One EffectManager instance tracks the PLAYER's effects (owned by main.js);
// mobs carry a lightweight {id, amp, t} array ticked inside mobs.update
// instead (only poison/slowness/weakness matter for them).
//
// Instant effects (healing) are applied immediately by the caller and are
// never stored here. This module is intentionally three-free so the Node
// smoke suite can exercise it headlessly.
// =============================================================================

// The registry of timed effects. `color` paints the HUD chip.
export const EFFECTS = {
  speed:           { name: 'Speed',           color: '#7fd4ff' },
  slowness:        { name: 'Slowness',        color: '#8fa3b8' },
  strength:        { name: 'Strength',        color: '#ff8a7a' },
  weakness:        { name: 'Weakness',        color: '#a9a49a' },
  regeneration:    { name: 'Regeneration',    color: '#f486c9' },
  poison:          { name: 'Poison',          color: '#87c14b' },
  fire_resistance: { name: 'Fire Resistance', color: '#ffb84d' },
  night_vision:    { name: 'Night Vision',    color: '#a8b8ff' },
  water_breathing: { name: 'Water Breathing', color: '#66b7ff' },
};

export class EffectManager {
  constructor(state = null) {
    // id -> { amp, t } (amp >= 1, t = seconds remaining)
    this.active = new Map();
    if (state) this.restore(state);
  }

  // Add/refresh an effect. A stronger amplifier replaces a weaker one; equal
  // or weaker amplifiers keep the existing amp but the duration always
  // refreshes to at least `dur` (never shortens a longer timer).
  add(id, amp = 1, dur = 30) {
    if (!EFFECTS[id]) return false;
    const cur = this.active.get(id);
    if (!cur) {
      this.active.set(id, { amp, t: dur });
    } else {
      cur.amp = Math.max(cur.amp, amp);
      cur.t = Math.max(cur.t, dur);
    }
    return true;
  }

  has(id) {
    return this.active.has(id);
  }

  // Amplifier of an active effect, 0 if absent.
  level(id) {
    const e = this.active.get(id);
    return e ? e.amp : 0;
  }

  // Seconds remaining, 0 if absent.
  timeLeft(id) {
    const e = this.active.get(id);
    return e ? e.t : 0;
  }

  // Tick all timers down; returns true if any effect expired this update.
  update(dt) {
    let expired = false;
    for (const [id, e] of this.active) {
      e.t -= dt;
      if (e.t <= 0) {
        this.active.delete(id);
        expired = true;
      }
    }
    return expired;
  }

  clear() {
    this.active.clear();
  }

  // [{ id, amp, t }] sorted by name for a stable HUD order.
  list() {
    const out = [];
    for (const [id, e] of this.active) out.push({ id, amp: e.amp, t: e.t });
    out.sort((a, b) => (EFFECTS[a.id].name < EFFECTS[b.id].name ? -1 : 1));
    return out;
  }

  serialize() {
    const out = [];
    for (const [id, e] of this.active) out.push({ id, amp: e.amp, t: e.t });
    return out;
  }

  restore(state) {
    this.active.clear();
    if (!Array.isArray(state)) return;
    for (const e of state) {
      if (e && EFFECTS[e.id] && Number.isFinite(e.t) && e.t > 0) {
        this.active.set(e.id, { amp: Math.max(1, e.amp | 0), t: e.t });
      }
    }
  }
}
