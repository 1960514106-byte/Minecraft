// =============================================================================
// minecart.js — Rideable minecart entities with rail-following physics.
//
// A cart lives on the rail grid: continuous (x,z) position, a rail Y level, a
// signed scalar speed `v` and a unit axis direction `dir` ([±1,0] or [0,±1]).
// Movement advances in small sub-steps; at every cell crossing the cart looks
// for the next rail at the same level, one up (slope) or one down. Curves turn
// the direction 90°. Powered rails (ON) boost toward max speed, unpowered
// powered rails brake hard, plain rails apply rolling friction.
//
// Riding is orchestrated by main.js: it parks the player's movement and pins
// the camera to `cart.visualY`; WASD nudges `v` via push().
// =============================================================================

import * as THREE from 'three';
import { BLOCK, isRail, isSolid } from './config.js';

const MAX_SPEED = 8;
const BOOST_ACCEL = 6;      // powered-rail acceleration (m/s^2)
const FRICTION = 0.35;      // per-second speed retention loss
const SLOPE_KICK = 1.6;     // speed change when the track steps up/down
const HIT_SPEED = 3;        // carts faster than this hurt mobs they hit

let cartGeo = null;
let cartMat = null;
let cartInner = null;

function makeCartMesh() {
  if (!cartGeo) {
    cartGeo = new THREE.BoxGeometry(0.85, 0.42, 1.2);
    cartMat = new THREE.MeshLambertMaterial({ color: 0x9a9aa2 });
    cartInner = new THREE.MeshLambertMaterial({ color: 0x4a4a50 });
  }
  const g = new THREE.Group();
  const body = new THREE.Mesh(cartGeo, cartMat);
  body.position.y = 0.21;
  g.add(body);
  const inner = new THREE.Mesh(new THREE.BoxGeometry(0.65, 0.3, 1.0), cartInner);
  inner.position.y = 0.32;
  g.add(inner);
  return g;
}

export class MinecartManager {
  constructor(scene, world, state = null) {
    this.scene = scene;
    this.world = world;
    this.carts = [];
    if (Array.isArray(state)) {
      for (const c of state) {
        if (c && Number.isFinite(c.x) && Number.isFinite(c.z)) {
          const cart = this.spawn(c.x, c.railY ?? Math.floor(c.y || 0), c.z);
          if (cart) {
            cart.v = c.v || 0;
            if (Array.isArray(c.dir)) cart.dir = [c.dir[0] || 0, c.dir[1] || 0];
          }
        }
      }
    }
  }

  // Place a cart centred on the rail cell containing (x, z) at rail level y.
  spawn(x, railY, z) {
    const bx = Math.floor(x), bz = Math.floor(z);
    if (!isRail(this.world.getBlock(bx, railY, bz))) return null;
    const mesh = makeCartMesh();
    this.scene.add(mesh);
    // Initial direction from the rail's connections.
    const dirs = this._railDirs(bx, railY, bz);
    const dir = dirs.length ? dirs[0] : [1, 0];
    const cart = {
      mesh,
      x: bx + 0.5, z: bz + 0.5,
      railY,
      visualY: railY + 0.06,
      v: 0,
      dir,
      ridden: false,
    };
    this.carts.push(cart);
    return cart;
  }

  remove(cart) {
    const i = this.carts.indexOf(cart);
    if (i >= 0) {
      this.scene.remove(cart.mesh);
      this.carts.splice(i, 1);
    }
  }

  // Nearest cart within maxDist of a position (for right-click mounting).
  nearest(pos, maxDist = 3) {
    let best = null, bestD = maxDist;
    for (const c of this.carts) {
      const d = Math.hypot(c.x - pos.x, (c.railY + 0.5) - pos.y, c.z - pos.z);
      if (d < bestD) { best = c; bestD = d; }
    }
    return best;
  }

  // Rider input: accelerate along the cart's axis. sign > 0 = forward.
  push(cart, sign, dt) {
    cart.v += sign * 5 * dt;
    if (Math.abs(cart.v) > MAX_SPEED) cart.v = Math.sign(cart.v) * MAX_SPEED;
  }

  // Which axis directions does the rail at (x,y,z) connect to?
  _railDirs(x, y, z) {
    const dirs = [];
    for (const [dx, dz] of [[0, -1], [0, 1], [-1, 0], [1, 0]]) {
      for (const dy of [0, 1, -1]) {
        if (isRail(this.world.getBlock(x + dx, y + dy, z + dz))) {
          dirs.push([dx, dz]);
          break;
        }
      }
    }
    return dirs;
  }

  _derail(cart) {
    // Slide off the track: settle onto the first solid block below.
    let y = cart.railY;
    while (y > 1 && !isSolid(this.world.getBlock(Math.floor(cart.x), y - 1, Math.floor(cart.z)))) y--;
    cart.railY = y;
    cart.v = 0;
  }

  // Try to follow a curve out of cell (bx, ry, bz): pick a connected direction
  // perpendicular to the current one. Returns true if the cart turned.
  _tryTurn(cart, bx, ry, bz) {
    const dirs = this._railDirs(bx, ry, bz);
    for (const [dx, dz] of dirs) {
      if (dx === -cart.dir[0] && dz === -cart.dir[1]) continue; // came from there
      if (dx === cart.dir[0] && dz === cart.dir[1]) continue;   // straight (no rail found there)
      cart.dir = [dx, dz];
      cart.x = bx + 0.5;
      cart.z = bz + 0.5;
      return true;
    }
    return false;
  }

  // Advance a cart `dist` blocks along the track, handling crossings.
  _step(cart, dist) {
    let remaining = dist;
    let guard = 64;
    while (remaining > 0.0005 && guard-- > 0) {
      const bx = Math.floor(cart.x), bz = Math.floor(cart.z);
      let ry = cart.railY;
      if (!isRail(this.world.getBlock(bx, ry, bz))) {
        if (isRail(this.world.getBlock(bx, ry - 1, bz))) { cart.railY = --ry; }
        else if (isRail(this.world.getBlock(bx, ry + 1, bz))) { cart.railY = ++ry; }
        else { this._derail(cart); return; }
      }
      // Hug the centre line of the track.
      if (cart.dir[0] !== 0) cart.z = bz + 0.5;
      else cart.x = bx + 0.5;

      const bound = cart.dir[0] > 0 ? (bx + 1 - cart.x)
        : cart.dir[0] < 0 ? (cart.x - bx)
        : cart.dir[1] > 0 ? (bz + 1 - cart.z)
        : (cart.z - bz);
      const stepLen = Math.min(remaining, Math.max(bound, 0) + 0.002);
      cart.x += cart.dir[0] * stepLen;
      cart.z += cart.dir[1] * stepLen;
      remaining -= stepLen;

      const nbx = Math.floor(cart.x), nbz = Math.floor(cart.z);
      if (nbx !== bx || nbz !== bz) {
        if (isRail(this.world.getBlock(nbx, ry, nbz))) {
          // level crossing — nothing to do
        } else if (isRail(this.world.getBlock(nbx, ry + 1, nbz))) {
          cart.railY = ry + 1;
          cart.v -= Math.sign(cart.v) * SLOPE_KICK * 0.5; // uphill costs speed
        } else if (isRail(this.world.getBlock(nbx, ry - 1, nbz))) {
          cart.railY = ry - 1;
          cart.v += Math.sign(cart.v) * SLOPE_KICK;       // downhill gains speed
        } else {
          // No rail ahead: maybe the cell we just left was a curve.
          cart.x -= cart.dir[0] * (stepLen + 0.01);
          cart.z -= cart.dir[1] * (stepLen + 0.01);
          if (!this._tryTurn(cart, bx, ry, bz)) {
            cart.v = 0;
            return;
          }
        }
      }
    }
  }

  // Returns events: [{ type: 'hitMob', mob, damage }]
  update(dt, playerPos, mobs = []) {
    const events = [];
    for (const cart of this.carts) {
      const bx = Math.floor(cart.x), bz = Math.floor(cart.z);
      const railBlock = this.world.getBlock(bx, cart.railY, bz);

      // Track forces.
      if (railBlock === BLOCK.POWERED_RAIL_ON) {
        const sign = cart.v === 0 ? (cart.ridden ? 0 : 1) : Math.sign(cart.v);
        if (sign !== 0) {
          cart.v += sign * BOOST_ACCEL * dt;
          if (Math.abs(cart.v) > MAX_SPEED) cart.v = Math.sign(cart.v) * MAX_SPEED;
        }
      } else if (railBlock === BLOCK.POWERED_RAIL) {
        cart.v *= Math.pow(0.02, dt); // unpowered booster = brake
      }
      cart.v *= Math.pow(1 - FRICTION, dt);
      if (Math.abs(cart.v) < 0.02) cart.v = 0;

      // A player walking into a stationary/slow cart shoves it along its axis.
      if (playerPos && !cart.ridden) {
        const dx = cart.x - playerPos.x;
        const dz = cart.z - playerPos.z;
        const d = Math.hypot(dx, dz);
        if (d < 1.1 && Math.abs(playerPos.y - (cart.railY + 1.2)) < 1.8) {
          const along = dx * cart.dir[0] + dz * cart.dir[1];
          if (Math.abs(along) > 0.1) {
            const sign = Math.sign(along);
            if (Math.abs(cart.v) < 2) cart.v = sign * 2;
          }
        }
      }

      // v is kept non-negative; reversing flips `dir` instead (push() may
      // briefly make it negative).
      if (cart.v < 0) {
        cart.dir = [-cart.dir[0], -cart.dir[1]];
        cart.v = -cart.v;
      }
      if (cart.v !== 0) this._step(cart, cart.v * dt);

      // Fast carts bump mobs.
      if (Math.abs(cart.v) > HIT_SPEED) {
        for (const m of mobs) {
          const md = Math.hypot(m.mesh.position.x - cart.x, m.mesh.position.z - cart.z);
          if (md < 1.0 && Math.abs(m.mesh.position.y - cart.railY) < 1.5) {
            events.push({ type: 'hitMob', mob: m, damage: 4, pos: new THREE.Vector3(cart.x, cart.railY + 0.5, cart.z) });
          }
        }
      }

      // Smooth the visual height across slope steps.
      const targetY = cart.railY + 0.06;
      cart.visualY += (targetY - cart.visualY) * Math.min(1, dt * 12);
      cart.mesh.position.set(cart.x, cart.visualY, cart.z);
      cart.mesh.rotation.y = cart.dir[0] !== 0 ? Math.PI / 2 : 0;
    }
    return events;
  }

  serialize() {
    return this.carts.map((c) => ({
      x: c.x, y: c.railY, z: c.z, railY: c.railY, v: c.v, dir: c.dir,
    }));
  }
}
