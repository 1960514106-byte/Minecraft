// =============================================================================
// survival.js - Player survival state: health, hunger, air, damage and respawn.
// The player controller reports movement/landing/water state; this module owns
// the gameplay rules that turn those signals into survival consequences.
// =============================================================================

import { BLOCK, armorPoints } from './config.js';

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

    this._updateAir(dt, player);
    this._updateHunger(dt, player);
    this._updateFallDamage(player);
    this._updateContactDamage(dt, player);
    this._updateStarvation(dt);
    this._updateRegen(dt);
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

  damage(amount, reason) {
    if (!this.alive || amount <= 0) return;
    let reduced = amount;
    if (reason !== 'Starving') {
      const reduction = Math.min(0.6, this.armorTotal() * 0.04);
      reduced = Math.max(1, amount * (1 - reduction));
    }
    this.health = clamp(this.health - reduced, 0, MAX_HEALTH);
    this.damageFlash = 1;
    this._setMessage(reason);
    if (this.health <= 0) this._die(reason);
  }

  heal(amount) {
    if (!this.alive || amount <= 0) return;
    this.health = clamp(this.health + amount, 0, MAX_HEALTH);
  }

  // Eat food: restores hunger. Returns true if it had any effect (so the caller
  // only consumes the item when eating actually helped).
  eat(amount) {
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
    if (touchingLava) {
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
  }

  _setMessage(text, seconds = 1.8) {
    this.message = text;
    this.messageTime = seconds;
  }
}
