// =============================================================================
// drops.js - Lightweight dropped-item entities with simple gravity and pickup.
// =============================================================================

import * as THREE from 'three';
import { ATLAS_COLS, ATLAS_ROWS, itemDef, isSolid } from './config.js';

const GRAVITY = 18;
const PICKUP_RADIUS = 1.85;
const DESPAWN_AGE = 300;

export class DropManager {
  constructor(scene, world, atlasTexture, state = null) {
    this.scene = scene;
    this.world = world;
    this.atlas = atlasTexture;
    this.drops = [];
    this.materials = new Map();
    if (Array.isArray(state)) {
      for (const d of state) {
        if (d && Number.isFinite(d.id) && Number.isFinite(d.count)) {
          this.spawn(d.id | 0, d.count | 0, new THREE.Vector3(d.x || 0, d.y || 0, d.z || 0), true);
        }
      }
    }
  }

  materialFor(id) {
    let mat = this.materials.get(id);
    if (mat) return mat;

    const tile = itemDef(id).tile;
    const col = tile % ATLAS_COLS;
    const row = Math.floor(tile / ATLAS_COLS);
    const tex = this.atlas.clone();
    tex.repeat.set(1 / ATLAS_COLS, 1 / ATLAS_ROWS);
    tex.offset.set(col / ATLAS_COLS, 1 - (row + 1) / ATLAS_ROWS);
    tex.needsUpdate = true;

    mat = new THREE.SpriteMaterial({
      map: tex,
      transparent: true,
      alphaTest: 0.08,
      depthWrite: true,
    });
    this.materials.set(id, mat);
    return mat;
  }

  spawn(id, count, pos, quiet = false) {
    if (!count || count <= 0) return;
    const sprite = new THREE.Sprite(this.materialFor(id));
    sprite.position.copy(pos);
    sprite.scale.setScalar(0.42);
    this.scene.add(sprite);

    const jitter = quiet ? 0 : 1;
    this.drops.push({
      id,
      count,
      sprite,
      velocity: new THREE.Vector3((Math.random() - 0.5) * jitter, quiet ? 0 : 2.4, (Math.random() - 0.5) * jitter),
      age: 0,
    });
  }

  removeAt(i) {
    const d = this.drops[i];
    this.scene.remove(d.sprite);
    this.drops.splice(i, 1);
  }

  update(dt, playerPos, inventory) {
    let inventoryChanged = false;
    this.lastPickedUp = [];
    for (let i = this.drops.length - 1; i >= 0; i--) {
      const d = this.drops[i];
      d.age += dt;
      if (d.age > DESPAWN_AGE) {
        this.removeAt(i);
        continue;
      }

      const p = d.sprite.position;
      d.velocity.y -= GRAVITY * dt;
      p.addScaledVector(d.velocity, dt);
      d.sprite.rotation.z += dt * 1.8;

      const below = this.world.getBlock(Math.floor(p.x), Math.floor(p.y - 0.26), Math.floor(p.z));
      if (isSolid(below)) {
        p.y = Math.floor(p.y - 0.26) + 1.26;
        d.velocity.y = 0;
        d.velocity.x *= Math.pow(0.12, dt);
        d.velocity.z *= Math.pow(0.12, dt);
      }

      if (p.distanceTo(playerPos) <= PICKUP_RADIUS) {
        const remaining = inventory.add(d.id, d.count);
        if (remaining !== d.count) {
          inventoryChanged = true;
          this.lastPickedUp.push(d.id);
        }
        if (remaining <= 0) this.removeAt(i);
        else d.count = remaining;
      }
    }
    return inventoryChanged;
  }

  serialize() {
    return this.drops.map((d) => ({
      id: d.id,
      count: d.count,
      x: d.sprite.position.x,
      y: d.sprite.position.y,
      z: d.sprite.position.z,
    }));
  }
}
