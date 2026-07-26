// =============================================================================
// player.js — First-person controller: PointerLockControls for mouse look,
// WASD + sprint + gravity + jump, and axis-separated AABB voxel collision.
// =============================================================================

import * as THREE from 'three';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';
import { BLOCK, isSolid, isLiquid, isClimbable } from './config.js';
import { isCreative } from './gamemode.js';

const EYE = 1.62;       // camera height above the feet
const HALF_W = 0.3;     // half player width on X/Z (0.6 wide)
const HEIGHT = 1.8;     // full player height
const GRAVITY = 28;     // m/s^2
const WALK = 5;         // m/s
const SPRINT = 8;       // m/s
const JUMP = 9;         // m/s initial jump velocity
const STEP = 0.1;       // collision sub-step (< 1 block) to avoid tunnelling
const SWIM = 3.2;        // horizontal speed while swimming
const WATER_GRAVITY = 5; // gentler downward pull while in water
const WATER_DRAG = 0.18; // per-second velocity retention in water
const SWIM_UP = 13;      // upward acceleration while holding jump in water
const SWIM_DOWN = 9;     // downward acceleration while holding shift in water
const FLY_SPEED = WALK * 2.5;      // horizontal speed while creative-flying
const FLY_VERTICAL = 8;            // ascend/descend speed while flying
const FLY_DOUBLE_TAP_MS = 300;     // double-tap Space window to toggle flight

export class Player {
  constructor(camera, domElement, world) {
    this.world = world;
    this.camera = camera;
    this.controls = new PointerLockControls(camera, domElement);
    // The camera itself is the controlled object; its position is the EYE.
    this.object = camera;

    this.velocity = new THREE.Vector3();
    this.onGround = false;
    this.inWater = false;
    this.underwater = false;
    this.onLadder = false;
    this.isMoving = false;
    this.isSprinting = false;
    this.jumpedThisFrame = false;
    this.landedThisFrame = false;
    this.fallDistance = 0;
    this.lastFallDistance = 0;

    // Creative flight: double-tapping Space toggles it (creative mode only).
    this.flying = false;
    this._lastSpaceTap = -Infinity;

    this.keys = Object.create(null);
    document.addEventListener('keydown', (e) => {
      if (e.code === 'Space' && !e.repeat && !this.keys['Space'] && this.controls.isLocked) {
        const now = performance.now();
        if (isCreative() && now - this._lastSpaceTap < FLY_DOUBLE_TAP_MS) {
          this.flying = !this.flying;
          this.velocity.y = 0;
          this.fallDistance = 0;
          this._lastSpaceTap = -Infinity; // a third tap shouldn't re-toggle
        } else {
          this._lastSpaceTap = now;
        }
      }
      this.keys[e.code] = true;
    });
    document.addEventListener('keyup', (e) => { this.keys[e.code] = false; });

    // While riding a minecart, main.js drives the camera position and this
    // controller skips its own movement/physics.
    this.riding = null;

    // Phase 7: injected by main.js — the player's EffectManager (speed/
    // slowness scale movement) and the shield-blocking flag (30% speed).
    this.effects = null;
    this.blocking = false;

    this._forward = new THREE.Vector3();
    this._right = new THREE.Vector3();
    this._feet = new THREE.Vector3();
  }

  getObject() { return this.object; }

  // Set the EYE position directly.
  spawn(x, y, z) {
    this.object.position.set(x, y, z);
    this.velocity.set(0, 0, 0);
    this.onGround = false;
    this.fallDistance = 0;
    this.lastFallDistance = 0;
    this.landedThisFrame = false;
  }

  // Snapshot position + look direction for saving. Yaw/pitch are read from the
  // camera quaternion via a YXZ Euler (the order PointerLockControls uses).
  serialize() {
    const e = new THREE.Euler().setFromQuaternion(this.object.quaternion, 'YXZ');
    const p = this.object.position;
    return { x: p.x, y: p.y, z: p.z, yaw: e.y, pitch: e.x };
  }

  // Restore a snapshot produced by serialize(). The orientation persists until
  // the first mouse move, after which PointerLockControls continues from it.
  restore(s) {
    this.object.position.set(s.x, s.y, s.z);
    this.object.quaternion.setFromEuler(new THREE.Euler(s.pitch || 0, s.yaw || 0, 0, 'YXZ'));
    this.velocity.set(0, 0, 0);
    this.onGround = false;
  }

  // True if the player's AABB centred at feet (fx,fy,fz) overlaps any solid block.
  _collides(fx, fy, fz) {
    const minX = Math.floor(fx - HALF_W), maxX = Math.floor(fx + HALF_W);
    const minY = Math.floor(fy),          maxY = Math.floor(fy + HEIGHT);
    const minZ = Math.floor(fz - HALF_W), maxZ = Math.floor(fz + HALF_W);
    for (let bx = minX; bx <= maxX; bx++) {
      for (let by = minY; by <= maxY; by++) {
        for (let bz = minZ; bz <= maxZ; bz++) {
          if (isSolid(this.world.getBlock(bx, by, bz))) return true;
        }
      }
    }
    return false;
  }

  _isLiquidAt(x, y, z) {
    return isLiquid(this.world.getBlock(Math.floor(x), Math.floor(y), Math.floor(z)));
  }

  _updateFluidState() {
    const pos = this.object.position;
    const feetY = pos.y - EYE;
    this.inWater =
      this._isLiquidAt(pos.x, feetY + 0.2, pos.z) ||
      this._isLiquidAt(pos.x, feetY + 0.9, pos.z) ||
      this._isLiquidAt(pos.x, pos.y - 0.2, pos.z);
    this.underwater = this._isLiquidAt(pos.x, pos.y - 0.12, pos.z);
    const feetBlock = this.world.getBlock(Math.floor(pos.x), Math.floor(feetY + 0.1), Math.floor(pos.z));
    const bodyBlock = this.world.getBlock(Math.floor(pos.x), Math.floor(feetY + 0.9), Math.floor(pos.z));
    this.onLadder = isClimbable(feetBlock) || isClimbable(bodyBlock);
  }

  // Move `feet` along one axis by `delta`, stopping just before any solid block.
  // Returns true if movement was blocked.
  _moveAxis(feet, axis, delta) {
    if (delta === 0) return false;
    const steps = Math.max(1, Math.ceil(Math.abs(delta) / STEP));
    const inc = delta / steps;
    let blocked = false;
    for (let s = 0; s < steps; s++) {
      const prev = feet[axis];
      feet[axis] = prev + inc;
      if (this._collides(feet.x, feet.y, feet.z)) {
        feet[axis] = prev; // undo the step that entered a block
        blocked = true;
        break;
      }
    }
    return blocked;
  }

  update(dt) {
    this._updateFluidState();
    this.jumpedThisFrame = false;
    this.landedThisFrame = false;
    this.lastFallDistance = 0;
    this.isMoving = false;
    this.isSprinting = false;
    if (this.riding) { this.fallDistance = 0; return; }
    if (!this.controls.isLocked) return;
    const k = this.keys;

    // Leaving creative always clears flight.
    if (this.flying && !isCreative()) this.flying = false;

    // Horizontal movement relative to where the camera is facing (flattened).
    const shift = k['ShiftLeft'] || k['ShiftRight'];
    let speed = this.flying ? FLY_SPEED : this.inWater ? SWIM : (shift ? SPRINT : WALK);
    // Soul sand drags anything walking over it.
    const pos0 = this.object.position;
    if (this.world.getBlock(Math.floor(pos0.x), Math.floor(pos0.y - EYE - 0.1), Math.floor(pos0.z)) === BLOCK.SOUL_SAND) {
      speed *= 0.45;
    }
    // Status effects scale ground/swim movement (never creative flight):
    // +20% per Speed level, -15% per Slowness level.
    if (!this.flying && this.effects) {
      const mul = 1 + 0.2 * this.effects.level('speed') - 0.15 * this.effects.level('slowness');
      speed *= Math.max(0.1, mul);
    }
    // Raising a shield slows the player to 30% while blocking.
    if (!this.flying && this.blocking) speed *= 0.3;
    this._forward.set(0, 0, -1).applyQuaternion(this.camera.quaternion);
    this._forward.y = 0; this._forward.normalize();
    this._right.set(1, 0, 0).applyQuaternion(this.camera.quaternion);
    this._right.y = 0; this._right.normalize();

    let mx = 0, mz = 0;
    if (k['KeyW']) { mx += this._forward.x; mz += this._forward.z; }
    if (k['KeyS']) { mx -= this._forward.x; mz -= this._forward.z; }
    if (k['KeyD']) { mx += this._right.x;   mz += this._right.z; }
    if (k['KeyA']) { mx -= this._right.x;   mz -= this._right.z; }
    const len = Math.hypot(mx, mz);
    this.isMoving = len > 0;
    this.isSprinting = !this.inWater && !this.flying && shift && this.isMoving;
    if (len > 0) { mx = (mx / len) * speed; mz = (mz / len) * speed; }
    this.velocity.x = mx;
    this.velocity.z = mz;

    // Gravity + jump/swim/ladder (or creative flight, which overrides all).
    if (this.flying) {
      // No gravity: Space ascends, Shift descends, otherwise hover.
      this.velocity.y = k['Space'] ? FLY_VERTICAL : shift ? -FLY_VERTICAL : 0;
      this.onGround = false;
      this.fallDistance = 0;
    } else if (this.onLadder) {
      this.velocity.y *= 0.2;
      if (k['Space']) this.velocity.y = 4.5;
      else if (shift) this.velocity.y = -4.5;
      else this.velocity.y = Math.max(this.velocity.y, -1.5);
      this.fallDistance = 0;
    } else if (this.inWater) {
      this.velocity.y -= WATER_GRAVITY * dt;
      this.velocity.y *= Math.pow(WATER_DRAG, dt);
      if (k['Space']) this.velocity.y += SWIM_UP * dt;
      if (shift) this.velocity.y -= SWIM_DOWN * dt;
      if (this.velocity.y < -2.2) this.velocity.y = -2.2;
      if (this.velocity.y > 3.8) this.velocity.y = 3.8;
      this.onGround = false;
    } else {
      this.velocity.y -= GRAVITY * dt;
      if (k['Space'] && this.onGround) {
        this.velocity.y = JUMP;
        this.onGround = false;
        this.jumpedThisFrame = true;
        this.fallDistance = 0;
      }
    }

    // Integrate with collision, working in FEET coordinates.
    const pos = this.object.position;
    const feet = this._feet.set(pos.x, pos.y - EYE, pos.z);
    const prevFeetY = feet.y;

    this._moveAxis(feet, 'x', this.velocity.x * dt);
    this._moveAxis(feet, 'z', this.velocity.z * dt);
    const vyBeforeMove = this.velocity.y;
    const hitY = this._moveAxis(feet, 'y', this.velocity.y * dt);
    // Fall distance never accumulates in creative (no fall damage, no thumps).
    if (!this.inWater && feet.y < prevFeetY && !isCreative()) this.fallDistance += prevFeetY - feet.y;
    if (hitY) {
      this.onGround = vyBeforeMove < 0; // blocked while descending = standing
      if (this.onGround && !this.inWater) {
        this.landedThisFrame = true;
        this.lastFallDistance = this.fallDistance;
        if (this.flying) this.flying = false; // landing ends flight
      }
      this.velocity.y = 0;
      this.fallDistance = 0;
    } else {
      this.onGround = false;
    }
    if (this.inWater) this.fallDistance = 0;

    pos.set(feet.x, feet.y + EYE, feet.z);
    this._updateFluidState();
  }
}
