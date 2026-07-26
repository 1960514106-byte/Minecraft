// =============================================================================
// survival.js - Player survival state: health, hunger, air, damage and respawn.
// The player controller reports movement/landing/water state; this module owns
// the gameplay rules that turn those signals into survival consequences.
// =============================================================================

import { BLOCK, armorPoints, itemMaxDurability, stackEnchant } from './config.js';
import { isCreative } from './gamemode.js';

const MAX_HEALTH = 20;
const MAX_HUNGER = 20;
const MAX_AIR = 10;

const HUNGER_IDLE = 0.004;
const HUNGER_MOVE = 0.014;
const HUNGER_SPRINT = 0.05;
const HUNGER_SWIM = 0.03;
const HUNGER_JUMP = 0.08;

const FALL_SAFE_DISTANCE = 3;
const DROWN_DAMAGE_INTERVAL = 1.1;
const STARVE_DAMAGE_INTERVAL = 3.5;
const REGEN_INTERVAL = 3.0;
const CONTACT_DAMAGE_INTERVAL = 0.8;

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const stat = (v, fallback, max) => {
  const n = Number(v);
  return Number.isFinite(n) ? clamp(n, 0, max) : fallback;
};

export class Survival {
  constructor(state = null) {
    this.health = MAX_HEALTH;
    this.hunger = MAX_HUNGER;
    this.air = MAX_AIR;
    this.alive = true;
    this.message = '';
    this.messageTime = 0;
    this.damageFlash = 0;

    this._drownTimer = 0;
    this._starveTimer = 0;
    this._regenTimer = 0;
    this._contactTimer = 0;
    this.armor = { head: null, chest: null, legs: null, feet: null };
    this.spawnPoint = null; // custom bed respawn {x, y, z}

    // Phase 7 hooks (both injected by main.js):
    //   effects        — the player's EffectManager (regen/poison/fire res/
    //                    water breathing are read here each update)
    //   damageModifier — (amount, reason, sourcePos) -> amount; the shield
    //                    blocking path reduces frontal damage through this.
    this.effects = null;
    this.damageModifier = null;
    this._effRegenTimer = 0;
    this._poisonTimer = 0;

    // Phase 10 hooks (injected by main.js):
    //   onDeath()                — XP drop at the death point
    //   onArmorBreak(slot, id)   — sound/message when a worn-out piece vanishes
    this.onDeath = null;
    this.onArmorBreak = null;

    this.restore(state);
  }

  restore(state) {
    if (!state) return;
    this.health = stat(state.health, MAX_HEALTH, MAX_HEALTH);
    this.hunger = stat(state.hunger, MAX_HUNGER, MAX_HUNGER);
    this.air = stat(state.air, MAX_AIR, MAX_AIR);
    this.alive = state.alive !== false && this.health > 0;
    if (!this.alive) this.message = state.message || 'You died';
    if (state.armor) {
      for (const slot of ['head', 'chest', 'legs', 'feet']) {
        const v = state.armor[slot];
        // Legacy saves stored a bare item id; newer saves store a full stack
        // so armor keeps its enchantments.
        if (typeof v === 'number') this.armor[slot] = { id: v, count: 1 };
        else if (v && Number.isFinite(v.id)) this.armor[slot] = { ...v, count: 1 };
        else this.armor[slot] = null;
      }
    }
    if (state.spawnPoint) this.spawnPoint = state.spawnPoint;
  }

  serialize() {
    return {
      health: this.health,
      hunger: this.hunger,
      air: this.air,
      alive: this.alive,
      message: this.message,
      armor: { head: this.armor.head, chest: this.armor.chest, legs: this.armor.legs, feet: this.armor.feet },
      spawnPoint: this.spawnPoint,
    };
  }

  update(dt, player, active) {
    if (this.messageTime > 0) this.messageTime -= dt;
    if (this.damageFlash > 0) this.damageFlash = Math.max(0, this.damageFlash - dt * 2.8);
    if (!this.alive || !active) return;

    // Creative mode: no hunger drain, drowning, starvation or regen concerns.
    // Pinning every stat at max is the simplest way to keep the HUD sane.
    if (isCreative()) {
      this.health = MAX_HEALTH;
      this.hunger = MAX_HUNGER;
      this.air = MAX_AIR;
      this._drownTimer = 0;
      this._starveTimer = 0;
      this._regenTimer = 0;
      this._contactTimer = 0;
      this._lavaTimer = 0;
      return;
    }

    this._updateAir(dt, player);
    this._updateHunger(dt, player);
    this._updateFallDamage(player);
    this._updateContactDamage(dt, player);
    this._updateStarvation(dt);
    this._updateRegen(dt);
    this._updateEffects(dt);
  }

  // Timed status effects that touch health directly. The EffectManager itself
  // is ticked by main.js (it also drives the HUD); this only applies the
  // per-interval health consequences.
  _updateEffects(dt) {
    const fx = this.effects;
    if (!fx) return;
    // Regeneration: +1 HP per (2.5s / amplifier).
    const regen = fx.level('regeneration');
    if (regen > 0 && this.health < MAX_HEALTH) {
      this._effRegenTimer += dt;
      if (this._effRegenTimer >= 2.5 / regen) {
        this._effRegenTimer = 0;
        this.heal(1);
      }
    } else {
      this._effRegenTimer = 0;
    }
    // Poison: 1 damage per (1.25s / amplifier), but never lethal (floor 1 HP).
    const poison = fx.level('poison');
    if (poison > 0) {
      this._poisonTimer += dt;
      if (this._poisonTimer >= 1.25 / poison) {
        this._poisonTimer = 0;
        if (this.health > 1) {
          this.health = clamp(this.health - 1, 1, MAX_HEALTH);
          this.damageFlash = Math.max(this.damageFlash, 0.6);
          this._setMessage('Poisoned');
        }
      }
    } else {
      this._poisonTimer = 0;
    }
  }

  // Total armor points including the Protection enchantment on each piece.
  armorTotal() {
    let pts = 0;
    for (const slot of ['head', 'chest', 'legs', 'feet']) {
      const s = this.armor[slot];
      if (!s) continue;
      pts += armorPoints(s.id) + ((s.enchantments && s.enchantments.protection) || 0);
    }
    return pts;
  }

  // `sourcePos` (optional {x,y,z}) is where the damage came from — mob melee,
  // projectiles and explosions pass it so the shield can check the frontal
  // hemisphere. Damage without a source (falls, lava, poison, starving) can
  // never be blocked.
  damage(amount, reason, sourcePos = null) {
    // Creative players are invulnerable to every damage source (mobs, falls,
    // lava, cactus, explosions, arrows) — death cannot occur.
    if (isCreative()) return;
    if (!this.alive || amount <= 0) return;
    if (this.damageModifier) {
      amount = this.damageModifier(amount, reason, sourcePos);
      if (amount <= 0) return;
    }
    let reduced = amount;
    if (reason !== 'Starving') {
      const reduction = Math.min(0.6, this.armorTotal() * 0.04);
      reduced = Math.max(1, amount * (1 - reduction));
      // Every hit the armor mitigates wears each equipped piece by 1 point.
      if (reduction > 0) this._wearArmor();
    }
    this.health = clamp(this.health - reduced, 0, MAX_HEALTH);
    this.damageFlash = 1;
    this._setMessage(reason);
    if (this.health <= 0) this._die(reason);
  }

  // Charge 1 durability to every equipped piece (a stack without the field is
  // at full durability — the tool-stack convention). Unbreaking skips losses;
  // a piece that reaches 0 vanishes through the onArmorBreak hook.
  _wearArmor() {
    for (const slot of ['head', 'chest', 'legs', 'feet']) {
      const s = this.armor[slot];
      if (!s) continue;
      const max = itemMaxDurability(s.id);
      if (max <= 0) continue;
      const unb = stackEnchant(s, 'unbreaking');
      if (unb > 0 && Math.random() < unb / (unb + 1)) continue;
      if (s.durability == null) s.durability = max;
      s.durability -= 1;
      if (s.durability <= 0) {
        this.armor[slot] = null;
        if (this.onArmorBreak) this.onArmorBreak(slot, s.id);
      }
    }
  }

  heal(amount) {
    if (!this.alive || amount <= 0) return;
    this.health = clamp(this.health + amount, 0, MAX_HEALTH);
  }

  // Eat food: restores hunger. Returns true if it had any effect (so the caller
  // only consumes the item when eating actually helped).
  eat(amount) {
    if (isCreative()) return false; // hunger is pinned; nothing to restore
    if (!this.alive || amount <= 0) return false;
    if (this.hunger >= MAX_HUNGER) return false;
    this.hunger = clamp(this.hunger + amount, 0, MAX_HUNGER);
    this._setMessage('Ate food');
    return true;
  }

  respawn(player, spawn) {
    if (this.spawnPoint) {
      player.spawn(this.spawnPoint.x, this.spawnPoint.y, this.spawnPoint.z);
    } else {
      player.spawn(spawn.x + 0.5, spawn.h + 1 + 1.62 + 0.1, spawn.z + 0.5);
    }
    this.health = MAX_HEALTH;
    this.hunger = MAX_HUNGER;
    this.air = MAX_AIR;
    this.alive = true;
    this.damageFlash = 0;
    this._drownTimer = 0;
    this._starveTimer = 0;
    this._regenTimer = 0;
    this._contactTimer = 0;
    this.armor = { head: null, chest: null, legs: null, feet: null };
    this._setMessage('Respawned');
  }

  get ratios() {
    return {
      health: this.health / MAX_HEALTH,
      hunger: this.hunger / MAX_HUNGER,
      air: this.air / MAX_AIR,
    };
  }

  _updateAir(dt, player) {
    // Water breathing: air never drains (and refills as usual when surfaced).
    if (player.underwater && this.effects && this.effects.has('water_breathing')) {
      this._drownTimer = 0;
      return;
    }
    if (player.underwater) {
      this.air = clamp(this.air - dt, 0, MAX_AIR);
      if (this.air <= 0) {
        this._drownTimer += dt;
        if (this._drownTimer >= DROWN_DAMAGE_INTERVAL) {
          this._drownTimer = 0;
          this.damage(2, 'Drowning');
        }
      }
    } else {
      this.air = clamp(this.air + dt * 4, 0, MAX_AIR);
      this._drownTimer = 0;
    }
  }

  _updateHunger(dt, player) {
    let drain = HUNGER_IDLE;
    if (player.isMoving) drain += HUNGER_MOVE;
    if (player.isSprinting) drain += HUNGER_SPRINT;
    if (player.inWater && player.isMoving) drain += HUNGER_SWIM;
    this.hunger = clamp(this.hunger - drain * dt, 0, MAX_HUNGER);
    if (player.jumpedThisFrame) this.hunger = clamp(this.hunger - HUNGER_JUMP, 0, MAX_HUNGER);
  }

  _updateFallDamage(player) {
    if (!player.landedThisFrame) return;
    const excess = player.lastFallDistance - FALL_SAFE_DISTANCE;
    if (excess <= 0) return;
    this.damage(Math.min(18, Math.ceil(excess)), 'Fall damage');
  }

  _updateContactDamage(dt, player) {
    if (!player.world) return;
    const pos = player.getObject().position;
    const minX = Math.floor(pos.x - 0.32), maxX = Math.floor(pos.x + 0.32);
    const minY = Math.floor(pos.y - 1.62), maxY = Math.floor(pos.y + 0.1);
    const minZ = Math.floor(pos.z - 0.32), maxZ = Math.floor(pos.z + 0.32);
    let touchingCactus = false;
    let touchingLava = false;
    for (let x = minX; x <= maxX; x++) {
      for (let y = minY; y <= maxY; y++) {
        for (let z = minZ; z <= maxZ; z++) {
          const b = player.world.getBlock(x, y, z);
          if (b === BLOCK.CACTUS) touchingCactus = true;
          else if (b === BLOCK.LAVA) touchingLava = true;
        }
      }
    }
    if (touchingLava && !(this.effects && this.effects.has('fire_resistance'))) {
      this._lavaTimer = (this._lavaTimer || 0) + dt;
      if (this._lavaTimer >= 0.5) {
        this._lavaTimer = 0;
        this.damage(4, 'Burning in lava');
      }
    } else {
      this._lavaTimer = 0;
    }
    if (!touchingCactus) {
      this._contactTimer = 0;
      return;
    }
    this._contactTimer += dt;
    if (this._contactTimer >= CONTACT_DAMAGE_INTERVAL) {
      this._contactTimer = 0;
      this.damage(1, 'Cactus prick');
    }
  }

  _updateStarvation(dt) {
    if (this.hunger > 0) {
      this._starveTimer = 0;
      return;
    }
    this._starveTimer += dt;
    if (this._starveTimer >= STARVE_DAMAGE_INTERVAL) {
      this._starveTimer = 0;
      this.damage(1, 'Starving');
    }
  }

  _updateRegen(dt) {
    if (this.hunger < 16 || this.health >= MAX_HEALTH) {
      this._regenTimer = 0;
      return;
    }
    this._regenTimer += dt;
    if (this._regenTimer >= REGEN_INTERVAL) {
      this._regenTimer = 0;
      this.heal(1);
      this.hunger = clamp(this.hunger - 0.25, 0, MAX_HUNGER);
    }
  }

  _die(reason) {
    this.alive = false;
    this.health = 0;
    this._setMessage(reason || 'You died', 9999);
    if (this.onDeath) this.onDeath(reason);
  }

  _setMessage(text, seconds = 1.8) {
    this.message = text;
    this.messageTime = seconds;
  }
}
