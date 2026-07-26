// =============================================================================
// xp.js - Experience points, leveling, and enchanting system.
// =============================================================================

import * as THREE from 'three';
import { xpForLevel, ENCHANTMENTS, isEnchantable, ITEMS } from './config.js';

// Shared glowing-orb sprite texture (radial green/yellow gradient).
let orbTexture = null;
function getOrbTexture() {
  if (orbTexture) return orbTexture;
  const canvas = document.createElement('canvas');
  canvas.width = 32;
  canvas.height = 32;
  const ctx = canvas.getContext('2d');
  const g = ctx.createRadialGradient(16, 16, 1, 16, 16, 16);
  g.addColorStop(0, 'rgba(240,255,160,1)');
  g.addColorStop(0.35, 'rgba(170,240,60,0.9)');
  g.addColorStop(0.7, 'rgba(90,200,40,0.35)');
  g.addColorStop(1, 'rgba(60,180,30,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 32, 32);
  orbTexture = new THREE.CanvasTexture(canvas);
  return orbTexture;
}

export class XPManager {
  constructor(scene = null, state = null) {
    this.scene = scene;
    this.level = 0;
    this.xp = 0;
    this.xpToNext = xpForLevel(0);
    this.orbs = [];
    this._orbId = 0;
    this._orbMaterial = null;
    if (state) this.restore(state);
  }

  _makeSprite() {
    if (!this.scene) return null;
    if (!this._orbMaterial) {
      this._orbMaterial = new THREE.SpriteMaterial({
        map: getOrbTexture(),
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      });
    }
    const sprite = new THREE.Sprite(this._orbMaterial);
    this.scene.add(sprite);
    return sprite;
  }

  addXP(amount) {
    if (amount <= 0) return;
    this.xp += amount;
    this.leveledUp = false;
    while (this.xp >= this.xpToNext) {
      this.xp -= this.xpToNext;
      this.level++;
      this.xpToNext = xpForLevel(this.level);
      this.leveledUp = true;
    }
  }

  get ratio() {
    return this.xpToNext > 0 ? this.xp / this.xpToNext : 0;
  }

  spawnOrb(pos, amount) {
    const sprite = this._makeSprite();
    if (sprite) {
      sprite.position.set(pos.x, pos.y, pos.z);
      sprite.scale.setScalar(0.22 + Math.min(0.2, amount * 0.03));
    }
    this.orbs.push({ id: this._orbId++, x: pos.x, y: pos.y, z: pos.z, xp: amount, life: 0, sprite });
  }

  _removeOrb(i) {
    const orb = this.orbs[i];
    if (orb.sprite && this.scene) this.scene.remove(orb.sprite);
    this.orbs.splice(i, 1);
  }

  update(dt, playerPos) {
    let gained = 0;
    for (let i = this.orbs.length - 1; i >= 0; i--) {
      const orb = this.orbs[i];
      orb.life += dt;
      orb.y += Math.sin(orb.life * 3) * dt * 0.3;
      const dx = playerPos.x - orb.x;
      const dy = playerPos.y - 1 - orb.y;
      const dz = playerPos.z - orb.z;
      const dist = Math.hypot(dx, dy, dz);
      if (dist < 1.8) {
        const pull = Math.min(1, dt * 6);
        orb.x += dx * pull;
        orb.y += dy * pull;
        orb.z += dz * pull;
      }
      if (orb.sprite) orb.sprite.position.set(orb.x, orb.y, orb.z);
      if (dist < 0.8) {
        gained += orb.xp;
        this._removeOrb(i);
        continue;
      }
      if (orb.life > 30) {
        this._removeOrb(i);
      }
    }
    if (gained > 0) this.addXP(gained);
    return gained > 0;
  }

  getAvailableEnchantments(itemId) {
    if (!isEnchantable(itemId)) return [];
    const it = ITEMS[itemId];
    const results = [];
    for (const [key, ench] of Object.entries(ENCHANTMENTS)) {
      if (ench.slot === 'any' ||
          (ench.slot === 'weapon' && it.damage) ||
          (ench.slot === 'tool' && it.tool) ||
          (ench.slot === 'armor' && it.armor)) {
        results.push({ key, ...ench });
      }
    }
    return results;
  }

  enchant(stack, enchKey) {
    const ench = ENCHANTMENTS[enchKey];
    if (!ench) return false;
    if (this.level < 3) return false;
    if (!stack.enchantments) stack.enchantments = {};
    const curLevel = stack.enchantments[enchKey] || 0;
    if (curLevel >= ench.maxLevel) return false;
    stack.enchantments[enchKey] = curLevel + 1;
    this.level = Math.max(0, this.level - 3);
    this.xp = 0;
    this.xpToNext = xpForLevel(this.level);
    return true;
  }

  serialize() {
    return { level: this.level, xp: this.xp };
  }

  restore(state) {
    if (!state) return;
    this.level = state.level || 0;
    this.xp = state.xp || 0;
    this.xpToNext = xpForLevel(this.level);
  }
}
