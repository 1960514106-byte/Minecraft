// =============================================================================
// boat.js — Rideable boat entities that float on water (mirrors minecart.js).
//
// A boat is a free (x, y, z) body with a horizontal velocity (vx, vz) and a
// visual yaw. On water it bobs at the surface and WASD (fed by main.js as a
// camera-relative direction via drive()) accelerates it up to ~5.5 m/s with
// drag when there is no input. It collides with solid blocks horizontally and
// runs aground (very slow) when it ends up on land. Riding is orchestrated by
// main.js exactly like minecarts: it parks the player's physics and pins the
// camera above the hull.
// =============================================================================

import * as THREE from 'three';
import { BLOCK, CHUNK_HEIGHT, isSolid } from './config.js';

const MAX_SPEED = 5.5;       // m/s on water
const ACCEL = 8;             // m/s^2 under rider input
const WATER_DRAG = 0.5;      // per-second velocity retention loss on water
const GROUND_DRAG = 0.999;   // aground: nearly instant stop
const GROUND_SPEED = 0.7;    // hard cap while aground
const GRAVITY = 16;
const FLOAT_OFFSET = 0.55;   // hull-bottom height above the top water cell's base
const HULL_RADIUS = 0.55;    // horizontal collision radius

let hullMat = null;
let trimMat = null;
let benchMat = null;

function makeBoatMesh() {
  if (!hullMat) {
    hullMat = new THREE.MeshLambertMaterial({ color: 0x8a6234 });
    trimMat = new THREE.MeshLambertMaterial({ color: 0x5e421f });
    benchMat = new THREE.MeshLambertMaterial({ color: 0x74522a });
  }
  const g = new THREE.Group();
  const bottom = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.14, 1.7), trimMat);
  bottom.position.y = 0.07;
  g.add(bottom);
  const sideL = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.36, 1.7), hullMat);
  sideL.position.set(-0.48, 0.3, 0);
  g.add(sideL);
  const sideR = sideL.clone();
  sideR.position.x = 0.48;
  g.add(sideR);
  const bow = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.36, 0.16), hullMat);
  bow.position.set(0, 0.3, -0.77);
  g.add(bow);
  const stern = bow.clone();
  stern.position.z = 0.77;
  g.add(stern);
  // A low bench suggests the hollow interior.
  const bench = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.1, 0.3), benchMat);
  bench.position.set(0, 0.24, 0.25);
  g.add(bench);
  return g;
}

export class BoatManager {
  constructor(scene, world, state = null) {
    this.scene = scene;
    this.world = world;
    this.boats = [];
    if (Array.isArray(state)) {
      for (const b of state) {
        if (b && Number.isFinite(b.x) && Number.isFinite(b.z)) {
          const boat = this._add(b.x, Number.isFinite(b.y) ? b.y : 30, b.z);
          boat.yaw = b.yaw || 0;
          boat.vx = b.vx || 0;
          boat.vz = b.vz || 0;
        }
      }
    }
  }

  _add(x, y, z) {
    const mesh = makeBoatMesh();
    this.scene.add(mesh);
    const boat = { mesh, x, y, z, vx: 0, vz: 0, vy: 0, yaw: 0, ridden: false };
    this.boats.push(boat);
    return boat;
  }

  // Highest water cell in the column, or -1 if the column is dry.
  waterTopY(x, z) {
    const bx = Math.floor(x), bz = Math.floor(z);
    for (let y = CHUNK_HEIGHT - 1; y >= 0; y--) {
      if (this.world.getBlock(bx, y, bz) === BLOCK.WATER) return y;
    }
    return -1;
  }

  // Place a boat on the water surface of the column containing (x, z).
  spawn(x, z) {
    const wy = this.waterTopY(x, z);
    if (wy < 0) return null;
    const boat = this._add(x, wy + FLOAT_OFFSET, z);
    return boat;
  }

  remove(boat) {
    const i = this.boats.indexOf(boat);
    if (i >= 0) {
      this.scene.remove(boat.mesh);
      this.boats.splice(i, 1);
    }
  }

  // Nearest boat within maxDist of a position (for right-click mounting).
  nearest(pos, maxDist = 3) {
    let best = null, bestD = maxDist;
    for (const b of this.boats) {
      const d = Math.hypot(b.x - pos.x, (b.y + 0.4) - pos.y, b.z - pos.z);
      if (d < bestD) { best = b; bestD = d; }
    }
    return best;
  }

  // Cheap ray test (closest approach to the hull centre) so a punch can pop
  // the boat back into an item, like minecart mounting's proximity checks.
  raycast(origin, dir, maxDist) {
    let best = null;
    for (const b of this.boats) {
      const cx = b.x - origin.x, cy = (b.y + 0.3) - origin.y, cz = b.z - origin.z;
      const t = cx * dir.x + cy * dir.y + cz * dir.z;
      if (t < 0 || t > maxDist) continue;
      const px = origin.x + dir.x * t, py = origin.y + dir.y * t, pz = origin.z + dir.z * t;
      const d = Math.hypot(b.x - px, (b.y + 0.3) - py, b.z - pz);
      if (d < 0.9 && (!best || t < best.distance)) best = { boat: b, distance: t };
    }
    return best;
  }

  _inWater(boat) {
    const bx = Math.floor(boat.x), bz = Math.floor(boat.z);
    const by = Math.floor(boat.y + 0.05);
    return this.world.getBlock(bx, by, bz) === BLOCK.WATER ||
           this.world.getBlock(bx, by - 1, bz) === BLOCK.WATER;
  }

  // Rider input: (ix, iz) is a camera-relative unit direction from main.js.
  drive(boat, ix, iz, dt) {
    const inWater = this._inWater(boat);
    const a = inWater ? ACCEL : ACCEL * 0.15; // aground: barely budges
    boat.vx += ix * a * dt;
    boat.vz += iz * a * dt;
  }

  update(dt, playerPos) {
    for (const boat of this.boats) {
      const bx = Math.floor(boat.x), bz = Math.floor(boat.z);
      const wy = this.waterTopY(boat.x, boat.z);
      const onWater = wy >= 0 && boat.y <= wy + 1.4;

      if (onWater) {
        // Float: ease toward the surface line and bob very slightly.
        const target = wy + FLOAT_OFFSET;
        boat.y += (target - boat.y) * Math.min(1, dt * 6);
        boat.vy = 0;
      } else {
        // Airborne / aground: fall and settle onto the first solid block.
        boat.vy -= GRAVITY * dt;
        let ny = boat.y + boat.vy * dt;
        const floorY = Math.floor(ny - 0.02);
        if (isSolid(this.world.getBlock(bx, floorY, bz))) {
          ny = floorY + 1;
          boat.vy = 0;
        }
        boat.y = ny;
      }

      // Drag + speed caps. On land the boat is effectively beached.
      const drag = onWater ? WATER_DRAG : GROUND_DRAG;
      const keep = Math.pow(1 - drag, dt);
      boat.vx *= keep;
      boat.vz *= keep;
      const cap = onWater ? MAX_SPEED : GROUND_SPEED;
      const sp = Math.hypot(boat.vx, boat.vz);
      if (sp > cap) { boat.vx *= cap / sp; boat.vz *= cap / sp; }
      if (sp < 0.02) { boat.vx = 0; boat.vz = 0; }

      // Horizontal movement with solid-block collision (axis separated).
      const blockedAt = (x, z) => {
        const cy0 = Math.floor(boat.y + 0.1);
        const cy1 = Math.floor(boat.y + 0.6);
        for (const [ox, oz] of [[HULL_RADIUS, 0], [-HULL_RADIUS, 0], [0, HULL_RADIUS], [0, -HULL_RADIUS]]) {
          if (isSolid(this.world.getBlock(Math.floor(x + ox), cy0, Math.floor(z + oz))) ||
              isSolid(this.world.getBlock(Math.floor(x + ox), cy1, Math.floor(z + oz)))) return true;
        }
        return false;
      };
      const nx = boat.x + boat.vx * dt;
      if (blockedAt(nx, boat.z)) boat.vx = 0;
      else boat.x = nx;
      const nz = boat.z + boat.vz * dt;
      if (blockedAt(boat.x, nz)) boat.vz = 0;
      else boat.z = nz;

      // Point the bow along the motion.
      if (sp > 0.35) {
        const targetYaw = Math.atan2(boat.vx, boat.vz) + Math.PI;
        let d = targetYaw - boat.yaw;
        while (d > Math.PI) d -= 2 * Math.PI;
        while (d < -Math.PI) d += 2 * Math.PI;
        boat.yaw += d * Math.min(1, dt * 6);
      }

      // An unridden boat nudged by the player drifts away slightly.
      if (playerPos && !boat.ridden) {
        const dx = boat.x - playerPos.x, dz = boat.z - playerPos.z;
        const d = Math.hypot(dx, dz);
        if (d > 0.001 && d < 1.0 && Math.abs(playerPos.y - (boat.y + 1.2)) < 2) {
          boat.vx += (dx / d) * 1.5 * dt * 10;
          boat.vz += (dz / d) * 1.5 * dt * 10;
        }
      }

      boat.mesh.position.set(boat.x, boat.y, boat.z);
      boat.mesh.rotation.y = boat.yaw;
    }
  }

  serialize() {
    return this.boats.map((b) => ({
      x: b.x, y: b.y, z: b.z, yaw: b.yaw, vx: b.vx, vz: b.vz,
    }));
  }
}
